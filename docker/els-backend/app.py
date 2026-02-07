import os
import sys
import json
import subprocess
import tempfile
import uuid
import logging
import time
import re
import io
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError

import pandas as pd
from flask import Flask, request, jsonify, Response, send_file
# [추가] CORS 보안 정책 해제용 라이브러리
from flask_cors import CORS 
from werkzeug.utils import secure_filename

# --- 로깅 설정 ---
logging.basicConfig(level=logging.INFO, format='[%(asctime)s] [%(levelname)s] In %(module)s: %(message)s')

app = Flask(__name__)
# --- [수정] CORS 설정: 모든 로컬 포트 + 외부 도메인 허용 ---
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # 20MB

ELSBOT_DIR = Path("/app/elsbot")
# Local fallback if /app/elsbot doesn't exist (running on host)
if not ELSBOT_DIR.exists():
    ELSBOT_DIR = Path("elsbot").resolve()

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
        result = subprocess.run(args, cwd=str(ELSBOT_DIR), capture_output=True, text=True, encoding="utf-8", timeout=300, env=env)
        return result
    except Exception as e:
        app.logger.exception(f"Subprocess failed: {e}")
        raise

def _parse_grid_text(cn, grid_text):
    if not grid_text: return [[cn, "NODATA", "데이터 없음"] + [""]*12]
    
    rows = []
    found_any = False
    blacklist = ["SKR", "YML", "ZIM", "최병훈", "안녕하세요", "로그아웃", "조회"]
    lines = grid_text.split('\n')
    
    for line in lines:
        stripped = line.strip()
        if not stripped or any(kw in stripped for kw in blacklist): continue
        
        # 정규표현식으로 정밀 파싱
        row_data = re.split(r'\t|\s{2,}', stripped)
        
        # No 컬럼이 숫자인 행만 (1~20)
        if row_data and row_data[0].isdigit() and 1 <= int(row_data[0]) <= 20:
            # 데이터 길이를 14개로 맞추기 (부족하면 빈 문자열 추가)
            while len(row_data) < 14:
                row_data.append("")
            
            # [컨테이너번호] + [No, 수출입, 구분, ...] (총 15개)
            full_row = [cn] + row_data[:14]
            
            # 빈 행 필터링 (컨테이너 번호와 No만 있고 나머지가 비어있는 경우)
            if any(cell.strip() for cell in full_row[2:]):  # 3번째 컬럼부터 데이터가 있는지 확인
                rows.append(full_row)
                found_any = True
            
    if not found_any:
        return [[cn, "NODATA", "내역 없음"] + [""]*12]
    return rows

@app.route("/api/els/capabilities", methods=["GET"])
def capabilities():
    # 백엔드 내부에서 데몬 상태 확인 시 3회 재시도 로직 도입 (안정성 극대화)
    daemon_status = {"available": False, "driver_active": False, "user_id": None}
    
    for attempt in range(1, 4):
        try:
            r = urlopen(Request(DAEMON_URL + "/health", method="GET"), timeout=3)
            if r.getcode() == 200:
                raw = r.read().decode("utf-8")
                data = json.loads(raw)
                daemon_status["available"] = True
                daemon_status["driver_active"] = data.get("driver_active", False)
                daemon_status["user_id"] = data.get("user_id")
                
                # 살아있음이 확인되면 즉시 루프 탈출
                if daemon_status["driver_active"]:
                    break
        except Exception as e:
            app.logger.warning(f"[세션체크] {attempt}회차 시도 실패: {e}")
        
        if attempt < 3:
            time.sleep(0.5) # 잠시 대기 후 재시도
    
    return jsonify({
        "available": daemon_status["available"],
        "driver_active": daemon_status["driver_active"],
        "user_id": daemon_status.get("user_id"),
        "parseAvailable": True
    })

@app.route("/api/els/config", methods=["GET"])
def config_get():
    from datetime import datetime
    if not CONFIG_PATH.exists():
        return jsonify({"hasSaved": False, "defaultUserId": ""})
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        uid = data.get("user_id", "")
        mtime = os.path.getmtime(str(CONFIG_PATH))
        dt = datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M:%S')
        return jsonify({
            "hasSaved": bool(uid and data.get("user_pw")), 
            "defaultUserId": uid,
            "lastSaved": dt
        })
    except:
        return jsonify({"hasSaved": False, "defaultUserId": ""})

@app.route("/api/els/config", methods=["POST"])
def config_post():
    from datetime import datetime
    data = request.get_json(silent=True)
    if not data: return jsonify({"error": "No data"}), 400
    uid = (data.get("userId") or "").strip()
    pw = data.get("userPw") or ""
    if not uid or not pw: return jsonify({"error": "ID/PW required"}), 400
    
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps({"user_id": uid, "user_pw": pw}, ensure_ascii=False, indent=2), encoding="utf-8")
    
    mtime = os.path.getmtime(str(CONFIG_PATH))
    dt = datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M:%S')
    
    return jsonify({"success": True, "defaultUserId": uid, "lastSaved": dt})

@app.route("/api/els/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    use_saved = data.get("useSavedCreds", True)
    uid = data.get("userId") or ""
    pw = data.get("userPw") or ""

    show_browser = data.get("showBrowser", False)

    if _daemon_available():
        try:
            body = json.dumps({"useSavedCreds": use_saved, "userId": uid, "userPw": pw, "showBrowser": show_browser}, ensure_ascii=False).encode("utf-8")
            req = Request(DAEMON_URL + "/login", data=body, method="POST", headers={"Content-Type": "application/json"})
            r = urlopen(req, timeout=90)
            raw_resp = r.read().decode("utf-8")
            
            # RESULT: 이후의 JSON만 파싱 (LOG 출력 무시)
            if "RESULT:" in raw_resp:
                json_start = raw_resp.find("RESULT:") + 7
                json_str = raw_resp[json_start:].strip()
                daemon_result = json.loads(json_str)
            else:
                # RESULT:가 없으면 전체를 JSON으로 파싱 시도
                daemon_result = json.loads(raw_resp)
            
            # 데몬 응답을 그대로 반환 (log 필드 포함)
            return jsonify(daemon_result)
        except Exception as e:
            app.logger.error(f"Daemon login failed: {e}. Raw response: {locals().get('raw_resp', 'N/A')}")
            return jsonify({"ok": False, "error": f"데몬 통신 실패: {str(e)}"})

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

def _stream_run_daemon(containers, use_saved, uid, pw, show_browser=False):
    # Daemon Mode: Loop through containers here in App.py
    final_rows = []
    headers = ["컨테이너번호", "No", "수출입", "구분", "터미널", "MOVE TIME", "모선", "항차", "선사", "적공", "SIZE", "POD", "POL", "차량번호", "RFID"]
    
    yield "LOG:Daemon 서버를 통해 조회를 시작합니다.\n"
    
    for cn in containers:
        cn = cn.strip().upper()
        if not cn: continue
        
        yield f"LOG:[{cn}] 조회 요청 중...\n"
        
        try:
            # 데몬 서버 규격인 'containerNo' (단수형)로 전달하여 조회 실패 해결
            body = json.dumps({
                "userId": uid, 
                "userPw": pw, 
                "containerNo": cn, 
                "showBrowser": show_browser
            }, ensure_ascii=False).encode("utf-8")
            req = Request(DAEMON_URL + "/run", data=body, method="POST", headers={"Content-Type": "application/json"})
            resp = urlopen(req, timeout=60)
            raw_resp = resp.read().decode("utf-8")
            
            # LOG: 출력 무시하고 JSON만 파싱
            res_json = None
            for line in raw_resp.split('\n'):
                line = line.strip()
                if line.startswith('{') and line.endswith('}'):
                    try:
                        res_json = json.loads(line)
                        break
                    except:
                        continue
            
            if not res_json:
                # 전체를 JSON으로 파싱 시도
                res_json = json.loads(raw_resp)
            
            if res_json.get("ok"):
                data_text = res_json.get("data")
                parsed_rows = _parse_grid_text(cn, data_text)
                final_rows.extend(parsed_rows)
                yield f"LOG:[{cn}] 조회 완료 (데이터 {len(parsed_rows)}건)\n"
            else:
                err = res_json.get("error") or res_json.get("message") or "Unknown Error"
                yield f"LOG:[{cn}] 조회 실패: {err}\n"
                final_rows.append([cn, "ERROR", err] + [""]*12)
                
        except Exception as e:
            app.logger.error(f"Daemon call failed for {cn}: {e}")
            yield f"LOG:[{cn}] 통신/시스템 에러: {e}\n"
            final_rows.append([cn, "ERROR", f"System Error: {e}"] + [""]*12)

    # Generate Excel and Final Result
    if final_rows:
        try:
            yield "LOG:결과 데이터 집계 중...\n"
            from openpyxl.styles import PatternFill
            from datetime import datetime
            
            df_all = pd.DataFrame(final_rows, columns=headers)
            
            # Sheet1: 각 컨테이너의 1번 행만 (요약)
            df_summary = df_all.groupby('컨테이너번호').first().reset_index()
            
            # Sheet2: 전체 데이터
            df_full = df_all
            
            # 파일명 생성: els_result_260207_134257.xlsx
            now = datetime.now()
            filename = f"els_result_{now.strftime('%y%m%d')}_{now.strftime('%H%M%S')}.xlsx"
            
            # Create Excel in memory
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                # Sheet1: 요약
                df_summary.to_excel(writer, index=False, sheet_name='요약')
                ws1 = writer.sheets['요약']
                
                # Sheet2: 전체
                df_full.to_excel(writer, index=False, sheet_name='전체')
                ws2 = writer.sheets['전체']
                
                # 색상 적용 및 셀 너비 조정
                red_fill = PatternFill(start_color="FFE6E6", end_color="FFE6E6", fill_type="solid")
                blue_fill = PatternFill(start_color="E6F2FF", end_color="E6F2FF", fill_type="solid")
                
                for ws in [ws1, ws2]:
                    # 셀 너비 자동 조정 (한글 고려 폰트 폭 계산)
                    for column_cells in ws.columns:
                        max_length = 0
                        column = column_cells[0].column_letter
                        for cell in column_cells:
                            try:
                                if cell.value:
                                    # 한글은 대략 영문/숫자의 1.8배 폭 차지함
                                    current_val = str(cell.value)
                                    val_len = 0
                                    for char in current_val:
                                        if ord('가') <= ord(char) <= ord('힣'):
                                            val_len += 2.0
                                        else:
                                            val_len += 1.2
                                    if val_len > max_length:
                                        max_length = val_len
                            except: pass
                        adjusted_width = min(max_length + 2, 60)
                        ws.column_dimensions[column].width = adjusted_width
                    
                    # 색상 적용 (수입/반입 글자 있는 칸만!)
                    for row in ws.iter_rows(min_row=2, max_row=ws.max_row):
                        # "수출입" 혹은 "구분" 컬럼 어딘가에 있을 "수입"/"반입" 찾기
                        for cell in row:
                            if cell.value:
                                cell_val = str(cell.value).strip()
                                if cell_val == "수입":
                                    cell.fill = red_fill
                                elif cell_val == "반입":
                                    cell.fill = blue_fill
            
            output.seek(0)
            token = str(uuid.uuid4()).replace("-", "")[:16]
            file_store[token] = output.read()
            
            # Frontend로 보낼 결과 데이터 정제 (NaN 방지)
            df_clean = df_all.where(pd.notnull(df_all), None) # NaN을 null(None)로 변환
            rows_list = df_clean.values.tolist()
            
            # 한 번 더 안전장치: 리스트 내부에 혹시 남아있을 수 있는 float('nan') 제거
            import math
            def _clean_nan(v):
                if isinstance(v, float) and (math.isnan(v) or math.isinf(v)): return None
                return v
            
            final_json_rows = [[_clean_nan(cell) for cell in row] for row in rows_list]

            result_obj = {
                "ok": True,
                "result": final_json_rows,
                "downloadToken": token,
                "fileName": filename
            }
            # allow_nan=False 설정으로 규격 외 JSON 생성 원천 차단
            yield "RESULT:" + json.dumps(result_obj, ensure_ascii=False, allow_nan=False) + "\n"
        except Exception as e:
             yield f"LOG:[결과생성] 엑셀 생성 중 에러: {e}\n"
    else:
        yield "LOG:처리된 데이터가 없습니다.\n"

def _stream_run(containers, use_saved, uid, pw, show_browser=False):
    if _daemon_available():
        yield from _stream_run_daemon(containers, use_saved, uid, pw, show_browser=show_browser)
        return
    
        # Fallback to subprocess (non-daemon mode)
        extra = ["--containers", json.dumps(containers)]
        if not use_saved: extra.extend(["--user-id", uid, "--user-pw", pw])
        proc = subprocess.Popen([sys.executable, str(RUNNER), "run"] + extra, cwd=str(ELSBOT_DIR), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", env={**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUNBUFFERED": "1"}, bufsize=1)
        
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
    return Response(_stream_run(data.get("containers", []), data.get("useSavedCreds", True), data.get("userId", ""), data.get("userPw", ""), data.get("showBrowser", False) ), mimetype="text/plain; charset=utf-8")

@app.route("/api/els/parse-xlsx", methods=["POST"])
def parse_xlsx():
    f = request.files["file"]
    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        f.save(tmp.name)
        r = run_runner("parse", extra_args=[tmp.name])
        os.unlink(tmp.name)
    return jsonify(json.loads(r.stdout))

@app.route("/api/els/download/<token>", methods=["GET"])
def download(token):
    buf = file_store.pop(token, None)
    if not buf: return "Expired", 404
    name = request.args.get("filename") or "els_result.xlsx"
    return Response(buf, mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename*=UTF-8''{name}"})

@app.route("/api/els/logout", methods=["POST"])
def logout():
    if _daemon_available():
        req = Request(DAEMON_URL + "/quit", data=b"{}", method="POST", headers={"Content-Type": "application/json"})
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
    app.run(host="0.0.0.0", port=2929, threaded=True)
