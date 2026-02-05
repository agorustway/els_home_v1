"""
ELS 세션 유지 데몬 (v2.0)
- 55분 자동 재로그인 스레드 포함
- 구간별 소요 시간 및 실시간 타임스탬프 로그 출력
- 브라우저 이탈 시에도 백그라운드 작업 유지
"""
import time
import json
import logging
import os
import sys
import threading
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import parse_qs

# elsbot 패키지 경로 설정
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from els_bot import load_config, login_and_prepare
from els_web_runner import run_search

# --- 전역 상태 관리 ---
_driver = None
_lock = threading.Lock()
_last_action_time = 0
_current_creds = {"id": None, "pw": None}
_keep_alive_thread = None

DAEMON_PORT = 31999

def get_now_str():
    return datetime.now().strftime("%H:%M:%S")

def update_last_action():
    global _last_action_time
    _last_action_time = time.time()

def set_driver(drv):
    global _driver
    with _lock:
        _driver = drv

def do_logout():
    global _driver
    with _lock:
        if _driver:
            try:
                _driver.quit()
            except: pass
            _driver = None

def perform_relogin():
    """세션 만료 전 자동 재로그인 수행"""
    global _current_creds
    uid, upw = _current_creds["id"], _current_creds["pw"]
    if not uid or not upw: return
    
    print(f"[{get_now_str()}] [AutoRefresh] 55분 경과. 세션 갱신 시작...", flush=True)
    do_logout()
    try:
        result = login_and_prepare(uid, upw)
        new_driver = result[0] if isinstance(result, tuple) else result
        if new_driver:
            set_driver(new_driver)
            update_last_action()
            print(f"[{get_now_str()}] [AutoRefresh] 세션 갱신 성공.", flush=True)
    except Exception as e:
        print(f"[{get_now_str()}] [AutoRefresh] 에러: {e}", flush=True)

def auto_refresh_loop():
    """55분(3300초)마다 활동 체크"""
    while True:
        time.sleep(60)
        if _driver and (time.time() - _last_action_time) > 3300:
            perform_relogin()

class ELSDaemonHandler(BaseHTTPRequestHandler):
    def write_chunk(self, data):
        if not data:
            self.wfile.write(b"0\r\n\r\n")
            return
        self.wfile.write(("%x\r\n" % len(data)).encode() + data + b"\r\n")
        self.wfile.flush()

    def handle_login(self):
        start_time = time.time()
        body = self.parse_body()
        uid = body.get("userId", "").strip()
        upw = body.get("userPw", "")

        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Transfer-Encoding", "chunked")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        def log_cb(msg):
            elapsed = round(time.time() - start_time, 1)
            formatted_msg = f"LOG:[{get_now_str()}] [{elapsed}s] {msg}\n"
            try: self.write_chunk(formatted_msg.encode("utf-8"))
            except: pass

        log_cb("ETRANS 서버 접속 및 로그인 시도 중...")
        try:
            do_logout()
            result = login_and_prepare(uid, upw, log_callback=log_cb)
            driver = result[0] if isinstance(result, tuple) else result
            if driver:
                set_driver(driver)
                _current_creds["id"], _current_creds["pw"] = uid, upw
                update_last_action()
                log_cb("✅ 로그인 및 페이지 준비 완료.")
                res = {"ok": True}
            else:
                log_cb("❌ 로그인 실패.")
                res = {"ok": False, "error": "Login Failed"}
            self.write_chunk(f"RESULT:{json.dumps(res)}\n".encode("utf-8"))
        finally:
            self.write_chunk(b"")

    def handle_run(self):
        start_time = time.time()
        body = self.parse_body()
        containers = body.get("containers", [])
        
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Transfer-Encoding", "chunked")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        def stream_log(msg):
            elapsed = round(time.time() - start_time, 1)
            # 형이 원하던 초 단위 표시와 작업 상태 실시간 전송
            line = f"LOG:[{get_now_str()}] [{elapsed}s] {msg}\n"
            try: self.write_chunk(line.encode("utf-8"))
            except: pass

        try:
            update_last_action()
            stream_log(f"조회 시작: 총 {len(containers)}건 처리 중...")
            
            log_lines, s1, s2, out_path = run_search(
                containers, driver=get_driver(), log_callback=stream_log, keep_alive=True
            )
            
            update_last_action()
            total_time = round(time.time() - start_time, 1)
            stream_log(f"🎉 모든 조회 완료. (총 소요시간: {total_time}초)")
            
            res = {"ok": True, "output_path": out_path, "totalTime": f"{total_time}s"}
            self.write_chunk(f"RESULT:{json.dumps(res)}\n".encode("utf-8"))
        except Exception as e:
            stream_log(f"❌ 오류 발생: {e}")
            self.write_chunk(f"RESULT:{{\"ok\":false, \"error\":\"{str(e)}\"}}\n".encode("utf-8"))
        finally:
            self.write_chunk(b"")

    # --- 기존 헬퍼 함수들 (parse_body, do_GET, do_POST 등) 유지 ---
    def parse_body(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length).decode("utf-8")) if length else {}

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'{"ok":true}')

    def do_POST(self):
        if self.path == "/login": self.handle_login()
        elif self.path == "/run": self.handle_run()
        elif self.path == "/logout":
            do_logout()
            self.send_response(200)
            self.end_headers()

def main():
    # 백그라운드 세션 유지 스레드 시작
    threading.Thread(target=auto_refresh_loop, daemon=True).start()
    server = HTTPServer(("127.0.0.1", DAEMON_PORT), ELSDaemonHandler)
    print(f"[{get_now_str()}] ELS Daemon started on port {DAEMON_PORT}", flush=True)
    server.serve_forever()

if __name__ == "__main__":
    main()