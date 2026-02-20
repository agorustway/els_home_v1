import json
import time
import os
import sys
import threading
import random
from queue import Queue, Empty
from flask import Flask, request, jsonify, Response
from flask_cors import CORS

# 핵심 함수들 가져오기
from els_bot import login_and_prepare, solve_input_and_search, scrape_hyper_verify, run_els_process, close_modals
import re
import pandas as pd

app = Flask(__name__)
CORS(app)

class DriverPool:
    def __init__(self):
        self.drivers = []
        self.lock = threading.Lock()
        self.available_queue = Queue()
        self.current_user = {"id": None, "pw": None, "show_browser": False}
        self.is_logging_in = False # [추가] 로그인 중복 실행 방지 플래그
        # NAS 부하를 고려해 병렬 세션을 2개로 제한 (안정성 최우선)
        self.max_drivers = 2 

    def clear(self):
        with self.lock:
            while not self.available_queue.empty():
                try: self.available_queue.get_nowait()
                except: break
            for d in self.drivers:
                try: d.quit()
                except: pass
            self.drivers = []

    def is_same_user(self, u_id, show_browser):
        return self.current_user["id"] == u_id and self.current_user["show_browser"] == show_browser

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
    active_count = len(pool.drivers)
    available_count = pool.available_queue.qsize()
    return jsonify({
        "status": "ok", 
        "driver_active": active_count > 0,
        "total_drivers": active_count,
        "available_drivers": available_count,
        "user_id": pool.current_user["id"]
    })

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    u_id = (data.get('userId') or "").strip()
    u_pw = data.get('userPw')
    show_browser = data.get('showBrowser', False)
    
    if pool.is_same_user(u_id, show_browser):
        if len(pool.drivers) >= pool.max_drivers:
            return jsonify({
                "ok": True, 
                "message": "이미 안정화된 세션이 준비되어 있습니다.", 
                "log": [f"[데몬] 이미 {u_id} 계정으로 {len(pool.drivers)}개 세션이 준비되었습니다."]
            })
        if pool.is_logging_in:
            return jsonify({
                "ok": True, 
                "message": "현재 로그인이 진행 중입니다. 잠시만 기다려주세요.", 
                "log": ["[데몬] 이전 로그인 요청이 처리 중입니다. 중복 실행을 방지합니다."]
            }), 202 # 202 Accepted

    with pool.lock:
        pool.is_logging_in = True
    
    try:
        pool.clear()
        pool.current_user = {"id": u_id, "pw": u_pw, "show_browser": show_browser}
        
        logs = []
        success_count = 0
        
        def _do_login(idx):
            nonlocal success_count
            msg = f"[데몬] 브라우저 #{idx+1} 초기화 중..."
            print(msg); logs.append(msg)
            
            # [NAS 최적화] 브라우저 간 부팅 간격을 15초로 조정 (너무 길면 전체 타임아웃 발생 위험)
            if idx > 0: time.sleep(idx * 15)
            
            res = login_and_prepare(u_id, u_pw, log_callback=None, show_browser=show_browser)
            if res[0]:
                with pool.lock:
                    pool.add_driver(res[0])
                    success_count += 1
                logs.append(f"✔ 브라우저 #{idx+1} 준비 완료 (NAS 안정 모드)")
            else:
                logs.append(f"❌ 브라우저 #{idx+1} 실패: {res[1]}")

        threads = []
        for i in range(pool.max_drivers):
            t = threading.Thread(target=_do_login, args=(i,))
            t.start()
            threads.append(t)
        
        for t in threads: t.join()

    finally:
        with pool.lock:
            pool.is_logging_in = False

    if success_count > 0:
        return jsonify({"ok": True, "message": f"{success_count}개 세션 확보 성공", "log": logs})
    else:
        return jsonify({"ok": False, "error": "로그인 실패", "log": logs})

@app.route('/run', methods=['POST'])
def run():
    data = request.json
    cn = data.get('containerNo')
    if not cn: return jsonify({"ok": False, "error": "번호 누락"})

    driver = pool.get_driver()
    if not driver:
        return jsonify({"ok": False, "error": "가용한 세션 없음"})

    try:
        # [형의 조언 반영] 사이트 차단 방지를 위한 더 긴 랜덤 지연 (3.0 ~ 7.0초)
        # NAS의 느린 반응 속도를 감안하여 대기 시간을 충분히 줌
        time.sleep(random.uniform(3.0, 7.0))
        
        start_time = time.time()
        
        # [추가] 로그 수집
        logs = []
        def _log_cb(msg): logs.append(msg)
        
        # 조회 로직
        status = solve_input_and_search(driver, cn, log_callback=_log_cb)
        
        result_rows = []
        if "완료" in status or "내역없음확인" in status:
            # 내역 없음이 확실하다면 바로 처리
            if "내역없음확인" in status:
                result_rows.append([cn, "NODATA", "내역 없음"] + [""]*12)
                grid_text = None
            else:
                # NAS 속도를 고려해 그리드 텍스트 추출 전 약간의 추가 대기
                time.sleep(1.0)
                grid_text = scrape_hyper_verify(driver, cn)
            
            if grid_text:
                blacklist = ["SKR", "YML", "ZIM", "최병훈", "안녕하세요", "로그아웃", "조회"]
                for line in grid_text.split('\n'):
                    stripped = line.strip()
                    if not stripped or any(kw in stripped for kw in blacklist): continue
                    row_data = re.split(r'\t|\s{2,}', stripped)
                    if row_data and row_data[0].isdigit():
                        no_val = int(row_data[0])
                        # 🎯 형, 여기서 1~200 사이의 진짜 'No' 번호만 필터링해.
                        if 1 <= no_val <= 200:
                            while len(row_data) < 14: row_data.append("")
                            # [핵심] 번호만 있고 나머지가 '-', '.', '?' 또는 공백인 행은 '유령 데이터'니까 버려!
                            if any(cell.strip() and cell.strip() not in ['-', '.', '?', '내역 없음', '데이터 없음'] for cell in row_data[1:14]):
                                result_rows.append([cn] + row_data[:14])
                            else:
                                print(f"DEBUG: [{cn}] No.{no_val} 행은 실제 데이터가 없어 필터링됨.")
                        else:
                            print(f"DEBUG: [{cn}] No.{no_val} 번호가 유효 범위를 벗어나 필터링됨.")
            
            if not result_rows:
                result_rows.append([cn, "NODATA", "내역 없음"] + [""]*12)
        else:
            # 실패 시 모달 창이 가리고 있을 수 있으므로 한 번 닫아줌 (다음 조회를 위해)
            close_modals(driver)
            result_rows.append([cn, "ERROR", status] + [""]*12)

        return jsonify({
            "ok": True,
            "containerNo": cn,
            "result": result_rows,
            "elapsed": round(time.time() - start_time, 1),
            "log": logs
        })
    except Exception as e:
        # 예외 발생 시 브라우저 상태가 불안정할 수 있으므로 체크 필요 (생략 가능)
        return jsonify({"ok": False, "error": str(e)})
    finally:
        pool.return_driver(driver)

@app.route('/quit', methods=['POST'])
def quit_driver():
    pool.clear()
    return jsonify({"ok": True, "message": "종료"})

if __name__ == '__main__':
    print("========================================")
    print("   ELS NAS STABLE DAEMON STARTED")
    print("   POOL SIZE: 2 | SAFETY FIRST")
    print("========================================")
    app.run(host='0.0.0.0', port=31999, debug=False, threaded=True)