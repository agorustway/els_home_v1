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
    daemon_status = {"available": False, "driver_active": False, "user_id": None, "workers": [], "max_drivers": 4}
    try:
        r = urlopen(Request(DAEMON_URL + "/health", method="GET"), timeout=3)
        if r.getcode() == 200:
            data = json.loads(r.read().decode("utf-8"))
            daemon_status["available"] = True
            daemon_status["driver_active"] = data.get("driver_active", False)
            daemon_status["user_id"] = data.get("user_id")
            daemon_status["workers"] = data.get("workers", [])
            daemon_status["max_drivers"] = data.get("max_drivers", 4)
    except: pass
    
    return jsonify({
        "available": daemon_status["available"],
        "driver_active": daemon_status["driver_active"],
        "user_id": daemon_status["user_id"],
        "progress": global_progress,
        "workers": daemon_status["workers"],
        "max_drivers": daemon_status["max_drivers"],
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
        
        # [Fix] 최종 로그 스윕
        try:
            l_req = urlopen(DAEMON_URL + "/logs", timeout=1)
            l_data = json.loads(l_req.read().decode("utf-8"))
            for line in l_data.get("log", []):
                if line not in sent_logs:
                    yield f"LOG:{line}\n"; sent_logs.add(line)
        except: pass
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
        with ThreadPoolExecutor(max_workers=4) as executor:
            # [v4.5.12][Fix] Staggered Start 버그 수정
            # - 이전 로직: i<4 전체에 sleep(2) → 4건 조회 시 무조건 8초 추가 손실!
            # - 수정 로직: '2번째~4번째'만 1초 간격으로 출발. 1번째는 즉시. 5건~는 순서대로 즉시.
            futures = {}
            for i, cn in enumerate(containers):
                if 0 < i < 4: # 2~4번째 워커만 1초 간격으로 시작 (CPU 분산)
                    time.sleep(1)
                futures[executor.submit(fetch, cn)] = cn

            while futures:
                # 1. 태스크 완료 확인 및 결과 배출
                done, _ = wait(futures.keys(), timeout=0.5, return_when=FIRST_COMPLETED)
                for f in done:
                    res, cn = f.result()
                    rows = res.get("result", [[cn, "ERROR", res.get("error")] + [""]*12])
                    final_rows.extend(rows)
                    global_progress["completed"] += 1
                    yield "RESULT_PARTIAL:" + json.dumps({"result": rows}, ensure_ascii=False) + "\n"
                    del futures[f]

                # 2. 로그 실시간 스트리밍 (루프 도중)
                try:
                    l_req = urlopen(DAEMON_URL + "/logs", timeout=1)
                    l_data = json.loads(l_req.read().decode("utf-8"))
                    for line in l_data.get("log", []):
                        if line not in sent_logs:
                            yield f"LOG:{line}\n"
                            sent_logs.add(line)
                except: pass

            # 3. [Fix] 모든 작업 완료 후 남아있는 로그 최종 스윕 (릴레이 지연 고려)
            time.sleep(1)
            try:
                l_req = urlopen(DAEMON_URL + "/logs", timeout=2)
                l_data = json.loads(l_req.read().decode("utf-8"))
                for line in l_data.get("log", []):
                    if line not in sent_logs:
                        yield f"LOG:{line}\n"
                        sent_logs.add(line)
            except: pass

        # 엑셀 생성 (openpyxl - 2시트, 서식, 틀고정)
        if final_rows:
            token = str(uuid.uuid4())[:8]
            from collections import defaultdict
            import openpyxl
            from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
            from openpyxl.utils import get_column_letter

            grouped = defaultdict(list)
            for row in final_rows:
                grouped[str(row[0])].append(row)

            no1_rows, all_sorted = [], []
            for cn, rows_g in grouped.items():
                sorted_r = sorted(rows_g, key=lambda r: int(r[1]) if str(r[1]).isdigit() else 999)
                all_sorted.extend(sorted_r)
                no1 = next((r for r in sorted_r if str(r[1]) == '1'), None)
                if no1:
                    no1_rows.append(no1)

            wb = openpyxl.Workbook()
            h_font   = Font(name='맑은 고딕', size=10, bold=True)
            d_font   = Font(name='맑은 고딕', size=10)
            imp_font = Font(name='맑은 고딕', size=10, color='B91C1C')
            inb_font = Font(name='맑은 고딕', size=10, color='1D4ED8')
            h_fill   = PatternFill('solid', fgColor='F2F2F2')
            imp_fill = PatternFill('solid', fgColor='FEE2E2')
            inb_fill = PatternFill('solid', fgColor='EFF6FF')
            h_align  = Alignment(horizontal='center', vertical='center')
            d_align  = Alignment(vertical='center')
            th_side  = Side(style='thin', color='94A3B8')
            td_side  = Side(style='thin', color='E2E8F0')
            h_border = Border(top=th_side, left=th_side, bottom=th_side, right=th_side)
            d_border = Border(top=td_side, left=td_side, bottom=td_side, right=td_side)

            def write_ws(ws, data_rows):
                ws.append(headers)
                for r in data_rows:
                    ws.append([str(v) if v is not None else '' for v in r])
                for row_cells in ws.iter_rows():
                    for cell in row_cells:
                        if cell.row == 1:
                            cell.font = h_font; cell.fill = h_fill
                            cell.alignment = h_align; cell.border = h_border
                        else:
                            val = str(cell.value or '')
                            cell.alignment = d_align; cell.border = d_border
                            if '수입' in val:
                                cell.fill = imp_fill; cell.font = imp_font
                            elif '반입' in val:
                                cell.fill = inb_fill; cell.font = inb_font
                            else:
                                cell.font = d_font
                ws.freeze_panes = 'A2'
                if ws.dimensions:
                    ws.auto_filter.ref = ws.dimensions
                for col_cells in ws.columns:
                    max_len = 0
                    for cell in col_cells:
                        l = sum(2 if ord(c) > 127 else 1 for c in str(cell.value or ''))
                        max_len = max(max_len, l)
                    ws.column_dimensions[get_column_letter(col_cells[0].column)].width = min(max_len + 2, 50)
                ws.row_dimensions[1].height = 18

            ws1 = wb.active; ws1.title = '최신이력_No1'
            write_ws(ws1, no1_rows)
            ws2 = wb.create_sheet('전체이력')
            write_ws(ws2, all_sorted)

            out = io.BytesIO()
            wb.save(out); out.seek(0)
            now_kst = datetime.now(KST)
            file_name = f"컨테이너이력조회_{now_kst.strftime('%Y%m%d%H%M%S')}.xlsx"
            file_store[token] = {'data': out.read(), 'name': file_name}
            yield "RESULT:" + json.dumps({"ok": True, "result": final_rows, "downloadToken": token, "fileName": file_name}, ensure_ascii=False) + "\n"

        global_progress["is_running"] = False

    return Response(generate(), mimetype="text/plain; charset=utf-8")

@app.route("/api/els/download/<token>", methods=["GET"])
def download(token):
    item = file_store.pop(token, None)
    if not item: return "Expired", 404
    buf  = item['data'] if isinstance(item, dict) else item
    name = item.get('name', 'Container_History.xlsx') if isinstance(item, dict) else (request.args.get('filename') or 'Container_History.xlsx')
    from urllib.parse import quote
    safe = quote(name, safe='')
    return Response(buf, mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f"attachment; filename*=UTF-8''{safe}"})

@app.route("/api/els/screenshot", methods=["GET"])
def screenshot():
    idx = request.args.get('idx', '1')
    try:
        r = urlopen(DAEMON_URL + f"/screenshot?idx={idx}", timeout=5)
        return Response(r.read(), mimetype='image/png')
    except: return "Screenshot fail", 404

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=2931, threaded=True)
