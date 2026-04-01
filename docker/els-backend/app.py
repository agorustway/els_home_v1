import os
import sys
import json
import threading
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
from urllib.error import URLError, HTTPError

import pandas as pd
from flask import Flask, request, jsonify, Response, send_file
from flask_cors import CORS 
from werkzeug.utils import secure_filename
from openpyxl.styles import PatternFill
from datetime import datetime
from supabase import create_client, Client

# --- Supabase 설정 ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

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
# [수정] 데몬 주소를 환경변수에서 가져오도록 변경
DAEMON_URL = os.environ.get("DAEMON_URL", "http://127.0.0.1:31999")

# --- 전역 변수 ---
file_store = {}
# [추가] 진행률 트래킹용 전역 변수
global_progress = {"total": 0, "completed": 0, "is_running": False}
LAST_RESULT_FILE = ELSBOT_DIR / "last_search_result.json"

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

    return jsonify({"ok": True})

# --- 활동 로그 (Activity Logs) ---
@app.route("/api/logs", methods=["POST"])
def post_log():
    """Vercel의 /api/logs를 대체하는 로그 저장 API"""
    if not supabase: return jsonify({"error": "Supabase not configured"}), 500
    try:
        data = request.get_json(silent=True) or {}
        # Next.js의 로그 수집 형식 그대로 수용
        log_entry = {
            "user_email": data.get("user_email") or data.get("email", "anonymous"),
            "action_type": data.get("action_type") or data.get("type", "PAGE_VIEW"),
            "path": data.get("path", "/"),
            "metadata": data.get("metadata", {})
        }
        res = supabase.from_("user_activity_logs").insert(log_entry).execute()
        return jsonify({"ok": True})
    except Exception as e:
        app.logger.error(f"로그 저장 실패: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/logs", methods=["GET"])
def get_logs():
    """활동 로그 조회 (날짜 범위 검색 포함)"""
    if not supabase: return jsonify({"error": "Supabase not configured"}), 500
    try:
        email = request.args.get("email", "")
        log_type = request.args.get("type", "")
        start_date = request.args.get("startDate", "")
        end_date = request.args.get("endDate", "")
        page = int(request.args.get("page", 1))
        limit = int(request.args.get("limit", 30))

        query = supabase.from_("user_activity_logs").select("*", count="exact")
        if email: query = query.ilike("user_email", f"%{email}%")
        if log_type: query = query.eq("action_type", log_type)
        if start_date: query = query.gte("created_at", f"{start_date} 00:00:00")
        if end_date: query = query.lte("created_at", f"{end_date} 23:59:59")
        
        query = query.order("created_at", desc=True)
        
        # 페이징
        start = (page - 1) * limit
        end = start + limit - 1
        query = query.range(start, end)
        
        res = query.execute()
        
        return jsonify({
            "logs": res.data,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": res.count,
                "totalPages": math.ceil((res.count or 0) / limit)
            }
        })
    except Exception as e:
        app.logger.error(f"로그 조회 실패: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/logs", methods=["DELETE"])
def delete_logs():
    """로그 삭제 (Vercel API와 동일 사양)"""
    if not supabase: return jsonify({"error": "Supabase not configured"}), 500
    try:
        data = request.get_json(silent=True) or {}
        delete_type = data.get("deleteType") # 'ALL' or 'DATE'
        date_before = data.get("dateBefore")
        
        query = supabase.from_("user_activity_logs").delete()
        
        if delete_type == "ALL":
            # 모든 데이터 삭제 (id가 null이 아닌 것)
            query = query.neq("id", "00000000-0000-0000-0000-000000000000")
        elif date_before:
            query = query.lt("created_at", date_before)
        else:
            return jsonify({"error": "Invalid deletion criteria"}), 400
            
        res = query.execute()
        return jsonify({"success": True})
    except Exception as e:
        app.logger.error(f"로그 삭제 실패: {e}")
        return jsonify({"error": str(e)}), 500

# --- 차량 관제 (Vehicle Tracking) ---
@app.route("/api/vehicle-tracking", methods=["GET"])
def get_vehicle_tracking():
    """실시간 차량 위치 폴링용 API (Vercel 트래픽 전가 방지)"""
    if not supabase: return jsonify({"error": "Supabase not configured"}), 500
    try:
        from datetime import timezone, timedelta
        KST = timezone(timedelta(hours=9))
        twenty_four_hours_ago = (datetime.now(KST) - timedelta(hours=24)).isoformat()

        # 최근 24시간 내 운행 중이거나 종료된 차량 조회
        res = supabase.from_("vehicle_trips") \
                .select("*") \
                .gte("started_at", twenty_four_hours_ago) \
                .in_("status", ["driving", "paused", "completed"]) \
                .order("started_at", desc=True) \
                .execute()
        
        trips = res.data
        trip_ids = [t["id"] for t in trips]
        
        if not trip_ids:
            return jsonify({"data": [], "trips": []})

        # 각 트립의 마지막 위치 조회 (RPC 대신 Python 루프로 처리 - 나스 리소스 활용)
        loc_res = supabase.from_("vehicle_locations") \
                .select("*") \
                .in_("trip_id", trip_ids) \
                .order("recorded_at", desc=True) \
                .execute()
        
        loc_map = {}
        for l in loc_res.data:
            tid = l["trip_id"]
            if tid not in loc_map:
                loc_map[tid] = l
        
        merged = []
        for t in trips:
            t["lastLocation"] = loc_map.get(t["id"])
            t["last_location_address"] = t["lastLocation"]["address"] if t["lastLocation"] else None
            merged.append(t)

        # 프론트엔드 하위 호환성을 위해 trips와 data 양쪽으로 반환
        return jsonify({"data": merged, "trips": merged})
    except Exception as e:
        app.logger.error(f"관제 데이터 조회 실패: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/vehicle-tracking/<trip_id>/locations", methods=["GET"])
def get_trip_locations(trip_id):
    """특정 트립의 전체 경로 조회 (나스에서 처리)"""
    if not supabase: return jsonify({"error": "Supabase not configured"}), 500
    try:
        res = supabase.from_("vehicle_locations") \
                .select("*") \
                .eq("trip_id", trip_id) \
                .order("recorded_at", asc=True) \
                .execute()
        return jsonify({"locations": res.data})
    except Exception as e:
        app.logger.error(f"경로 데이터 조회 실패: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/debug/view", methods=["GET"])
def view_debug_log():
    """파일에 저장된 디버그 로그를 보여줍니다."""
    log_file = Path("debug_app.log")
    if not log_file.exists(): return "공개된 로그가 아직 없습니다."
    return send_file(log_file, mimetype="text/plain")

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
    
    # [추가] 20분 이상 지난 작업은 좀비 프로세스로 간주하여 강제 해제 (배경 동시조회 꼬임 방지)
    if global_progress.get("is_running") and global_progress.get("start_time"):
        if time.time() - global_progress["start_time"] > 1200:
            app.logger.warning(f"[좀비복구] {global_progress.get('user')}의 작업이 20분을 초과하여 강제 종료 처리합니다.")
            global_progress["is_running"] = False
            global_progress["completed"] = global_progress["total"]

    return jsonify({
        "available": daemon_status["available"],
        "driver_active": daemon_status["driver_active"],
        "user_id": daemon_status.get("user_id"),
        "progress": global_progress,
        "workers": data.get("workers", []) if 'data' in locals() else [],
        "max_drivers": data.get("max_drivers", 3) if 'data' in locals() else 3,
        "parseAvailable": True
    })

@app.route("/api/els/config", methods=["GET"])
def config_get():
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

    if not _daemon_available():
        return jsonify({"ok": False, "error": "ELS 데몬이 실행되지 않았습니다."}), 404

    def generate():
        try:
            body = json.dumps({"useSavedCreds": use_saved, "userId": uid, "userPw": pw, "showBrowser": show_browser}, ensure_ascii=False).encode("utf-8")
            req = Request(DAEMON_URL + "/login", data=body, method="POST", headers={"Content-Type": "application/json"})
            
            login_result = {}
            def _thread_login():
                try:
                    # [NAS 최적화] 5개 세션 부팅(Stagger 15s)을 고려하여 400초로 연장
                    r = urlopen(req, timeout=400)
                    login_result['resp'] = json.loads(r.read().decode("utf-8"))
                except Exception as e:
                    login_result['error'] = str(e)

            t = threading.Thread(target=_thread_login)
            t.start()

            sent_logs = set()
            retry_count = 0
            while t.is_alive():
                try:
                    # 데몬의 /logs 엔드포인트에서 최신 로그 긁어오기
                    l_req = urlopen(DAEMON_URL + "/logs", timeout=5)
                    l_data = json.loads(l_req.read().decode("utf-8"))
                    has_new_daemon_log = False
                    for line in l_data.get("log", []):
                        if line not in sent_logs:
                            yield f"LOG:{line}\n"
                            sent_logs.add(line)
                            has_new_daemon_log = True
                    
                    if has_new_daemon_log:
                        retry_count = 0 # 데몬 로그가 찍히면 백엔드 심박 타이머 리셋 (사용자 혼란 방지)
                except: pass
                
                # 데몬으로부터 새로운 로그가 한동안 없을 때만 백엔드 심박 로그를 출력
                retry_count += 1
                if retry_count >= 10: 
                    yield f"LOG:[백엔드] 세션 초기화 대기 중... ({retry_count}s)\n"
                    # 심박 로그 출력 후 타이머를 약간 늦게 돌려 도배 방지
                    retry_count = 3 
                
                time.sleep(1)
            
            t.join()
            
            if 'error' in login_result:
                yield f"LOG:![오류] 데몬 로그인 실패: {login_result['error']}\n"
                yield "RESULT:" + json.dumps({"ok": False, "error": login_result['error']}) + "\n"
            else:
                final = login_result.get('resp', {})
                for line in final.get("log", []):
                    if line not in sent_logs:
                        yield f"LOG:{line}\n"
                
                if not final.get("ok") and final.get("error") == "LOGIN_ERROR_CREDENTIALS":
                     yield f"LOG:![경고] 이트랜스 계정 정보가 틀립니다.\n"
                
                yield "RESULT:" + json.dumps(final, ensure_ascii=False) + "\n"

        except Exception as e:
            yield f"LOG:![점검] 로그인 스트리밍 중 오류: {e}\n"

    return Response(generate(), mimetype="text/plain; charset=utf-8", headers={
        "X-Accel-Buffering": "no",
        "Cache-Control": "no-cache"
    })

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

@app.route("/api/els/stop-daemon", methods=["POST"])
def stop_daemon():
    global global_progress
    if _daemon_available():
        try:
            req = Request(DAEMON_URL + "/stop", method="POST")
            urlopen(req, timeout=5)
            # [추가] 데몬 중지 시 백엔드의 진행률 락도 강제 해제
            global_progress["is_running"] = False
            global_progress["completed"] = global_progress.get("total", 0)
            return jsonify({"ok": True})
        except:
            pass
    return jsonify({"ok": False, "error": "데몬 중지 실패"})

def _stream_run_daemon(containers, use_saved, uid, pw, show_browser=False):
    from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
    global global_progress
    
    final_rows = []
    headers = ["컨테이너번호", "No", "수출입", "구분", "터미널", "MOVE TIME", "모선", "항차", "선사", "적공", "SIZE", "POD", "POL", "차량번호", "RFID"]
    
    # 진행률 초기화 (시작 시간 기록하여 데드락 감지용 활용)
    global_progress = {
        "total": len(containers), 
        "completed": 0, 
        "is_running": True, 
        "start_time": time.time(),
        "user": uid
    }
    yield f"LOG:병렬 조회를 시작합니다. (대상: {len(containers)}건, 병렬: 3개 세션 구동)\n"
    
    try:
        def fetch_container(cn):
            cn = cn.strip().upper()
            if not cn: return []
            st = time.time()
            try:
                body = json.dumps({"userId": uid, "userPw": pw, "containerNo": cn, "showBrowser": show_browser}, ensure_ascii=False).encode("utf-8")
                req = Request(DAEMON_URL + "/run", data=body, method="POST", headers={"Content-Type": "application/json"})
                resp = urlopen(req, timeout=120)
                res_json = json.loads(resp.read().decode("utf-8"))
                worker_id = res_json.get("worker_id", "?")
                daemon_id = res_json.get("daemon_id", "1") # [추가] 데몬 식별 ID 수집
                return res_json.get("result", []), cn, res_json.get("error"), round(time.time() - st, 1), worker_id, daemon_id
            except Exception as e:
                return [[cn, "ERROR", str(e)] + [""]*12], cn, str(e), round(time.time() - st, 1), "?", "ER"

        sent_daemon_logs = set()
        with ThreadPoolExecutor(max_workers=3) as executor:
            # 딕셔너리에 (컨테이너번호, 재시도횟수) 상태 저장
            futures = {executor.submit(fetch_container, cn): (cn, 0) for cn in containers}
            
            log_poll_counter = 0
            while futures:
                # 🎯 [실시간 폴링 지연] 매 루프마다 가져오지 않고 3회에 한 번만(약 1.5초 주기) 가져옴으로써 NAS 부하 감소
                log_poll_counter += 1
                if log_poll_counter >= 3:
                    try:
                        l_req = urlopen(DAEMON_URL + "/logs", timeout=1)
                        l_data = json.loads(l_req.read().decode("utf-8"))
                        for line in l_data.get("log", []):
                            if line not in sent_daemon_logs:
                                yield f"LOG:{line}\n"
                                sent_daemon_logs.add(line)
                    except: pass
                    log_poll_counter = 0

                # 완료된 작업이 있는지 체크 (0.5초 대기)
                done, not_done = wait(futures.keys(), timeout=0.5, return_when=FIRST_COMPLETED)
                for f in done:
                    cn, retries = futures[f]
                    rows, _, err, elapsed, worker_id, daemon_id = f.result()
                    
                    # 🎯 에러 발생 시 재시도 로직 (1회 한정하여 다른 데몬에게 하청/재조회 시도)
                    if err and retries < 1:
                        yield f"LOG:⚠️ [D#{daemon_id}-B#{worker_id}] [{cn}] 오류 발생, 재조회 시도 중... ({err})\n"
                        new_f = executor.submit(fetch_container, cn)
                        futures[new_f] = (cn, retries + 1)
                        del futures[f]
                        continue
                    
                    final_rows.extend(rows)
                    global_progress["completed"] += 1
                    
                    # 안전한 JSON 전송을 위한 처리
                    def _safe_val(v):
                        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)): return None
                        return v
                    partial_rows = [[_safe_val(cell) for cell in row] for row in rows]

                    if err:
                        yield f"LOG:❌ [D#{daemon_id}-B#{worker_id}] [{global_progress['completed']}/{global_progress['total']}] [{cn}] 실패 ({elapsed}s): {err}\n"
                        # 에러 상태도 즉시 프론트에 전달
                        yield "RESULT_PARTIAL:" + json.dumps({"result": partial_rows}, ensure_ascii=False) + "\n"
                    else:
                        yield f"LOG:✔ [D#{daemon_id}-B#{worker_id}] [{global_progress['completed']}/{global_progress['total']}] [{cn}] 완료 ({len(rows)}건) ({elapsed}s)\n"
                        # 성공 결과 전달 (내역 없음 포함)
                        yield "RESULT_PARTIAL:" + json.dumps({"result": partial_rows}, ensure_ascii=False) + "\n"
                    
                    del futures[f]
    finally:
        global_progress["is_running"] = False
        global_progress["completed"] = global_progress["total"]
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
                from openpyxl.styles import PatternFill, Font, Alignment
                from openpyxl.utils import get_column_letter

                output = io.BytesIO()

                # 시트1: 최신현황 (No=1인 것만), 시트2: 전체이력
                df_latest = df_all[df_all['No'].astype(str) == '1'].drop_duplicates()
                df_full = df_all.drop_duplicates()

                with pd.ExcelWriter(output, engine='openpyxl') as writer:
                    df_latest.to_excel(writer, index=False, sheet_name='최신현황')
                    df_full.to_excel(writer, index=False, sheet_name='전체이력')

                    # 서식 정의
                    header_fill = PatternFill(start_color='D6EAF8', end_color='D6EAF8', fill_type='solid')
                    banip_fill = PatternFill(start_color='D6EAF8', end_color='D6EAF8', fill_type='solid')
                    suip_fill = PatternFill(start_color='FADBD8', end_color='FADBD8', fill_type='solid')
                    header_font = Font(bold=True)

                    for sheet_name in ['최신현황', '전체이력']:
                        ws = writer.sheets[sheet_name]

                        # (1) 제목행 서식: 옅은 파랑 배경 + 볼드
                        for cell in ws[1]:
                            cell.fill = header_fill
                            cell.font = header_font

                        # (2) 틀 고정 (1행)
                        ws.freeze_panes = ws['A2']

                        # (3) 자동 필터 (정렬 가능)
                        ws.auto_filter.ref = ws.dimensions

                        # (4) 컬럼 너비 자동 조절 (가장 긴 글씨 기준, 한글 폭 보정)
                        for col_idx, col_cells in enumerate(ws.columns, 1):
                            max_length = 0
                            for cell in col_cells:
                                try:
                                    val_str = str(cell.value) if cell.value is not None else ""
                                    cell_len = len(val_str)
                                    korean_extra = sum(1 for c in val_str if ord(c) > 127)
                                    cell_len += korean_extra
                                    if cell_len > max_length:
                                        max_length = cell_len
                                except:
                                    pass
                            ws.column_dimensions[get_column_letter(col_idx)].width = max(max_length + 3, 8)

                        # (5) 조건부 셀 색상: "반입" → 옅은 파랑, "수입" → 옅은 붉은색
                        for row in ws.iter_rows(min_row=2, max_row=ws.max_row):
                            for cell in row:
                                val = str(cell.value or '')
                                if '반입' in val:
                                    cell.fill = banip_fill
                                elif '수입' in val:
                                    cell.fill = suip_fill

                output.seek(0)
                file_store[token] = output.read()
                yield "LOG:✔ 엑셀 생성 완료 (다운로드 가능)\n"
            except Exception as e:
                yield f"LOG:![알림] 엑셀 파일 생성은 실패했습니다 (데이터는 정상). 에러: {e}\n"
                # 엑셀 실패 시 토큰 무효화
                if token in file_store: del file_store[token]

            yield "LOG:----------------------------------------\n"
            yield "LOG:모든 작업이 완료되었습니다. 결과창을 확인하세요!\n"
                
        except Exception as e:
             yield f"LOG:[치명적에러] 최종 집계 중 오류 발생: {e}\n"
             import traceback
             print(traceback.format_exc())
    else:
        yield "LOG:조회 결과 데이터가 하나도 없습니다.\n"

def _stream_run(containers, use_saved, uid, pw, show_browser=False):
    """데몬 모드로 컨테이너 조회를 스트리밍 실행한다."""
    if not _daemon_available():
        yield "LOG:[오류] ELS 데몬이 실행되지 않았습니다. 로그인을 먼저 수행하세요.\n"
        return
    yield from _stream_run_daemon(containers, use_saved, uid, pw, show_browser=show_browser)

@app.route("/api/els/run", methods=["POST"])
def run():
    data = request.get_json(silent=True) or {}
    return Response(_stream_run(data.get("containers", []), data.get("useSavedCreds", True), data.get("userId", ""), data.get("userPw", ""), data.get("showBrowser", False) ), mimetype="text/plain; charset=utf-8", headers={
        "X-Accel-Buffering": "no",
        "Cache-Control": "no-cache"
    })

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

@app.route("/api/last-result", methods=["GET"])
def get_last_result():
    if LAST_RESULT_FILE.exists():
        try:
            with open(LAST_RESULT_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return jsonify({"ok": True, **data})
        except: pass
    return jsonify({"ok": False, "message": "최근 데이터가 없습니다."})

@app.route("/api/els/screenshot", methods=["GET"])
def screenshot():
    """데몬으로부터 스크린샷 이미지를 가져와 릴레이합니다. (디버깅용)"""
    if _daemon_available():
        try:
            r = urlopen(DAEMON_URL + "/screenshot", timeout=5)
            return Response(r.read(), mimetype='image/png')
        except HTTPError as e:
            # 데몬이 404 등을 반환한 경우 (스크린샷이 아직 없음 등)
            error_msg = f"Daemon returned {e.code}"
            try: error_msg += " - " + e.read().decode('utf-8')
            except: pass
            return jsonify({"error": error_msg}), e.code
        except URLError as e:
            # 데몬 연결 자체가 안되는 경우
            return jsonify({"error": f"Daemon connection failed: {e.reason}"}), 503
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    return jsonify({"error": "Daemon not available"}), 404

if __name__ == "__main__":
    app.logger.info("Backend Server Ready with CORS")
    app.run(host="0.0.0.0", port=2929, threaded=True)
