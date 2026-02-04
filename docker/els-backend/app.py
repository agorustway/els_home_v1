"""
ELS 컨테이너 이력조회 백엔드 — Flask API (Docker용)
/api/els/* 동일 스펙. 데몬 사용 시 세션 유지(재로그인·속도 개선), 미사용 시 els_web_runner.py 호출.
"""
import os
import sys
import json
import subprocess
import tempfile
import uuid
import logging
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError

from flask import Flask, request, jsonify, Response, send_file
from werkzeug.utils import secure_filename

# --- 로깅 설정 ---
# Docker 환경에서는 stdout/stderr로 로그를 보내야 `docker logs`로 볼 수 있습니다.
logging.basicConfig(level=logging.INFO, format='[%(asctime)s] [%(levelname)s] In %(module)s: %(message)s')

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # 20MB

ELSBOT_DIR = Path("/app/elsbot")
RUNNER = ELSBOT_DIR / "els_web_runner.py"
CONFIG_PATH = ELSBOT_DIR / "els_config.json"
DAEMON_URL = "http://127.0.0.1:31999"

file_store = {}

# --- 전역 에러 핸들러 ---
@app.errorhandler(Exception)
def handle_global_exception(e):
    # 처리되지 않은 모든 예외를 로깅하고 일관된 JSON 응답을 반환합니다.
    app.logger.error("An unhandled exception occurred: %s", str(e), exc_info=True)
    response = {
        "ok": False,
        "error": "An unexpected server error occurred.",
        "log": [f"[FATAL] {type(e).__name__}: {str(e)}"]
    }
    return jsonify(response), 500


def _daemon_available():
    try:
        r = urlopen(Request(DAEMON_URL + "/health", method="GET"), timeout=2)
        is_ok = r.getcode() == 200
        if not is_ok:
             app.logger.warning(f"Daemon health check failed with status: {r.getcode()}")
        return is_ok
    except Exception as e:
        app.logger.warning(f"Daemon not available at {DAEMON_URL}: {e}")
        return False


def run_runner(cmd, extra_args=None, env=None, stdin_data=None):
    # ... (기존과 동일)
    args = [sys.executable, str(RUNNER), cmd] + (extra_args or [])
    env = dict(os.environ) if env is None else {**os.environ, **env}
    env["PYTHONIOENCODING"] = "utf-8"
    return subprocess.run(
        args,
        cwd=str(ELSBOT_DIR),
        capture_output=True,
        text=True,
        timeout=300,
        env=env,
    )


@app.route("/api/els/capabilities", methods=["GET"])
def capabilities():
    app.logger.info("Received request for /api/els/capabilities")
    return jsonify({"available": True, "parseAvailable": True})


@app.route("/api/els/config", methods=["GET"])
def config_get():
    # ... (기존과 동일)
    app.logger.info("Received request for /api/els/config [GET]")
    if not CONFIG_PATH.exists():
        return jsonify({"hasSaved": False, "defaultUserId": ""})
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        uid = data.get("user_id", "")
        has_saved = bool(uid and data.get("user_pw"))
        return jsonify({"hasSaved": has_saved, "defaultUserId": uid})
    except Exception as e:
        app.logger.error(f"Failed to read config: {e}")
        return jsonify({"hasSaved": False, "defaultUserId": ""})


@app.route("/api/els/config", methods=["POST"])
def config_post():
    # ... (기존과 동일, 로깅 추가)
    app.logger.info("Received request for /api/els/config [POST]")
    data = request.get_json(silent=True)
    if data is None:
        app.logger.error("Config POST failed: request body is not valid JSON.")
        return jsonify({"error": "Invalid JSON in request body"}), 400
        
    uid = (data.get("userId") or "").strip()
    pw = data.get("userPw") or ""
    if not uid or not pw:
        return jsonify({"error": "아이디와 비밀번호가 필요합니다."`}), 400
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(
        json.dumps({"user_id": uid, "user_pw": pw}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return jsonify({"success": True, "defaultUserId": uid})


@app.route("/api/els/login", methods=["POST"])
def login():
    # --- 로그인 핸들러 방어 로직 강화 ---
    app.logger.info("Received request for /api/els/login")
    try:
        data = request.get_json(silent=True)
        if data is None:
            app.logger.error("/api/els/login: Request body is not valid JSON.")
            return jsonify({"ok": False, "error": "Invalid JSON in request body", "log": ["Request body is not valid JSON."]}), 400
        
        app.logger.info(f"/api/els/login received data: {json.dumps(data)}")

        use_saved = data.get("useSavedCreds", True)
        uid = data.get("userId") or ""
        pw = data.get("userPw") or ""

        # 데몬 우선 사용
        if _daemon_available():
            app.logger.info("Daemon is available, attempting to login via daemon.")
            try:
                body = json.dumps({
                    "useSavedCreds": use_saved,
                    "userId": uid,
                    "userPw": pw,
                }, ensure_ascii=False).encode("utf-8")
                req = Request(DAEMON_URL + "/login", data=body, method="POST", headers={"Content-Type": "application/json; charset=utf-8"})
                r = urlopen(req, timeout=90)
                raw = r.read().decode("utf-8")

                # 응답이 HTML인지 확인 (프록시 에러 등)
                if raw.strip().startswith("<"):
                    app.logger.error(f"Daemon returned unexpected HTML: {raw[:200]}")
                    return jsonify({"ok": False, "error": "데몬이 HTML을 반환했습니다.", "log": [raw[:200]]}), 500
                
                obj = json.loads(raw)
                return jsonify({"ok": obj.get("ok"), "log": obj.get("log", []), "error": obj.get("error")})
            
            except URLError as e:
                app.logger.warning(f"Daemon communication failed (URLError), falling back to subprocess. Error: {e}")
                pass  # fallback to subprocess
            except Exception as e:
                app.logger.error(f"Daemon login failed with an exception: {e}", exc_info=True)
                return jsonify({"ok": False, "error": str(e)[:500], "log": [f"[데몬 오류] {e}"]}), 500

        # 데몬 실패 시 폴백
        app.logger.info("Daemon not available or failed, falling back to subprocess runner.")
        extra = []
        if not use_saved and uid:
            extra.extend(["--user-id", uid])
        if not use_saved and pw:
            extra.extend(["--user-pw", pw])
        r = run_runner("login", extra_args=extra)
        out = (r.stdout or "").strip()
        if r.returncode != 0:
            app.logger.error(f"Subprocess runner failed with code {r.returncode}: {r.stderr or out}")
            return jsonify({"ok": False, "error": (r.stderr or out)[:500], "log": [r.stderr or out]}), 500
        
        # 응답 파싱
        try:
            start, end = out.rfind("{"), out.rfind("}")
            obj = json.loads(out[start : end + 1]) if start >= 0 and end >= start else json.loads(out)
            return jsonify({"ok": obj.get("ok"), "log": obj.get("log", []), "error": obj.get("error")})
        except json.JSONDecodeError:
            app.logger.error(f"Failed to parse subprocess response: {out[:300]}")
            return jsonify({"ok": False, "error": "응답 파싱 실패", "log": [out[:300]]}), 500

    except Exception as e:
        app.logger.error("A critical error occurred in /api/els/login handler: %s", str(e), exc_info=True)
        return jsonify({"ok": False, "error": "An critical error occurred.", "log": [f"[FATAL_HANDLER] {type(e).__name__}: {e}"]}), 500

# ... (이하 다른 라우트들은 기존과 거의 동일하게 유지, 필요 시 로깅 추가) ...

def _stream_run_daemon(containers, use_saved, uid, pw):
    # ... (기존과 동일)
    body = json.dumps({
        "containers": containers,
        "useSavedCreds": use_saved,
        "userId": uid,
        "userPw": pw,
    }, ensure_ascii=False).encode("utf-8")
    req = Request(DAEMON_URL + "/run", data=body, method="POST", headers={"Content-Type": "application/json; charset=utf-8"})
    resp = urlopen(req, timeout=300)
    buffer = b""
    result_sent = False
    while True:
        chunk = resp.read(4096)
        if not chunk:
            break
        buffer += chunk
        while b"\n" in buffer:
            line, buffer = buffer.split(b"\n", 1)
            try:
                s = line.decode("utf-8").strip()
            except Exception:
                continue
            if not s:
                continue
            if s.startswith("LOG:"):
                yield "LOG:" + s[4:] + "\n"
            elif s.startswith("RESULT:"):
                try:
                    obj = json.loads(s[7:])
                    if not result_sent:
                        result_sent = True
                        token = None
                        out_path = obj.get("output_path")
                        if out_path and Path(out_path).exists():
                            token = str(uuid.uuid4()).replace("-", "")[:16]
                            file_store[token] = Path(out_path).read_bytes()
                            try:
                                Path(out_path).unlink()
                            except Exception:
                                pass
                        yield "RESULT:" + json.dumps({
                            "sheet1": obj.get("sheet1", []),
                            "sheet2": obj.get("sheet2", []),
                            "downloadToken": token,
                            "error": obj.get("error"),
                        }, ensure_ascii=False) + "\n"
                except json.JSONDecodeError:
                    yield "LOG:" + s + "\n"
    if buffer.strip():
        try:
            s = buffer.decode("utf-8").strip()
            if s.startswith("RESULT:") and not result_sent:
                obj = json.loads(s[7:])
                token = None
                if obj.get("output_path") and Path(obj["output_path"]).exists():
                    token = str(uuid.uuid4()).replace("-", "")[:16]
                    file_store[token] = Path(obj["output_path"]).read_bytes()
                yield "RESULT:" + json.dumps({
                    "sheet1": obj.get("sheet1", []),
                    "sheet2": obj.get("sheet2", []),
                    "downloadToken": token,
                    "error": obj.get("error"),
                }, ensure_ascii=False) + "\n"
                result_sent = True
        except Exception:
            yield "LOG:" + buffer.decode("utf-8", errors="replace") + "\n"
    if not result_sent:
        yield "RESULT:" + json.dumps({
            "sheet1": [], "sheet2": [], "downloadToken": None,
            "error": "데몬이 결과를 반환하지 않았습니다.",
        }, ensure_ascii=False) + "\n"


def _stream_run(containers, use_saved, uid, pw):
    # ... (기존과 동일)
    if _daemon_available():
        try:
            app.logger.info("Streaming run via daemon.")
            for chunk in _stream_run_daemon(containers, use_saved, uid, pw):
                yield chunk
            return
        except URLError as e:
            app.logger.warning(f"Daemon stream failed (URLError), falling back. Error: {e}")
            pass
        except Exception as e:
            app.logger.warning(f"Daemon stream failed (Exception), falling back. Error: {e}")
            pass
    app.logger.info("Streaming run via subprocess.")
    extra = ["--containers", json.dumps(containers)]
    if not use_saved and uid:
        extra.extend(["--user-id", uid])
    if not use_saved and pw:
        extra.extend(["--user-pw", pw])
    proc = subprocess.Popen(
        [sys.executable, str(RUNNER), "run"] + extra,
        cwd=str(ELSBOT_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        env={**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUNBUFFERED": "1"},
        bufsize=1,
    )
    buffer = ""
    result_sent = False
    for line in iter(proc.stdout.readline, ""):
        buffer += line
        for part in buffer.split("\n"):
            if not part.strip():
                continue
            if part.strip().startswith("{"):
                try:
                    obj = json.loads(part.strip())
                    if not result_sent:
                        result_sent = True
                        token = None
                        out_path = obj.get("output_path")
                        if out_path and Path(out_path).exists():
                            token = str(uuid.uuid4()).replace("-", "")[:16]
                            file_store[token] = Path(out_path).read_bytes()
                            try:
                                Path(out_path).unlink()
                            except Exception:
                                pass
                        yield "RESULT:" + json.dumps({
                            "sheet1": obj.get("sheet1", []),
                            "sheet2": obj.get("sheet2", []),
                            "downloadToken": token,
                            "error": obj.get("error"),
                        }, ensure_ascii=False) + "\n"
                except json.JSONDecodeError:
                    yield "LOG:" + part + "\n"
            else:
                yield "LOG:" + part + "\n"
        buffer = ""
    if not result_sent and buffer.strip():
        if buffer.strip().startswith("{"):
            try:
                obj = json.loads(buffer.strip())
                token = None
                if obj.get("output_path") and Path(obj["output_path"]).exists():
                    token = str(uuid.uuid4()).replace("-", "")[:16]
                    file_store[token] = Path(obj["output_path"]).read_bytes()
                yield "RESULT:" + json.dumps({
                    "sheet1": obj.get("sheet1", []),
                    "sheet2": obj.get("sheet2", []),
                    "downloadToken": token,
                    "error": obj.get("error"),
                }, ensure_ascii=False) + "\n"
            except json.JSONDecodeError:
                yield "LOG:" + buffer + "\n"
        else:
            yield "LOG:" + buffer + "\n"
    if not result_sent:
        yield "RESULT:" + json.dumps({
            "sheet1": [], "sheet2": [], "downloadToken": None,
            "error": "프로세스가 결과를 반환하지 않았습니다.",
        }, ensure_ascii=False) + "\n"
    proc.wait()


@app.route("/api/els/run", methods=["POST"])
def run():
    # ... (기존과 동일, 로깅 추가)
    app.logger.info("Received request for /api/els/run")
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({"error": "Invalid JSON"}), 400
    containers = data.get("containers") or []
    if not containers:
        return jsonify({"error": "containers 배열이 필요합니다."`}), 400
    use_saved = data.get("useSavedCreds", True)
    uid = data.get("userId") or ""
    pw = data.get("userPw") or ""
    return Response(
        _stream_run(containers, use_saved, uid, pw),
        mimetype="text/plain; charset=utf-8",
    )


@app.route("/api/els/parse-xlsx", methods=["POST"])
def parse_xlsx():
    # ... (기존과 동일)
    app.logger.info("Received request for /api/els/parse-xlsx")
    if "file" not in request.files:
        return jsonify({"error": "container_list.xlsx 형식만 지원합니다."`}), 400
    f = request.files["file"]
    if not f or not (f.filename or "").lower().endswith(".xlsx"):
        return jsonify({"error": "container_list.xlsx 형식만 지원합니다."`}), 400
    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        f.save(tmp.name)
        try:
            r = run_runner("parse", extra_args=[tmp.name])
        finally:
            try:
                os.unlink(tmp.name)
            except Exception:
                pass
    out = (r.stdout or "").strip()
    if r.returncode != 0:
        return jsonify({"error": r.stderr or "파싱 실패"}), 500
    try:
        obj = json.loads(out)
        return jsonify({"containers": obj.get("containers", [])})
    except json.JSONDecodeError:
        return jsonify({"error": "파싱 결과 오류"}), 500


@app.route("/api/els/download", methods=["GET"])
def download():
    # ... (기존과 동일)
    app.logger.info("Received request for /api/els/download")
    token = request.args.get("token")
    if not token:
        return "token required", 400
    buf = file_store.pop(token, None)
    if not buf:
        return "파일이 없거나 만료되었습니다.", 404
    name = request.args.get("filename") or f"els_hyper_{uuid.uuid4().hex[:8]}.xlsx"
    return Response(buf, mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename*=UTF-8''{name}"})


@app.route("/api/els/logout", methods=["POST"])
def logout():
    # ... (기존과 동일)
    app.logger.info("Received request for /api/els/logout")
    if _daemon_available():
        try:
            req = Request(DAEMON_URL + "/logout", data=b"{}", method="POST", headers={"Content-Type": "application/json"})
            urlopen(req, timeout=5)
        except Exception:
            pass
    return jsonify({"ok": True})


@app.route("/api/els/template", methods=["GET"])
def template():
    # ... (기존과 동일)
    app.logger.info("Received request for /api/els/template")
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Sheet1"
    ws.append(["컨테이너넘버"])
    ws.append([""])
    import io
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return send_file(buf, mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", as_attachment=True, download_name="container_list_양식.xlsx")


if __name__ == "__main__":
    app.logger.info("Backend Server is Ready on Port 2929")
    app.run(host="0.0.0.0", port=2929)