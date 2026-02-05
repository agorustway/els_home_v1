import os
import sys
import json
import subprocess
import tempfile
import uuid
import logging
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError

from flask import Flask, request, jsonify, Response, send_file
# [추가] CORS 보안 정책 해제용 라이브러리
from flask_cors import CORS 
from werkzeug.utils import secure_filename

# --- 로깅 설정 ---
logging.basicConfig(level=logging.INFO, format='[%(asctime)s] [%(levelname)s] In %(module)s: %(message)s')

app = Flask(__name__)
# --- [수정] CORS 설정: 외부 접속 허용 (형의 사이트와 로컬 모두) ---
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:3000", "https://elssolution.net"]}}, supports_credentials=True)

app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # 20MB

ELSBOT_DIR = Path("/app/elsbot")
RUNNER = ELSBOT_DIR / "els_web_runner.py"
CONFIG_PATH = ELSBOT_DIR / "els_config.json"
DAEMON_URL = "http://127.0.0.1:31999"

file_store = {}

# --- 전역 에러 핸들러 ---
@app.errorhandler(Exception)
def handle_global_exception(e):
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
        return r.getcode() == 200
    except:
        return False

def run_runner(cmd, extra_args=None, env=None):
    args = [sys.executable, str(RUNNER), cmd] + (extra_args or [])
    env = dict(os.environ) if env is None else {**os.environ, **env}
    env["PYTHONIOENCODING"] = "utf-8"
    try:
        result = subprocess.run(args, cwd=str(ELSBOT_DIR), capture_output=True, text=True, timeout=300, env=env)
        return result
    except Exception as e:
        app.logger.exception(f"Subprocess failed: {e}")
        raise

@app.route("/api/els/capabilities", methods=["GET"])
def capabilities():
    return jsonify({"available": True, "parseAvailable": True})

@app.route("/api/els/config", methods=["GET"])
def config_get():
    if not CONFIG_PATH.exists():
        return jsonify({"hasSaved": False, "defaultUserId": ""})
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        uid = data.get("user_id", "")
        return jsonify({"hasSaved": bool(uid and data.get("user_pw")), "defaultUserId": uid})
    except:
        return jsonify({"hasSaved": False, "defaultUserId": ""})

# --- [수정] 아이디/비밀번호 저장 로직 (DB 역할) ---
@app.route("/api/els/config", methods=["POST"])
def config_post():
    data = request.get_json(silent=True)
    if not data: return jsonify({"error": "No data"}), 400
    uid = (data.get("userId") or "").strip()
    pw = data.get("userPw") or ""
    if not uid or not pw: return jsonify({"error": "ID/PW required"}), 400
    
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps({"user_id": uid, "user_pw": pw}, ensure_ascii=False, indent=2), encoding="utf-8")
    return jsonify({"success": True, "defaultUserId": uid})

@app.route("/api/els/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    use_saved = data.get("useSavedCreds", True)
    uid = data.get("userId") or ""
    pw = data.get("userPw") or ""

    if _daemon_available():
        try:
            body = json.dumps({"useSavedCreds": use_saved, "userId": uid, "userPw": pw}, ensure_ascii=False).encode("utf-8")
            req = Request(DAEMON_URL + "/login", data=body, method="POST", headers={"Content-Type": "application/json"})
            r = urlopen(req, timeout=90)
            return jsonify(json.loads(r.read().decode("utf-8")))
        except Exception as e:
            app.logger.error(f"Daemon login failed: {e}")

    extra = []
    if not use_saved: extra.extend(["--user-id", uid, "--user-pw", pw])
    r = run_runner("login", extra_args=extra)
    out = (r.stdout or "").strip()
    try:
        start, end = out.rfind("{"), out.rfind("}")
        obj = json.loads(out[start : end + 1]) if start >= 0 else json.loads(out)
        return jsonify(obj)
    except:
        return jsonify({"ok": False, "error": "응답 파싱 실패"})

def _stream_run_daemon(containers, use_saved, uid, pw):
    body = json.dumps({"containers": containers, "useSavedCreds": use_saved, "userId": uid, "userPw": pw}, ensure_ascii=False).encode("utf-8")
    req = Request(DAEMON_URL + "/run", data=body, method="POST", headers={"Content-Type": "application/json"})
    resp = urlopen(req, timeout=300)
    buffer = b""
    result_sent = False
    while True:
        chunk = resp.read(4096)
        if not chunk: break
        buffer += chunk
        while b"\n" in buffer:
            line, buffer = buffer.split(b"\n", 1)
            s = line.decode("utf-8").strip()
            if s.startswith("LOG:"): yield "LOG:" + s[4:] + "\n"
            elif s.startswith("RESULT:"):
                obj = json.loads(s[7:])
                if not result_sent:
                    result_sent = True
                    token = str(uuid.uuid4()).replace("-", "")[:16]
                    if obj.get("output_path") and Path(obj["output_path"]).exists():
                        file_store[token] = Path(obj["output_path"]).read_bytes()
                        Path(obj["output_path"]).unlink(missing_ok=True)
                    yield "RESULT:" + json.dumps({**obj, "downloadToken": token}, ensure_ascii=False) + "\n"

def _stream_run(containers, use_saved, uid, pw):
    if _daemon_available():
        yield from _stream_run_daemon(containers, use_saved, uid, pw)
        return
    extra = ["--containers", json.dumps(containers)]
    if not use_saved: extra.extend(["--user-id", uid, "--user-pw", pw])
    proc = subprocess.Popen([sys.executable, str(RUNNER), "run"] + extra, cwd=str(ELSBOT_DIR), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env={**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUNBUFFERED": "1"}, bufsize=1)
    
    result_sent = False
    for line in iter(proc.stdout.readline, ""):
        if line.strip().startswith("{"):
            try:
                obj = json.loads(line.strip())
                if not result_sent:
                    result_sent = True
                    token = str(uuid.uuid4()).replace("-", "")[:16]
                    if obj.get("output_path") and Path(obj["output_path"]).exists():
                        file_store[token] = Path(obj["output_path"]).read_bytes()
                        Path(obj["output_path"]).unlink(missing_ok=True)
                    yield "RESULT:" + json.dumps({**obj, "downloadToken": token}, ensure_ascii=False) + "\n"
            except: yield "LOG:" + line + "\n"
        else:
            yield "LOG:" + line + "\n"
    proc.wait()

@app.route("/api/els/run", methods=["POST"])
def run():
    data = request.get_json(silent=True) or {}
    return Response(_stream_run(data.get("containers", []), data.get("useSavedCreds", True), data.get("userId", ""), data.get("userPw", "")), mimetype="text/plain; charset=utf-8")

@app.route("/api/els/parse-xlsx", methods=["POST"])
def parse_xlsx():
    f = request.files["file"]
    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        f.save(tmp.name)
        r = run_runner("parse", extra_args=[tmp.name])
        os.unlink(tmp.name)
    return jsonify(json.loads(r.stdout))

@app.route("/api/els/download", methods=["GET"])
def download():
    token = request.args.get("token")
    buf = file_store.pop(token, None)
    if not buf: return "Expired", 404
    name = request.args.get("filename") or "els_result.xlsx"
    return Response(buf, mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename*=UTF-8''{name}"})

@app.route("/api/els/logout", methods=["POST"])
def logout():
    if _daemon_available():
        req = Request(DAEMON_URL + "/logout", data=b"{}", method="POST", headers={"Content-Type": "application/json"})
        try: urlopen(req, timeout=5)
        except: pass
    return jsonify({"ok": True})

@app.route("/api/els/template", methods=["GET"])
def template():
    from openpyxl import Workbook
    import io
    wb = Workbook()
    ws = wb.active
    ws.append(["컨테이너넘버"])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return send_file(buf, mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", as_attachment=True, download_name="template.xlsx")

if __name__ == "__main__":
    app.logger.info("Backend Server Ready with CORS")
    app.run(host="0.0.0.0", port=2929)