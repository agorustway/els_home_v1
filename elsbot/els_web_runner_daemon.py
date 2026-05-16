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
from els_bot import (
    login_and_prepare, solve_input_and_search, scrape_hyper_verify, run_els_process,
    close_modals, is_session_valid, open_els_menu, extend_session,
    normalize_container_no, is_valid_container_no, make_status_row,
    parse_grid_text_to_rows, is_retryable_result_rows, is_no_data_text,
)
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
        self.max_drivers = int(os.environ.get("ELS_MAX_DRIVERS", 4)) # [v5.13.6] NAS CPU 여유 확인 후 4개 워커 기본값 복구
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
            # Linux 환경 (fuser 사용): SIGTERM(-15)을 사용하여 자식 프로세스(렌더러 등)가 정상 종료될 기회를 줌
            subprocess.run(["fuser", "-k", "-15", f"{port}/tcp"], capture_output=True)
            time.sleep(1)
            # 종료되지 않은 메인 프로세스와 자식들을 찾아 강제 종료 (-9)
            subprocess.run(["pkill", "-9", "-f", f"drission_port_{port}"], capture_output=True)

            # [고아 프로세스(Zombie) 방지]: 부모를 잃은 렌더러 프로세스 등은 pkill -f chrome으로 주기적 정리
            # 단독 실행 중이 아닌 고아 렌더러만 안전하게 삭제하려면 os.system("pkill -9 -f '--type=renderer'") 등을 쓸 수 있음
            # 일단 여기서는 포트 기반으로만 정리
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

def is_query_screen_ready(driver, timeout=0.2):
    try:
        target = driver.ele('css:#mf_tac_layout_contents_602_body_input_containerNo', timeout=timeout) or \
                 driver.ele('css:input[id*="containerNo"]', timeout=0.1)
        return bool(target)
    except:
        return False

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
            # [v4.4.60] 개별 브라우저별로 최대 3회 재시도 (다른 브라우저에 영향 없음)
            success = False
            for retry in range(1, 4):
                try:
                    with pool.lock:
                        if pool.consecutive_login_failures >= 5: # 누적 실패가 너무 많으면 중단 (보안)
                            pool.add_log(f"❌ [보안경고] 누적 로그인 실패 과다! 드라이버 #{idx+1} 초기화를 영구 취소합니다.")
                            return

                    # [NAS 최적화] CPU 부하 부하 분산을 위해 브라우저 간 부팅 간격을 60초로 연장
                    if idx > 0 and retry == 1: time.sleep(idx * 60)
                    elif retry > 1: time.sleep(10) # 재시도 간격 10초

                    msg = f"브라우저 #{idx+1} 초기화 중... (시도 {retry}/3)"
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
                        success = True
                        break # 성공시 루프 탈출
                    else:
                        pool.add_log(f"⚠️ 브라우저 #{idx+1} 실패 ({retry}/3): {res[1]}")
                except Exception as e:
                    pool.add_log(f"🔥 브라우저 #{idx+1} 예외 발생 ({retry}/3): {e}")

            if not success:
                pool.add_log(f"❌ 브라우저 #{idx+1} 최종 실패. (3회 시도 모두 실패)")
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
    cn = normalize_container_no(data.get('containerNo'))
    if not cn: return jsonify({"ok": False, "error": "번호 누락"})
    if not is_valid_container_no(cn):
        return jsonify({
            "ok": True,
            "containerNo": cn,
            "worker_id": None,
            "daemon_id": pool.daemon_id,
            "result": [make_status_row(cn, "ERROR", "유효하지 않은 컨테이너 번호(ISO 6346 검증 실패)")],
            "elapsed": 0,
            "log": list(pool.log_buffer)
        })

    # 조회가 동시에 몰려도 시작 시점을 약간씩 어긋나게 해서 릴레이 효과를 줌
    request_started = time.time()
    time.sleep(random.uniform(0.05, 0.15))

    acquire_started = time.time()
    driver = pool.get_driver()
    if not driver:
        return jsonify({"ok": False, "error": "가용한 세션 없음"})
    acquire_elapsed = time.time() - acquire_started
    if acquire_elapsed >= 1:
        pool.add_log(f"[{cn}] 워커 확보 대기 {acquire_elapsed:.1f}s")

    try:
        # 🎯 [전면 수정] 세션 유효성 체크를 전담 함수에 맡김
        is_alive = False
        try:
            if getattr(driver, 'page_ready', False) and is_query_screen_ready(driver):
                is_alive = True
            else:
                check_started = time.time()
                is_alive = is_session_valid(driver)
                check_elapsed = time.time() - check_started
                if check_elapsed >= 1:
                    pool.add_log(f"[{cn}] 세션 검사 {check_elapsed:.1f}s")
        except: pass

        if not is_alive:
            driver.page_ready = False  # 세션이 죽었으면 화면도 초기화
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

        # 사이트 차단 방지를 위한 짧은 릴레이 지연
        time.sleep(random.uniform(0.2, 0.45))

        start_time = time.time()

        # [추가] 로그 수집
        logs = []
        def _log_cb(msg): logs.append(msg)

        def _lookup_once():
            grid_text = None

            # [v5.13.6] 로그인 직후 이미 조회 화면이면 첫 조회에서도 메뉴 재진입을 생략
            if getattr(driver, 'page_ready', False) and is_query_screen_ready(driver):
                _log_cb("⚡ [고속모드] 이미 조회 화면 대기 중. 메뉴 재진입 스킵!")
                menu_opened = True
            else:
                menu_started = time.time()
                menu_opened = open_els_menu(driver, log_callback=_log_cb)
                if menu_opened:
                    driver.page_ready = True
                menu_elapsed = time.time() - menu_started
                if menu_elapsed >= 2:
                    pool.add_log(f"[{cn}] 메뉴 확인 {menu_elapsed:.1f}s")

            if not menu_opened:
                driver.page_ready = False
                return [make_status_row(cn, "ERROR", "INPUT_NOT_FOUND (메뉴 진입 실패)")]

            solve_started = time.time()
            status = solve_input_and_search(driver, cn, log_callback=_log_cb)
            solve_elapsed = time.time() - solve_started
            if solve_elapsed >= 3:
                pool.add_log(f"[{cn}] 입력/조회 클릭 {solve_elapsed:.1f}s")

            # [v4.5.3] 조회 시도 후 모달 박스 확인 - 계정정보 전달하여 팝업 내 자동 로그인 지원
            u_id_now = pool.current_user["id"] if pool.current_user else None
            u_pw_now = pool.current_user["pw"]  if pool.current_user else None
            modal_res = close_modals(driver, u_id=u_id_now, u_pw=u_pw_now)
            if modal_res == "POPUP_LOGIN_DONE":
                # 팝업 로그인 완료 → 메뉴 재진입 후 다시 조회
                pool.add_log(f"[{cn}] 팝업 로그인 완료. 메뉴 재진입 후 재조회 시도...")
                driver.page_ready = False
                if open_els_menu(driver, log_callback=_log_cb):
                    driver.page_ready = True
                    status = solve_input_and_search(driver, cn, log_callback=_log_cb)
                else:
                    status = "POPUP_LOGIN_메뉴재진입실패"
            elif modal_res == "SESSION_EXPIRED":
                driver.page_ready = False
                status = "세션 만료 (로그인 모달 감지)"

            # [핵심 수정] status가 True(bool) 또는 문자열일 수 있음
            is_success = (status is True) or (isinstance(status, str) and ("완료" in status or "조회시도완료" in status))
            is_nodata = isinstance(status, str) and "내역없음확인" in status

            if is_nodata:
                return [make_status_row(cn, "NODATA", "내역 없음")]

            if is_success:
                scrape_started = time.time()
                grid_text = scrape_hyper_verify(driver, cn)
                scrape_elapsed = time.time() - scrape_started
                if scrape_elapsed >= 4:
                    pool.add_log(f"[{cn}] 그리드 추출 {scrape_elapsed:.1f}s")

                parsed_rows = parse_grid_text_to_rows(cn, grid_text)
                if parsed_rows:
                    if not (len(parsed_rows) == 1 and parsed_rows[0][1] == "NODATA"):
                        pool.add_log(f"--- [DEBUG RAW TEXT: {cn}] ---")
                        pool.add_log(str(grid_text)[:200] + "...")
                    return parsed_rows

                if grid_text and is_no_data_text(grid_text):
                    return [make_status_row(cn, "NODATA", "내역 없음")]
                return [make_status_row(cn, "ERROR", "데이터 추출 실패 (시간 초과)")]

            close_modals(driver)
            driver.page_ready = False
            return [make_status_row(cn, "ERROR", str(status))]

        result_rows = []
        for attempt in range(1, 3):
            result_rows = _lookup_once()
            if not is_retryable_result_rows(result_rows):
                break
            if attempt < 2:
                pool.add_log(f"[{cn}] 불확실 실패 감지 → 1회 재조회합니다. ({result_rows[0][2] if result_rows else '결과 없음'})")
                time.sleep(1.2)

        return jsonify({
            "ok": True,
            "containerNo": cn,
            "worker_id": getattr(driver, 'used_port', 32000) - 32000 + 1,
            "daemon_id": pool.daemon_id, # [추가] 데몬 식별 ID 반환
            "result": result_rows,
            "elapsed": round(time.time() - request_started, 1),
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
    # elsbot/debug_screenshot.png 파일 경로 (idx별로 생성하여 덮어씀)
    idx_str = request.args.get('idx', '1')
    try:
        idx = int(idx_str)
    except:
        idx = 1

    path = os.path.join(os.path.dirname(__file__), f"debug_screenshot_{idx}.png")

    # [v4.5.11] 요청받은 인덱스(1~4)에 해당하는 드라이버 수색
    driver_for_shot = None
    with pool.lock:
        if pool.drivers:
            if idx <= len(pool.drivers):
                # 인덱스 순서대로 찾기 (정규화된 ID 순서)
                sorted_drivers = sorted(pool.drivers, key=lambda d: getattr(d, 'used_port', 9999))
                if idx - 1 < len(sorted_drivers):
                    driver_for_shot = sorted_drivers[idx - 1]

            # 지정된 인덱스 드라이버를 못 찾으면 첫 번째 가용 드라이버 사용 (Fallback)
            if not driver_for_shot:
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
                # [개선] 무활동 시간뿐만 아니라 마지막 연장 시점(또는 로그인 시점) 기준으로도 연장 수행
                last_ac = getattr(driver, 'last_activity', time.time())
                last_ext = getattr(driver, 'last_extension', getattr(driver, 'login_time', last_ac))
                elapsed_active = time.time() - last_ac
                elapsed_ext = time.time() - last_ext

                if not is_session_valid(driver):
                    needs_refresh = True
                    reason = "세션 만료 감지"
                elif elapsed_active >= 1200 or elapsed_ext >= 1800: # 20분 무활동 OR 마지막 연장 후 30분 경과
                    try:
                        # [v4.12.1] 세션 연장 시도 (활동 중이라도 30분마다 안전하게 연장)
                        extended = extend_session(driver, log_callback=pool.add_log)
                        if extended:
                            pool.add_log(f"--- [백그라운드] 세션 자동 갱신 완료 (무활동:{int(elapsed_active)}s, 마지막연장:{int(elapsed_ext)}s). ---")
                            driver.last_extension = time.time()
                            driver.last_activity = time.time()
                        else:
                            pool.add_log(f"--- [백그라운드] 연장 버튼 클릭 실패. 다음 주기 재시도. ---")
                            # 여기서 needs_refresh = True로 만들면 강제 재로그인으로 복구 시도 가능
                            # 하지만 화면 보존을 위해 일단 유지
                            driver.page_ready = False
                            driver.last_activity = time.time()
                    except Exception as e:
                        needs_refresh = True
                        reason = f"세션 연장 실패: {e}"
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

def daily_reset_scheduler():
    """매일 새벽 5시 드라이버 풀 완전 초기화 + 자동 재로그인 (세션 장기 만료 방지)"""
    from datetime import datetime, timezone, timedelta
    KST = timezone(timedelta(hours=9))
    last_reset_date = None

    while True:
        time.sleep(30)  # 30초마다 시각 체크
        try:
            now = datetime.now(KST)
            today = now.date()

            # 새벽 5:00 ~ 5:02 사이에 오늘 아직 리셋 안 했으면 실행
            if now.hour == 5 and now.minute < 2 and last_reset_date != today:
                last_reset_date = today
                pool.add_log("⏰ [일일리셋] 새벽 5시 자동 드라이버 풀 초기화 시작...")

                with pool.lock:
                    saved_user = dict(pool.current_user) if pool.current_user else None
                    pool.clear()

                if not saved_user or not saved_user.get("id"):
                    pool.add_log("⚠️ [일일리셋] 저장된 사용자 정보 없음 → 수동 로그인 필요.")
                    continue

                # 자동 재로그인
                pool.add_log(f"🔄 [일일리셋] '{saved_user['id']}' 계정으로 자동 재로그인 시도...")
                with pool.lock:
                    pool.current_user = saved_user
                    pool.is_logging_in = True
                    pool.active_init_threads = pool.max_drivers
                    pool.consecutive_login_failures = 0

                def _do_reset_login(idx, _user=saved_user):
                    try:
                        if idx > 0:
                            time.sleep(idx * 60)
                        target_port = 32000 + idx
                        pool.cleanup_lingering_chrome(target_port)
                        res = login_and_prepare(
                            _user["id"], _user["pw"],
                            log_callback=pool.add_log,
                            show_browser=_user.get("show_browser", False),
                            port=target_port
                        )
                        if res[0]:
                            res[0].used_port = target_port
                            with pool.lock:
                                pool.consecutive_login_failures = 0
                                pool.add_driver(res[0])
                            pool.add_log(f"✅ [일일리셋] 브라우저 #{idx+1} 재시작 완료 (포트:{target_port})")
                        else:
                            pool.add_log(f"❌ [일일리셋] 브라우저 #{idx+1} 재시작 실패: {res[1]}")
                    finally:
                        with pool.lock:
                            pool.active_init_threads -= 1
                            if pool.active_init_threads == 0:
                                pool.is_logging_in = False
                                pool.add_log("⏰ [일일리셋] 자동 리셋 완료!")

                for i in range(pool.max_drivers):
                    threading.Thread(target=_do_reset_login, args=(i,), daemon=True).start()

        except Exception as e:
            pool.add_log(f"❌ [일일리셋] 스케줄러 오류: {e}")

if __name__ == '__main__':
    print("========================================")
    print("   ELS NAS STABLE DAEMON STARTED")
    print("   SESSION AUTO-RECOVERY ENABLED")
    print("   DAILY RESET @ 05:00 KST ENABLED")
    print("========================================")

    # 세션 관리기 백그라운드 스레드 시작
    keeper = threading.Thread(target=session_keeper, daemon=True)
    keeper.start()

    # 일일 리셋 스케줄러 시작 (새벽 5시)
    resetter = threading.Thread(target=daily_reset_scheduler, daemon=True)
    resetter.start()

    app.run(host='0.0.0.0', port=31999, debug=False, threaded=True)
