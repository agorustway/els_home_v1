"""
ELS 세션 유지 데몬. 로그인 후 드라이버를 유지하고, /run 시 조회만 수행(로그아웃 안 함).
페이지 이탈 시 /logout 호출로 드라이버 종료.
"""
import json
import os
import sys
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import parse_qs

# elsbot 패키지 경로
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from els_bot import load_config, login_and_prepare
from els_web_runner import run_search

# 프로세스 내 전역 드라이버 및 상태
_driver = None
_lock = threading.Lock()
_last_action_time = 0
_current_creds = {"id": None, "pw": None}
_keep_alive_thread = None

DAEMON_PORT = 31999

def get_driver():
    with _lock:
        return _driver

def set_driver(drv):
    global _driver
    with _lock:
        _driver = drv

def update_last_action():
    global _last_action_time
    _last_action_time = time.time()

def save_creds(uid, upw):
    global _current_creds
    _current_creds["id"] = uid
    _current_creds["pw"] = upw

def do_logout():
    global _driver
    with _lock:
        if _driver:
            try:
                _driver.quit()
            except Exception:
                pass
            _driver = None

def perform_relogin():
    """백그라운드 자동 재로그인 로직"""
    global _driver, _last_action_time, _current_creds
    
    uid = _current_creds["id"]
    upw = _current_creds["pw"]
    
    if not uid or not upw:
        return # 계정 정보 없으면 재로그인 불가
        
    print(f"[AutoRefresh] 55분 경과. 세션 갱신을 위해 재로그인 시도... ({uid})", flush=True)
    
    # 기존 드라이버 종료
    do_logout()
    
    # 재로그인 시도
    try:
        # 로그 콜백은 콘솔 출력으로 대체
        result = login_and_prepare(uid, upw)
        new_driver = result[0] if isinstance(result, tuple) and result else (result if result else None)
        
        if new_driver:
            set_driver(new_driver)
            update_last_action()
            print("[AutoRefresh] 성공. 세션 갱신 완료.", flush=True)
        else:
            print(f"[AutoRefresh] 실패: {result[1] if isinstance(result, tuple) and len(result)>1 else 'Unknown'}", flush=True)
    except Exception as e:
        print(f"[AutoRefresh] 예외 발생: {e}", flush=True)

def auto_refresh_loop():
    """1분마다 체크하여 55분 이상 활동 없으면 재로그인"""
    import time
    while True:
        time.sleep(60)
        with _lock:
            if not _driver:
                continue # 드라이버 없으면 체크 안 함
            
            elapsed = time.time() - _last_action_time
            # 55분(3300초) 초과 시 재로그인
            if elapsed > 3300:
                # 락을 풀고 재로그인 수행 (긴 작업이므로)
                pass
            else:
                continue
        
        # 락 밖에서 수행
        if (time.time() - _last_action_time) > 3300:
            perform_relogin()

def start_auto_refresh():
    global _keep_alive_thread
    if _keep_alive_thread is None:
        _keep_alive_thread = threading.Thread(target=auto_refresh_loop, daemon=True)
        _keep_alive_thread.start()


class ELSDaemonHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # 서버 로그 최소화

    def parse_body(self):
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length <= 0:
            return {}
        raw = self.rfile.read(content_length)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    def send_json(self, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def write_chunk(self, data):
        if not data:
            self.wfile.write(b"0\r\n\r\n")
            return
        self.wfile.write(("%x\r\n" % len(data)).encode() + data + b"\r\n")
        self.wfile.flush()

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path == "/login":
            self.handle_login()
        elif self.path == "/run":
            self.handle_run()
        elif self.path == "/logout":
            self.handle_logout()
        else:
            self.send_error(404)

    def handle_login(self):
        body = self.parse_body()
        # [추가] 디버깅을 위해 수신된 요청 본문을 콘솔에 출력
        print(f"[DAEMON] /login received body: {json.dumps(body)}", flush=True)
        try:
        except Exception as e:
            self.send_json({"ok": False, "log": [f"[오류] 요청 파싱 실패: {e}"]})
            return
        use_saved = body.get("useSavedCreds", True)
        user_id = body.get("userId", "").strip() if not use_saved else None
        user_pw = body.get("userPw", "") if not use_saved else None
        if use_saved:
            try:
                config = load_config()
                user_id = config.get("user_id", "")
                user_pw = config.get("user_pw", "")
            except Exception as e:
                self.send_json({"ok": False, "log": [f"[오류] 설정 로드 실패: {e}"]})
                return
        if not user_id or not user_pw:
            self.send_json({"ok": False, "log": ["[오류] 아이디/비밀번호가 없습니다."]})
            return
            
        do_logout()
        
        # 스트리밍 응답 시작
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Transfer-Encoding", "chunked")
        self.send_header("X-Accel-Buffering", "no") # [중요] Nginx 버퍼링 방지
        self.end_headers()
        
        log_lines = []
        def log_cb(msg):
            log_lines.append(msg)
            # 로그 즉시 전송
            try:
                self.write_chunk(("LOG:" + msg + "\n").encode("utf-8"))
            except: pass

        try:
            result = login_and_prepare(user_id, user_pw, log_callback=log_cb)
            driver = result[0] if isinstance(result, tuple) and result else (result if result else None)
            err_msg = result[1] if isinstance(result, tuple) and len(result) > 1 and result[1] else None
            
            ok = False
            if driver:
                ok = True
                set_driver(driver)
                save_creds(user_id, user_pw)
                update_last_action()
                start_auto_refresh()
                if not log_lines: log_lines = ["로그인 완료", "조회 페이지 대기 중."]
                if "로그인 완료" not in log_lines: log_cb("로그인 완료/성공")
            else:
                ok = False
                if not log_lines: log_lines = [err_msg or "로그인 실패!"]
                if err_msg: log_cb(err_msg)
            
            # 최종 결과 JSON 전송
            final_res = {"ok": ok, "log": log_lines, "error": err_msg if not ok else None}
            self.write_chunk(("RESULT:" + json.dumps(final_res, ensure_ascii=False) + "\n").encode("utf-8"))
            
        except Exception as e:
            err = f"[예외] {e}"
            if not log_lines: log_lines = [err]
            else: log_lines.append(err)
            final_res = {"ok": False, "log": log_lines, "error": str(e)}
            self.write_chunk(("RESULT:" + json.dumps(final_res, ensure_ascii=False) + "\n").encode("utf-8"))
        finally:
            self.write_chunk(b"")

    def handle_run(self):
        body = self.parse_body()
        containers = body.get("containers") or []
        if not containers:
            self.send_json({"ok": False, "error": "containers 없음"})
            return
        use_saved = body.get("useSavedCreds", True)
        user_id = body.get("userId", "").strip() if not use_saved else None
        user_pw = body.get("userPw", "") if not use_saved else None
        if use_saved:
            config = load_config()
            user_id = config.get("user_id", "")
            user_pw = config.get("user_pw", "")

        driver = get_driver()
        if not driver:
            do_logout()
            log_lines = []
            def log_cb(msg):
                log_lines.append(msg)
            try:
                result = login_and_prepare(user_id or "", user_pw or "", log_callback=log_cb)
                driver = result[0] if isinstance(result, tuple) and result else (result if result else None)
                err_msg = result[1] if isinstance(result, tuple) and len(result) > 1 and result[1] else "로그인 실패!"
                if not driver:
                    if not log_lines:
                        log_lines = [err_msg]
                    else:
                        log_lines.append(err_msg)
                    self.send_json({"ok": False, "error": "로그인 실패", "log": log_lines})
                    return
                set_driver(driver)
                save_creds(user_id, user_pw) # 조회를 통해 새로 로그인한 경우도 저장
            except Exception as e:
                if not log_lines:
                    log_lines = [f"[예외] {e}"]
                else:
                    log_lines.append(f"[예외] {e}")
                self.send_json({"ok": False, "error": str(e), "log": log_lines})
                return
        
        # 조회 시작 시점 갱신
        update_last_action()
        start_auto_refresh() # 혹시 꺼져있으면 켬

        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Transfer-Encoding", "chunked")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        def stream_log(msg):
            self.write_chunk(("LOG:" + msg + "\n").encode("utf-8"))

        try:
            log_lines, sheet1, sheet2, output_path = run_search(
                containers,
                user_id=user_id,
                user_pw=user_pw,
                driver=driver,
                keep_alive=True,
                log_callback=stream_log,
            )
            # 조회 끝난 시점 갱신 (조회 중에는 세션 안 끊김)
            update_last_action()
            
            result = {
                "sheet1": sheet1 or [],
                "sheet2": sheet2 or [],
                "output_path": output_path,
                "error": None,
            }
            if log_lines and any("오류" in str(x) or "예외" in str(x) for x in log_lines):
                result["error"] = log_lines[-1] if log_lines else "Unknown error"
            self.write_chunk(("RESULT:" + json.dumps(result, ensure_ascii=False) + "\n").encode("utf-8"))
        except Exception as e:
            self.write_chunk(("RESULT:" + json.dumps({
                "sheet1": [], "sheet2": [], "output_path": None,
                "error": str(e),
            }, ensure_ascii=False) + "\n").encode("utf-8"))
        finally:
            self.write_chunk(b"")

    def handle_logout(self):
        do_logout()
        # [주의] logout 호출 시 재로그인 정보도 날리는 게 맞음
        global _current_creds
        _current_creds = {"id": None, "pw": None}
        self.send_json({"ok": True})


def main():
    import time # Ensure time imported
    server = HTTPServer(("127.0.0.1", DAEMON_PORT), ELSDaemonHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        do_logout()
        server.shutdown()



if __name__ == "__main__":
    main()
