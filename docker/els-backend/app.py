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
import math
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError

import pandas as pd
from flask import Flask, request, jsonify, Response, send_file
from flask_cors import CORS 
from werkzeug.utils import secure_filename
from openpyxl.styles import PatternFill
from datetime import datetime

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

# --- 전역 변수 ---
file_store = {}
# [추가] 진행률 트래킹용 전역 변수
global_progress = {"total": 0, "completed": 0, "is_running": False}

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
        
        # No 컬럼이 숫자인 행만 (1~200) - 0은 메타데이터일 가능성이 큼
        if row_data and row_data[0].isdigit():
            no_val = int(row_data[0])
            if 1 <= no_val <= 200:
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
        "progress": global_progress, # 진행률 정보 포함
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
            r = urlopen(req, timeout=180) # [수정] NAS 안정화 시간을 고려하여 타임아웃 180초로 대폭 상향
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
    from concurrent.futures import ThreadPoolExecutor, as_completed
    global global_progress
    
    final_rows = []
    headers = ["컨테이너번호", "No", "수출입", "구분", "터미널", "MOVE TIME", "모선", "항차", "선사", "적공", "SIZE", "POD", "POL", "차량번호", "RFID"]
    
    # 진행률 초기화
    global_progress = {"total": len(containers), "completed": 0, "is_running": True}
    yield f"LOG:병렬 조회를 시작합니다. (대상: {len(containers)}건)\n"
    
    # 병렬 처리를 위한 함수 (전과 동일)
    def fetch_container(cn):
        # ... (이전 코드와 동일하므로 생략하거나 유지)
        cn = cn.strip().upper()
        if not cn: return []
        try:
            body = json.dumps({"userId": uid, "userPw": pw, "containerNo": cn, "showBrowser": show_browser}, ensure_ascii=False).encode("utf-8")
            req = Request(DAEMON_URL + "/run", data=body, method="POST", headers={"Content-Type": "application/json"})
            resp = urlopen(req, timeout=180)
            res_json = json.loads(resp.read().decode("utf-8"))
            return res_json.get("result", []), cn, res_json.get("error")
        except Exception as e:
            return [[cn, "ERROR", str(e)] + [""]*12], cn, str(e)

    with ThreadPoolExecutor(max_workers=2) as executor:
        future_to_cn = {executor.submit(fetch_container, cn): cn for cn in containers}
        
        for future in as_completed(future_to_cn):
            rows, cn, err = future.result()
            final_rows.extend(rows)
            
            # 진행률 업데이트
            global_progress["completed"] += 1
            percent = int((global_progress["completed"] / global_progress["total"]) * 100)
            
            if err:
                yield f"LOG:❌ [{global_progress['completed']}/{global_progress['total']}] [{cn}] 실패: {err}\n"
            else:
                yield f"LOG:✔ [{global_progress['completed']}/{global_progress['total']}] [{cn}] 완료 ({len(rows)}건)\n"
                
                # [실시간 전송 로직] 건별 완료 시 부분 결과 전송
                if rows:
                    # null/NaN 값 안전 처리
                    def _safe_val(v):
                        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)): return None
                        return v
                    
                    partial_rows = [[_safe_val(cell) for cell in row] for row in rows]
                    
                    # 부분 결과 JSON 전송 (프론트에서 누적 처리)
                    yield "RESULT_PARTIAL:" + json.dumps({"result": partial_rows}, ensure_ascii=False) + "\n"

    global_progress["is_running"] = False
    # Generate Final Result and Excel (이후 로직 동일)
    if final_rows:
        try:
            yield "LOG:조회 완료! 데이터 정리 중...\n"
            
            # 1. 데이터프레임 생성 및 정제 (가장 중요)
            df_all = pd.DataFrame(final_rows, columns=headers)
            df_clean = df_all.where(pd.notnull(df_all), None)
            
            # 안전하게 JSON용 리스트 변환
            def _safe_val(v):
                if isinstance(v, float) and (math.isnan(v) or math.isinf(v)): return None
                return v
            rows_list = [[_safe_val(cell) for cell in row] for row in df_clean.values.tolist()]

            # 2. 화면에 데이터 먼저 뿌려주기 (이걸 먼저 해야 형이 바로 볼 수 있어!)
            token = str(uuid.uuid4()).replace("-", "")[:16]
            filename = f"els_result_{datetime.now().strftime('%y%m%d_%H%M%S')}.xlsx"
            
            result_obj = {
                "ok": True,
                "result": rows_list,
                "downloadToken": token, # 일단 토큰 발행
                "fileName": filename
            }
            yield "RESULT:" + json.dumps(result_obj, ensure_ascii=False) + "\n"
            yield "LOG:✔ 화면 데이터 전송 완료\n"

            # 3. 그 다음 엑셀 파일 생성 (실패해도 데이터는 보임)
            try:
                yield "LOG:엑셀 파일 생성 중...\n"
                output = io.BytesIO()
                with pd.ExcelWriter(output, engine='openpyxl') as writer:
                    # 중복 제거된 전체 데이터 저장
                    df_all.drop_duplicates().to_excel(writer, index=False, sheet_name='조회결과')
                    ws = writer.sheets['조회결과']
                    # 간단한 너비 조절
                    for col in ws.columns:
                        ws.column_dimensions[col[0].column_letter].width = 18
                
                output.seek(0)
                file_store[token] = output.read()
                yield "LOG:✔ 엑셀 생성 완료 (다운로드 가능)\n"
            except Exception as e:
                yield f"LOG:![알림] 엑셀 파일 생성은 실패했습니다 (데이터는 정상). 에러: {e}\n"
                # 엑셀 실패 시 토큰 무효화
                if token in file_store: del file_store[token]

            yield "LOG:----------------------------------------\n"
            yield "LOG:모든 작업이 완료되었습니다. 결과 버튼을 확인하세요!\n"
                
        except Exception as e:
             yield f"LOG:[치명적에러] 최종 집계 중 오류 발생: {e}\n"
             import traceback
             print(traceback.format_exc())
    else:
        yield "LOG:조회 결과 데이터가 하나도 없습니다.\n"

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
