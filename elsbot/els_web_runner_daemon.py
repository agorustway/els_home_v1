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

# 프로세스 내 전역 드라이버(한 번에 하나의 세션만)
_driver = None
_lock = threading.Lock()

DAEMON_PORT = 31999


def get_driver():
    with _lock:
        return _driver


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
            except Exception:
                pass
            _driver = None


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
        try:
            body = self.parse_body()
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
        log_lines = []
        try:
            result = login_and_prepare(user_id, user_pw)
            driver = result[0] if isinstance(result, tuple) and result else (result if result else None)
            err_msg = result[1] if isinstance(result, tuple) and len(result) > 1 and result[1] else None
            if driver:
                set_driver(driver)
                log_lines = ["로그인 성공.", "조회 페이지 대기 중."]
                self.send_json({"ok": True, "log": log_lines})
            else:
                log_lines = [err_msg or "로그인 실패!"]
                self.send_json({"ok": False, "log": log_lines})
        except Exception as e:
            log_lines = [f"[예외] {e}"]
            self.send_json({"ok": False, "log": log_lines})

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
            try:
                result = login_and_prepare(user_id or "", user_pw or "")
                driver = result[0] if isinstance(result, tuple) and result else (result if result else None)
                err_msg = result[1] if isinstance(result, tuple) and len(result) > 1 and result[1] else "로그인 실패!"
                if not driver:
                    self.send_json({"ok": False, "error": "로그인 실패", "log": [err_msg]})
                    return
                set_driver(driver)
            except Exception as e:
                self.send_json({"ok": False, "error": str(e), "log": [f"[예외] {e}"]})
                return

        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Transfer-Encoding", "chunked")
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
        self.send_json({"ok": True})


def main():
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
