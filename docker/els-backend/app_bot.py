import os
import sys
import json
import threading
import subprocess
import time
import uuid
import io
import math
from pathlib import Path
from datetime import datetime, timedelta, timezone
from flask import Flask, request, jsonify, Response, send_file
from flask_cors import CORS
from urllib.request import Request, urlopen
import pandas as pd

# --- KST 설정 ---
KST = timezone(timedelta(hours=9))

# --- [v4.5.1] BOT 전용 백엔드 ---
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

ELSBOT_DIR = Path("/app/elsbot")
if not ELSBOT_DIR.exists(): ELSBOT_DIR = Path("elsbot").resolve()
DAEMON_URL = os.environ.get("DAEMON_URL", "http://127.0.0.1:31999")
LAST_RESULT_FILE = ELSBOT_DIR / "last_search_result.json"

file_store = {}
global_progress = {"total": 0, "completed": 0, "is_running": False}

def _daemon_available():
    try:
        r = urlopen(Request(DAEMON_URL + "/health", method="GET"), timeout=2)
        return r.getcode() == 200
    except: return False

@app.route("/health", methods=["GET"])
def health(): return jsonify({"status": "ok", "service": "els-bot"})

@app.route("/api/els/capabilities", methods=["GET"])
def capabilities():
    daemon_status = {"available": False, "driver_active": False, "user_id": None, "workers": []}
    try:
        r = urlopen(Request(DAEMON_URL + "/health", method="GET"), timeout=3)
        if r.getcode() == 200:
            data = json.loads(r.read().decode("utf-8"))
            daemon_status["available"] = True
            daemon_status["driver_active"] = data.get("driver_active", False)
            daemon_status["user_id"] = data.get("user_id")
            daemon_status["workers"] = data.get("workers", [])
    except: pass
    
    return jsonify({
        "available": daemon_status["available"],
        "driver_active": daemon_status["driver_active"],
        "user_id": daemon_status["user_id"],
        "progress": global_progress,
        "workers": daemon_status["workers"],
        "parseAvailable": True
    })

@app.route("/api/els/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    if not _daemon_available(): return jsonify({"ok": False, "error": "ELS 데몬 응답 없음"}), 404

    def generate():
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        req = Request(DAEMON_URL + "/login", data=body, method="POST", headers={"Content-Type": "application/json"})
        login_result = {}
        def _thread():
            try:
                r = urlopen(req, timeout=400)
                login_result['resp'] = json.loads(r.read().decode("utf-8"))
            except Exception as e: login_result['error'] = str(e)
        t = threading.Thread(target=_thread)
        t.start()
        sent_logs = set()
        while t.is_alive():
            try:
                l_req = urlopen(DAEMON_URL + "/logs", timeout=1)
                l_data = json.loads(l_req.read().decode("utf-8"))
                for line in l_data.get("log", []):
                    if line not in sent_logs:
                        yield f"LOG:{line}\n"
                        sent_logs.add(line)
            except: pass
            time.sleep(1)
        t.join()
        res = login_result.get('resp', {"ok": False, "error": login_result.get('error', 'Unknown')})
        yield "RESULT:" + json.dumps(res, ensure_ascii=False) + "\n"

    return Response(generate(), mimetype="text/plain; charset=utf-8")

@app.route("/api/els/run", methods=["POST"])
def run():
    data = request.get_json(silent=True) or {}
    containers = data.get("containers", [])
    uid = data.get("userId", "")
    pw = data.get("userPw", "")
    show_browser = data.get("showBrowser", False)

    global global_progress
    global_progress = {"total": len(containers), "completed": 0, "is_running": True, "start_time": time.time()}

    def generate():
        final_rows = []
        headers = ["컨테이너번호", "No", "수출입", "구분", "터미널", "MOVE TIME", "모선", "항차", "선사", "적공", "SIZE", "POD", "POL", "차량번호", "RFID"]
        from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
        
        def fetch(cn):
            try:
                body = json.dumps({"userId": uid, "userPw": pw, "containerNo": cn, "showBrowser": show_browser}, ensure_ascii=False).encode("utf-8")
                req = Request(DAEMON_URL + "/run", data=body, method="POST", headers={"Content-Type": "application/json"})
                r = urlopen(req, timeout=150)
                return json.loads(r.read().decode("utf-8")), cn
            except Exception as e: return {"ok": False, "error": str(e)}, cn

        sent_logs = set()
        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = {executor.submit(fetch, cn): cn for cn in containers}
            while futures:
                try:
                    l_req = urlopen(DAEMON_URL + "/logs", timeout=1)
                    l_data = json.loads(l_req.read().decode("utf-8"))
                    for line in l_data.get("log", []):
                        if line not in sent_logs:
                            yield f"LOG:{line}\n"; sent_logs.add(line)
                except: pass
                
                done, _ = wait(futures.keys(), timeout=1, return_when=FIRST_COMPLETED)
                for f in done:
                    res, cn = f.result()
                    rows = res.get("result", [[cn, "ERROR", res.get("error")] + [""]*12])
                    final_rows.extend(rows)
                    global_progress["completed"] += 1
                    yield "RESULT_PARTIAL:" + json.dumps({"result": rows}, ensure_ascii=False) + "\n"
                    del futures[f]

        # 엑셀 생성
        if final_rows:
            token = str(uuid.uuid4())[:8]
            df = pd.DataFrame(final_rows, columns=headers)
            out = io.BytesIO()
            df.to_excel(out, index=False)
            out.seek(0)
            file_store[token] = out.read()
            yield "RESULT:" + json.dumps({"ok": True, "result": final_rows, "downloadToken": token}, ensure_ascii=False) + "\n"
        
        global_progress["is_running"] = False

    return Response(generate(), mimetype="text/plain; charset=utf-8")

@app.route("/api/els/download/<token>", methods=["GET"])
def download(token):
    buf = file_store.pop(token, None)
    if not buf: return "Expired", 404
    return Response(buf, mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=els_result.xlsx"})

@app.route("/api/els/screenshot", methods=["GET"])
def screenshot():
    try:
        r = urlopen(DAEMON_URL + "/screenshot", timeout=5)
        return Response(r.read(), mimetype='image/png')
    except: return "Screenshot fail", 404

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=2931, threaded=True)
