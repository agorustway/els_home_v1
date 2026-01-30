"""
ELS 컨테이너 이력조회 백엔드 — Flask API (Docker용)
/api/els/* 동일 스펙. Python els_web_runner.py 호출.
"""
import os
import sys
import json
import subprocess
import tempfile
import uuid
from pathlib import Path

from flask import Flask, request, jsonify, Response, send_file
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # 20MB

ELSBOT_DIR = Path("/app/elsbot")
RUNNER = ELSBOT_DIR / "els_web_runner.py"
CONFIG_PATH = ELSBOT_DIR / "els_config.json"

file_store = {}


def run_runner(cmd, extra_args=None, env=None, stdin_data=None):
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
    return jsonify({"available": True, "parseAvailable": True})


@app.route("/api/els/config", methods=["GET"])
def config_get():
    if not CONFIG_PATH.exists():
        return jsonify({"hasSaved": False, "defaultUserId": ""})
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        uid = data.get("user_id", "")
        has_saved = bool(uid and data.get("user_pw"))
        return jsonify({"hasSaved": has_saved, "defaultUserId": uid})
    except Exception:
        return jsonify({"hasSaved": False, "defaultUserId": ""})


@app.route("/api/els/config", methods=["POST"])
def config_post():
    data = request.get_json() or {}
    uid = (data.get("userId") or "").strip()
    pw = data.get("userPw") or ""
    if not uid or not pw:
        return jsonify({"error": "아이디와 비밀번호가 필요합니다."}), 400
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(
        json.dumps({"user_id": uid, "user_pw": pw}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return jsonify({"success": True, "defaultUserId": uid})


@app.route("/api/els/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    use_saved = data.get("useSavedCreds", True)
    uid = data.get("userId") or ""
    pw = data.get("userPw") or ""
    extra = []
    if not use_saved and uid:
        extra.extend(["--user-id", uid])
    if not use_saved and pw:
        extra.extend(["--user-pw", pw])
    r = run_runner("login", extra_args=extra)
    out = (r.stdout or "").strip()
    if r.returncode != 0:
        return jsonify({"ok": False, "error": (r.stderr or out)[:500], "log": [r.stderr or out]}), 500
    try:
        start, end = out.rfind("{"), out.rfind("}")
        if start >= 0 and end >= start:
            obj = json.loads(out[start : end + 1])
        else:
            obj = json.loads(out)
        return jsonify({"ok": obj.get("ok"), "log": obj.get("log", []), "error": obj.get("error")})
    except json.JSONDecodeError:
        return jsonify({"ok": False, "error": "응답 파싱 실패", "log": [out[:300]]}), 500


def _stream_run(containers, use_saved, uid, pw):
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
    data = request.get_json() or {}
    containers = data.get("containers") or []
    if not containers:
        return jsonify({"error": "containers 배열이 필요합니다."}), 400
    use_saved = data.get("useSavedCreds", True)
    uid = data.get("userId") or ""
    pw = data.get("userPw") or ""
    return Response(
        _stream_run(containers, use_saved, uid, pw),
        mimetype="text/plain; charset=utf-8",
    )


@app.route("/api/els/parse-xlsx", methods=["POST"])
def parse_xlsx():
    if "file" not in request.files:
        return jsonify({"error": "container_list.xlsx 형식만 지원합니다."}), 400
    f = request.files["file"]
    if not f or not (f.filename or "").lower().endswith(".xlsx"):
        return jsonify({"error": "container_list.xlsx 형식만 지원합니다."}), 400
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
    return jsonify({"ok": True})


@app.route("/api/els/template", methods=["GET"])
def template():
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
    app.run(host="0.0.0.0", port=2929)
