import json
import time
import os
import sys
import threading
import random
from queue import Queue, Empty
from collections import deque
from flask import Flask, request, jsonify, Response
from flask_cors import CORS

# 핵심 함수들 가져오기
from els_bot import login_and_prepare, solve_input_and_search, scrape_hyper_verify, run_els_process, close_modals, is_session_valid, open_els_menu
import re
import pandas as pd

app = Flask(__name__)
CORS(app)

class DriverPool:
    def __init__(self):
        self.drivers = []
        # [수정] RLock(Reentrant Lock)을 사용하여 동일 쓰레드 내 중복 잠금 허용 (데드락 방지)
        self.lock = threading.RLock()
        self.available_queue = Queue()
        self.current_user = {"id": None, "pw": None, "show_browser": False}
        self.is_logging_in = False 
        self.max_drivers = int(os.environ.get("ELS_MAX_DRIVERS", 3))
        self.daemon_id = os.environ.get("ELS_DAEMON_ID", "1") # [추가] 데몬 식별 ID (기본값 1)
        self.active_init_threads = 0 
        self.log_buffer = deque(maxlen=300)
        self.consecutive_login_failures = 0 
        self.last_failure_time = 0 # [추가] 마지막 로그인 실패 시점 기록
        self.fail_cooldown = 600 # [추가] 10분 쿨타임 (초)

    def add_log(self, msg):
        from datetime import datetime, timezone, timedelta
        kst = timezone(timedelta(hours=9))
        ts = datetime.now(kst).strftime("%H:%M:%S")
        # [수정] 로그에 데몬 ID를 포함하여 여러 데몬 운영 시 원인 파악 용이하게 개선
        formatted = f"[{ts}][D#{self.daemon_id}] {msg}"
        with self.lock:
            self.log_buffer.append(formatted)
        print(formatted)

    def clear(self):
        with self.lock:
            while not self.available_queue.empty():
                try: self.available_queue.get_nowait()
                except: break
            for d in self.drivers:
                try: d.quit()
                except: pass
            self.drivers = []
            self.consecutive_login_failures = 0
            self.log_buffer.clear()
            self.add_log("--- 드라이버 풀이 초기화되었습니다. ---")

    def is_same_user(self, u_id, show_browser):
        if not self.current_user:
            return False
        return self.current_user["id"] == u_id and self.current_user["show_browser"] == show_browser

    def cleanup_lingering_chrome(self, port):
        """[추가] 해당 포트를 사용 중인 크롬 프로세스를 강제 종료하여 충돌 방지"""
        import subprocess
        try:
            # Linux 환경 (fuser 사용)
            subprocess.run(["fuser", "-k", f"{port}/tcp"], capture_output=True)
            # 혹은 pkill -f 사용하여 관련 유저 데이터 디렉토리 사용 중인 것들 정리
            subprocess.run(["pkill", "-9", "-f", f"drission_port_{port}"], capture_output=True)
            time.sleep(1)
        except:
            pass

    def add_driver(self, driver):
        self.drivers.append(driver)
        self.available_queue.put(driver)

    def get_driver(self, timeout=30):
        try:
            return self.available_queue.get(timeout=timeout)
        except Empty:
            return None

    def return_driver(self, driver):
        if driver:
            self.available_queue.put(driver)

pool = DriverPool()

@app.route('/health', methods=['GET'])
def health():
    with pool.lock:
        active_count = len(pool.drivers)
        available_count = pool.available_queue.qsize()
        
        # 안전한 큐 스냅샷 복사본 생성 (데드락 및 런타임 에러 방지)
        try:
            available_drivers_list = list(pool.available_queue.queue)
        except:
            available_drivers_list = []
            
        workers = []
        for d in pool.drivers:
            workers.append({
                "port": getattr(d, 'used_port', 0),
                "id": getattr(d, 'used_port', 32000) - 32000 + 1,
                "last_activity": getattr(d, 'last_activity', 0),
                "is_available": d in available_drivers_list
            })
        
        return jsonify({
            "status": "ok", 
            "driver_active": active_count > 0,
            "total_drivers": active_count,
            "max_drivers": pool.max_drivers,
            "available_drivers": available_count,
            "user_id": pool.current_user["id"] if pool.current_user else None,
            "workers": workers,
            "daemon_id": pool.daemon_id
        })

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    u_id = (data.get('userId') or "").strip()
    u_pw = data.get('userPw')
    # NAS 도커용 정비: 환경변수 또는 기본값(False)에 따라 브라우저 표시 여부 결정
    show_browser = os.environ.get("ELS_SHOW_BROWSER", "false").lower() == "true"
    
    if pool.is_same_user(u_id, show_browser):
        # [수정] 풀이 꽉 차지 않았더라도 1개 이상의 브라우저가 살아있으면 불필요한 전체 초기화를 방지
        if len(pool.drivers) > 0:
            return jsonify({
                "ok": True, 
                "message": f"세션 유지 중 ({len(pool.drivers)}개 활성)", 
                "log": [f"[데몬] 이미 {u_id} 계정으로 세션이 존재하여 페이지 로드 시의 전체 초기화를 생략합니다."]
            })
        if pool.is_logging_in:
            return jsonify({
                "ok": True, 
                "message": "현재 로그인이 진행 중입니다. 잠시만 기다려주세요.", 
                "log": ["[데몬] 이전 로그인 요청이 처리 중입니다. 중복 실행을 방지합니다."]
            }), 202 # 202 Accepted

    with pool.lock:
        pool.clear()
        pool.current_user = {"id": u_id, "pw": u_pw, "show_browser": show_browser}
        pool.is_logging_in = True
        pool.active_init_threads = pool.max_drivers
        
    logs = []
    
    def _do_login(idx):
        try:
            with pool.lock:
                if pool.consecutive_login_failures >= 3:
                    pool.add_log(f"❌ [보안경고] 연속 로그인 실패 3회 누적! 계정 잠금을 방지하기 위해 드라이버 #{idx+1} 초기화를 취소합니다.")
                    return

            # [NAS 최적화] CPU 부하 분산을 위해 브라우저 간 부팅 간격을 60초로 연장
            if idx > 0: time.sleep(idx * 60)
            
            msg = f"브라우저 #{idx+1} 초기화 중..."
            pool.add_log(msg)
            
            def _inner_log(m):
                pool.add_log(f"[B#{idx+1}] {m}")

            target_port = 32000 + idx
            
            # [추가] 브라우저 실행 전 찌꺼기 프로세스 청소
            pool.cleanup_lingering_chrome(target_port)

            res = login_and_prepare(u_id, u_pw, log_callback=_inner_log, show_browser=show_browser, port=target_port)
            if res[0]:
                res[0].used_port = target_port 
                with pool.lock:
                    pool.consecutive_login_failures = 0
                    pool.add_driver(res[0])
                pool.add_log(f"✔ 브라우저 #{idx+1} 준비 완료 (포트: {target_port})")
            else:
                with pool.lock:
                    pool.consecutive_login_failures += 1
                pool.add_log(f"❌ 브라우저 #{idx+1} 실패 ({pool.consecutive_login_failures}/3): {res[1]}")
        finally:
            with pool.lock:
                pool.active_init_threads -= 1
                if pool.active_init_threads == 0:
                    pool.is_logging_in = False

    threads = []
    for i in range(pool.max_drivers):
        t = threading.Thread(target=_do_login, args=(i,), daemon=True)
        t.start()
        threads.append(t)
    
    # [핵심] 첫 번째 드라이버가 준비될 때까지만 기다리고 즉시 응답 반환!
    start_wait = time.time()
    # 백엔드(400s)보다 약간 짧게 잡아서 데몬이 먼저 응답을 주게 함 (Race Condition 방지)
    while time.time() - start_wait < 350:
        if pool.available_queue.qsize() > 0:
             return jsonify({
                 "ok": True, 
                 "message": "첫 번째 세션이 준비되었습니다. 조회를 시작합니다. (동생이 뒤에서 나머지 세션도 마저 띄우는 중!)", 
                 "log": list(pool.log_buffer)
             })
        if pool.active_init_threads == 0: # 모든 쓰레드가 종료됨 (전부 실패한 경우)
            break
        time.sleep(1)

    return jsonify({"ok": False, "error": "초기 세션 확보 실패 (시간 초과 또는 올인원 로그인 실패)", "log": list(pool.log_buffer)})

@app.route('/stop', methods=['POST'])
def stop():
    with pool.lock:
        pool.clear()
        pool.current_user = None
    return jsonify({"ok": True, "message": "데몬 세션이 즉시 종료되었습니다."})

@app.route('/run', methods=['POST'])
def run():
    data = request.json
    cn = data.get('containerNo')
    if not cn: return jsonify({"ok": False, "error": "번호 누락"})

    # 조회가 동시에 몰려도 시작 시점을 약간씩 어긋나게 해서 릴레이 효과를 줌
    time.sleep(random.uniform(0.1, 0.3))

    driver = pool.get_driver()
    if not driver:
        return jsonify({"ok": False, "error": "가용한 세션 없음"})

    try:
        # 🎯 [전면 수정] 세션 유효성 체크를 전담 함수에 맡김
        is_alive = False
        try:
            is_alive = is_session_valid(driver)
        except: pass

        if not is_alive:
            pool.add_log(f"--- [세션 만료 감지] {cn} 조회 전 재로그인 시도 ---")
            
            with pool.lock:
                # 10분 지났으면 실패 횟수 초기화하고 다시 기회 주기
                if pool.consecutive_login_failures >= 3:
                    if time.time() - pool.last_failure_time > pool.fail_cooldown:
                        pool.add_log("🔄 [자동복구] 10분이 경과하여 로그인 실패 횟수를 초기화하고 재시도합니다.")
                        pool.consecutive_login_failures = 0
                    else:
                        wait_min = int((pool.fail_cooldown - (time.time() - pool.last_failure_time)) / 60)
                        pool.add_log(f"🕒 [대기중] 연속 로그인 실패로 보호 모드 작동 중... ({wait_min}분 후 자동 재시도)")
                        pool.return_driver(driver)
                        return jsonify({"ok": False, "error": f"로그인 연속 실패 보호 모드. 약 {wait_min}분 후 자동 재시도됩니다."})

            # 세션이 죽었으면 다시 로그인 (pool에 저장된 계정 정보 사용)
            u_id = pool.current_user["id"]
            u_pw = pool.current_user["pw"]
            show_browser = pool.current_user["show_browser"]
            
            # 현재 드라이버는 버리고 새로 만들기 (안정성)
            try: driver.quit()
            except: pass
            
            with pool.lock:
                if driver in pool.drivers:
                    pool.drivers.remove(driver)
            
            # 원래 사용하던 포트 유지
            target_port = getattr(driver, 'used_port', 9222)
            
            # [추가] 브라우저 실행 전 찌꺼기 프로세스 청소
            pool.cleanup_lingering_chrome(target_port)

            res = login_and_prepare(u_id, u_pw, log_callback=None, show_browser=show_browser, port=target_port)
            if res[0]:
                with pool.lock:
                    pool.consecutive_login_failures = 0 # 성공 시 즉시 0으로 초기화 (아침에 살아날 수 있는 핵심)
                    driver = res[0]
                    driver.used_port = target_port
                    pool.drivers.append(driver)
                pool.add_log(f"--- [세션 복구 성공] {cn} 조회를 계속합니다. ---")
            else:
                with pool.lock:
                    pool.consecutive_login_failures += 1
                    pool.last_failure_time = time.time()
                    
                    if pool.consecutive_login_failures >= 3:
                        pool.add_log("🛑 [보안 중단] 누적 로그인 3회 실패! 계정 잠금 방지를 위해 모든 자동 시도를 중지합니다. 비번을 확인하세요.")
                        return jsonify({"ok": False, "error": "로그인 3회 연속 실패로 보안 모드 발동. 비번 확인 후 수동으로 다시 시작해 주세요."})
                        
                return jsonify({"ok": False, "error": f"세션 만료 및 재로그인 실패({pool.consecutive_login_failures}/3): {res[1]}"})

        # [초가속] 사이트 차단 방지 지연 시간을 0.2 ~ 0.5초로 추가 단축하여 성능 극대화 (사용자 요청)
        time.sleep(random.uniform(0.2, 0.5))
        
        start_time = time.time()
        
        # [추가] 로그 수집
        logs = []
        def _log_cb(msg): logs.append(msg)
        
        # [수정] 백그라운드 갱신으로 인해 메인 페이지로 이동했을 수 있으므로 다시 메뉴 진입 확인
        menu_opened = open_els_menu(driver, log_callback=_log_cb)
        if not menu_opened:
            status = "INPUT_NOT_FOUND (메뉴 진입 실패)"
        else:
            # 조회 로직
            status = solve_input_and_search(driver, cn, log_callback=_log_cb)
        
        # [추가] 조회 시도 후에도 모달 박스(로그인 등)가 생겼는지 확인
        modal_res = close_modals(driver)
        if modal_res == "SESSION_EXPIRED":
            status = "세션 만료 (로그인 모달 감지)"

        result_rows = []
        # [핵심 수정] status가 True(bool) 또는 문자열일 수 있음
        is_success = (status is True) or (isinstance(status, str) and ("완료" in status or "조회시도완료" in status))
        is_nodata = isinstance(status, str) and "내역없음확인" in status
        
        if is_success or is_nodata:
            if is_nodata:
                result_rows.append([cn, "NODATA", "내역 없음"] + [""]*12)
                grid_text = None
            else:
                grid_text = scrape_hyper_verify(driver, cn)
            
            if grid_text:
                pool.add_log(f"--- [DEBUG RAW TEXT: {cn}] ---")
                pool.add_log(grid_text[:200] + "...") 
                
                temp_rows = []
                # 🎯 [끝판왕 파싱] 텍스트 전체에서 번호(1~100) + 상태 가 붙은 모든 조각을 찾아냄
                for line in grid_text.split('\n'):
                    line = line.strip()
                    if not line: continue
                    if '|' in line:
                        parts = line.split('|')
                        if len(parts) >= 2:
                            while len(parts) < 14: parts.append("")
                            temp_rows.append([cn] + parts[:14])

                if not temp_rows:
                    for line in grid_text.split('\n'):
                        line = line.strip()
                        if not line: continue
                        if re.search(r'^\d+\s+', line):
                            parts = re.split(r'\t|\s{2,}', line)
                            if len(parts) >= 3:
                                while len(parts) < 14: parts.append("")
                                temp_rows.append([cn] + parts[:14])

                # No 기준 중복 제거 및 유효성 검사
                seen_no = set()
                for r in sorted(temp_rows, key=lambda x: int(x[1]) if str(x[1]).isdigit() else 999):
                    if r[1] not in seen_no:
                        if any(cell.strip() and cell.strip() not in ['-', '.', '?', '내역 없음', '데이터 없음'] for cell in r[2:14]):
                            result_rows.append(r)
                            seen_no.add(r[1])
            
            if not result_rows:
                if grid_text == "NODATA_CONFIRMED" or (grid_text and any(msg in grid_text for msg in ["데이터가 없습니다", "내역이 없습니다", "데이터가 존재하지 않습니다"])):
                    result_rows.append([cn, "NODATA", "내역 없음"] + [""]*12)
                else:
                    result_rows.append([cn, "ERROR", "데이터 추출 실패 (시간 초과)"] + [""]*12)
        else:
            close_modals(driver)
            result_rows.append([cn, "ERROR", status] + [""]*12)

        return jsonify({
            "ok": True,
            "containerNo": cn,
            "worker_id": getattr(driver, 'used_port', 32000) - 32000 + 1,
            "daemon_id": pool.daemon_id, # [추가] 데몬 식별 ID 반환
            "result": result_rows,
            "elapsed": round(time.time() - start_time, 1),
            "log": list(pool.log_buffer) # 전체 로그 버퍼 반환
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)})
    finally:
        driver.last_activity = time.time()
        pool.return_driver(driver)

@app.route('/quit', methods=['POST'])
def quit_driver():
    pool.clear()
    return jsonify({"ok": True, "message": "종료"})

@app.route('/screenshot', methods=['GET'])
def get_screenshot():
    # elsbot/debug_screenshot.png 파일 경로
    path = os.path.join(os.path.dirname(__file__), "debug_screenshot.png")
    
    # 가용한 드라이버가 있으면 즉시 스크린샷 촬영 시도
    driver_for_shot = None
    with pool.lock:
        if pool.drivers:
            driver_for_shot = pool.drivers[0]
    
    if driver_for_shot:
        try:
            # DrissionPage의 get_screenshot 메서드 사용
            driver_for_shot.get_screenshot(path=path)
        except Exception as e:
            print(f"[SCREENSHOT_ERROR] {e}")

    if os.path.exists(path):
        with open(path, "rb") as f:
            return Response(f.read(), mimetype='image/png')
    return jsonify({"ok": False, "error": "No screenshot"}), 404

@app.route('/logs', methods=['GET'])
def get_logs():
    return jsonify({"ok": True, "log": list(pool.log_buffer)})

def session_keeper():
    """백그라운드에서 58분 갱신 및 세션 만료를 지속 모니터링하여 복구하는 스레드"""
    while True:
        time.sleep(60) # 1분마다 순회
        with pool.lock:
            # 설정된 유저정보가 없고 드라이버가 없으면 패스
            if not pool.current_user or not pool.current_user.get("id"):
                continue
            if pool.consecutive_login_failures >= 3:
                continue

        q_size = pool.available_queue.qsize()
        for _ in range(q_size):
            try:
                driver = pool.available_queue.get_nowait()
            except Empty:
                break
                
            needs_refresh = False
            reason = ""
            try:
                last_ac = getattr(driver, 'last_activity', getattr(driver, 'login_time', time.time()))
                elapsed_active = time.time() - last_ac
                
                if not is_session_valid(driver):
                    needs_refresh = True
                    reason = "세션 만료 감지"
                elif elapsed_active >= 1200: # 20분(1200초) 이상 활동이 없으면 세션 연장
                    try:
                        driver.get("https://etrans.klnet.co.kr/main.do")
                        close_modals(driver)
                        driver.last_activity = time.time()
                        pool.add_log(f"--- [백그라운드] 20분 무활동. 세션 유지를 위해 페이지를 갱신했습니다 (재로그인 X). ---")
                    except Exception as e:
                        needs_refresh = True
                        reason = "세션 연장(새로고침) 실패"
            except Exception as e:
                needs_refresh = True
                reason = "세션 유효성 검사 중 에러"

            if needs_refresh:
                pool.add_log(f"--- [백그라운드 세션관리] {reason} 사유로 재로그인을 시도합니다. ---")
                
                with pool.lock:
                    if pool.consecutive_login_failures >= 3:
                        pool.add_log("❌ [백그라운드 세션관리] 연속 로그인 3회 실패 상태. 복구 시도 취소.")
                        try: driver.quit()
                        except: pass
                        if driver in pool.drivers:
                            pool.drivers.remove(driver)
                        continue

                u_id = pool.current_user["id"]
                u_pw = pool.current_user["pw"]
                show_browser = pool.current_user["show_browser"]
                target_port = getattr(driver, 'used_port', 9222)
                
                try: driver.quit()
                except: pass
                
                with pool.lock:
                    if driver in pool.drivers:
                        pool.drivers.remove(driver)
                        
                # [추가] 재로그인 전 찌꺼기 프로세스 청소
                pool.cleanup_lingering_chrome(target_port)

                res = login_and_prepare(u_id, u_pw, log_callback=None, show_browser=show_browser, port=target_port)
                if res[0]:
                    with pool.lock:
                        pool.consecutive_login_failures = 0
                        new_driver = res[0]
                        new_driver.used_port = target_port
                        new_driver.last_activity = time.time()
                        pool.drivers.append(new_driver)
                        pool.available_queue.put(new_driver)
                    pool.add_log(f"--- [백그라운드 세션관리] 복구 성공! (포트: {target_port}) ---")
                else:
                    with pool.lock:
                        pool.consecutive_login_failures += 1
                    pool.add_log(f"❌ [백그라운드 세션관리] 복구 실패({pool.consecutive_login_failures}/3): {res[1]}")
            else:
                # 정상적인 드라이버면 다시 큐에 넣음
                pool.available_queue.put(driver)

if __name__ == '__main__':
    print("========================================")
    print("   ELS NAS STABLE DAEMON STARTED")
    print("   SESSION AUTO-RECOVERY ENABLED")
    print("========================================")
    
    # 세션 관리기 백그라운드 스레드 시작
    keeper = threading.Thread(target=session_keeper, daemon=True)
    keeper.start()
    
    app.run(host='0.0.0.0', port=31999, debug=False, threaded=True)