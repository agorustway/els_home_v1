# [v5.0.42] DNS 장애 환경 대응: 전역 소켓 패치 적용 (가장 먼저 실행)
import dns_fix
dns_fix.apply_dns_patch()

import os
import sys
import json
import threading
import time
import logging
import pandas as pd
import io
import re
import tempfile
from pathlib import Path
from datetime import datetime, timedelta, timezone
from flask import Flask, request, jsonify, Response, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename
from supabase import create_client, Client
from urllib.request import urlopen
import xml.etree.ElementTree as ET
from urllib.parse import quote
import requests
import urllib3
urllib3.disable_warnings()

# --- KST 설정 ---
KST = timezone(timedelta(hours=9))

# --- Supabase 설정 ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

# --- 로깅 설정 ---
logging.basicConfig(level=logging.INFO, format='[%(asctime)s] [CORE] %(message)s')
# --- 환경 변수 로드 상태 디버깅 (필요 시에만 주석 해제) ---
# required_vars = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY"]
# print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [CORE] [DEBUG] 환경변수 체크 시작...")
# for v in required_vars:
#     val = os.environ.get(v)
#     if val:
#         has_whitespace = val != val.strip()
#         masked = val[:4] + "****" if len(val) > 4 else "****"
#         print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [CORE] [DEBUG] {v}: ✅ {masked} (길이: {len(val)}, 공백포함: {has_whitespace})")
#     else:
#         print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [CORE] [DEBUG] {v}: ❌ 미설정")
# print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [CORE] [DEBUG] 환경변수/네트워크 체크 완료")
# -----------------------------

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

last_mtime_cache = {}
asan_sync_lock = threading.Lock()

def sync_asan_dispatch_python(force=False):
    global last_mtime_cache
    if not supabase: return
    
    # 중복 실행 방지
    if not asan_sync_lock.acquire(blocking=False):
        app.logger.warning("[자동동기화] 이미 동기화가 진행 중입니다. 이번 요청은 건너뜁니다.")
        return

    try:
        app.logger.info("[자동동기화] 아산 배차판 동기화 프로세스 시작 (Force=%s)...", force)
        res = supabase.from_("branch_dispatch_settings").select("*").eq("branch_id", "asan").single().execute()
        settings = res.data
        if not settings: 
            app.logger.error("[자동동기화] 아산 배차 설정을 찾을 수 없습니다.")
            return

        for dtype in ['glovis', 'mobis']:
            rel_path = settings.get(f"{dtype}_path")
            if not rel_path: continue
            
            full_path = Path("/app/data") / rel_path.lstrip("/")
            
            if not full_path.exists():
                app.logger.warning(f"[자동동기화] 파일을 찾을 수 없음: {full_path}")
                continue
            
            # 파일 수정 시간 체크
            mtime_ts = full_path.stat().st_mtime
            mtime = datetime.fromtimestamp(mtime_ts, tz=KST).isoformat()
            cache_mtime = last_mtime_cache.get(dtype)
            
            app.logger.info(f"[자동동기화] {dtype} 체크 - 경로: {full_path}, 파일수정일: {mtime}, 캐시: {cache_mtime}")
            
            if not force and cache_mtime == mtime:
                # app.logger.info(f"[자동동기화] {dtype} 변경 없음.")
                continue
            
            # 캐시 업데이트
            last_mtime_cache[dtype] = mtime
            
            app.logger.info(f"[자동동기화] {dtype} 데이터 추출 시작... (파일수정됨/강제)")
            
            # 엑셀 읽기
            try:
                # [v5.10.6] 엔진 명시 및 최적화
                xl = pd.ExcelFile(full_path, engine='openpyxl')
                sync_count = 0
                app.logger.info(f"[자동동기화] {dtype} 엑셀 로드 완료. 시트수: {len(xl.sheet_names)}")
                
                for sheet_name in xl.sheet_names:
                    # [v5.10.9] 더 유연한 시트명 파싱 ("4.29", "04. 29", "4월29일" 등 모두 매칭)
                    match = re.search(r'(\d+)\s*[\.월]\s*(\d+)', sheet_name)
                    if not match: continue
                    
                    m, d = int(match.group(1)), int(match.group(2))
                    now = datetime.now(KST)
                    year = now.year
                    # 12월 시트인데 현재 1월인 경우 등의 예외 처리
                    if m == 12 and now.month == 1: year -= 1
                    elif m == 1 and now.month == 12: year += 1
                    target_date = f"{year}-{m:02d}-{d:02d}"
                    
                    # 시트 파싱
                    df = pd.read_excel(xl, sheet_name=sheet_name, header=None)
                    header_idx = -1
                    for i, row in df.head(50).iterrows(): # 검색 범위 축소 (최적화)
                        # 공백 제거 후 '구분' 글자 포함 여부 확인
                        if row.astype(str).str.replace(' ', '').str.contains('구분').any():
                            header_idx = i
                            break
                    
                    if header_idx < 0: 
                        app.logger.warning(f"[자동동기화] {dtype} - 시트 '{sheet_name}'에서 '구분' 헤더를 찾을 수 없어 건너뜁니다.")
                        continue
                    
                    headers = df.iloc[header_idx].fillna('').astype(str).map(lambda x: x.replace('\n', ' ').strip()).tolist()
                    headers = [h if h else f"col_{i+1}" for i, h in enumerate(headers)]
                    data_df = df.iloc[header_idx + 1:]
                    
                    rows = []
                    comments_dict = {}
                    
                    # 메모 추출 (필요한 경우만)
                    sheet_comments = {}
                    try:
                        import openpyxl
                        wb = openpyxl.load_workbook(full_path, data_only=True, read_only=True) # ReadOnly 모드 사용
                        if sheet_name in wb.sheetnames:
                            ws = wb[sheet_name]
                    except: pass

                    row_idx_in_db = 0
                    for orig_iloc_idx, row in data_df.iterrows():
                        if any(str(c).find('합계') >= 0 for c in row if pd.notnull(c)):
                            continue
                        
                        # [v5.10.9] 하드코딩된 filter_col(12, 15) 제거하고, 유효한 데이터가 최소 3개 이상인지 검증
                        valid_cells = [c for c in row if str(c).strip() not in ['', '0', 'nan', 'None']]
                        if len(valid_cells) < 3:
                            continue
                        
                        rows.append(row.fillna('').astype(str).tolist())
                        row_idx_in_db += 1
                    
                    if rows:
                        for attempt in range(3): # 최대 3번 재시도
                            try:
                                supabase.from_("branch_dispatch").upsert({
                                    "branch_id": "asan", "type": dtype, "target_date": target_date,
                                    "headers": headers, "data": rows, "comments": {}, # 우선 comments 비움 (성능)
                                    "file_modified_at": mtime, "updated_at": now.isoformat()
                                }, on_conflict="branch_id,type,target_date").execute()
                                sync_count += 1
                                break # 성공 시 재시도 루프 탈출
                            except Exception as e:
                                app.logger.error(f"[자동동기화] {dtype} 시트 '{sheet_name}' 저장 실패 (시도 {attempt+1}/3): {e}")
                                time.sleep(1) # 1초 대기 후 재시도
                        else:
                            app.logger.error(f"[자동동기화] {dtype} 시트 '{sheet_name}' 최종 저장 실패.")
                
                app.logger.info(f"[자동동기화] {dtype} 동기화 완료 ({sync_count} 시트)")
            except Exception as e:
                app.logger.error(f"[자동동기화] {dtype} 엑셀 처리 중 에러: {e}")

    except Exception as e:
        app.logger.error(f"[자동동기화] 전체 프로세스 에러: {e}", exc_info=True)
    finally:
        asan_sync_lock.release()

def asan_sync_scheduler():
    app.logger.info("[스케줄러] 아산 배차판 자동 동기화 스케줄러 시작")
    while True:
        try:
            now = datetime.now(KST)
            if 6 <= now.hour <= 23:
                sync_asan_dispatch_python()
            time.sleep(60)
        except Exception as e:
            app.logger.error(f"[스케줄러] 에러: {e}")
            time.sleep(60)

threading.Thread(target=asan_sync_scheduler, daemon=True).start()

def nas_sync_scheduler():
    """매일 새벽 01:30에 나스 전 지점 폴더를 스캔하여 AI 지식을 업데이트합니다. (자료실 제외)"""
    app.logger.info("[스케줄러] NAS AI 지식 자동 동기화 스케줄러 대기 중 (01:30 실행)")
    
    # 스캔 대상 목록 (도커 내부 경로 기준)
    scan_targets = [
        {"path": "/app/volume1/서울본사", "branch": "본사"},
        {"path": "/app/volume2/아산지점", "branch": "아산"},
        {"path": "/app/volume2/당진지점", "branch": "당진"},
        {"path": "/app/volume2/중부지점", "branch": "중부"},
        {"path": "/app/volume2/예산지점", "branch": "예산"}
    ]
    
    while True:
        try:
            now = datetime.now(KST)
            # 매일 새벽 01:30에 실행
            if now.hour == 1 and now.minute == 30:
                app.logger.info(f"[스케줄러] NAS 정기 스캔 시작 (대상: {len(scan_targets)}개 구역)")
                for target in scan_targets:
                    if not supabase: break
                    try:
                        # 동기 함수로 직접 호출
                        res = process_nas_directory(supabase, target["path"], target["branch"])
                        app.logger.info(f"✅ {target['branch']} 동기화 완료: {res}")
                    except Exception as e:
                        app.logger.error(f"❌ {target['branch']} 동기화 실패: {e}")
                
                # [v5.9.3] 웹 게시판 첨부파일 정기 동기화 추가
                try:
                    app.logger.info("🚀 [스케줄러] 웹 게시판 첨부파일 동기화 시작...")
                    init_web_supabase(supabase)
                    process_web_attachments()
                    app.logger.info("✅ [스케줄러] 웹 게시판 첨부파일 동기화 완료")
                except Exception as e:
                    app.logger.error(f"❌ [스케줄러] 웹 게시판 첨부파일 동기화 실패: {e}")
                
                # 중복 실행 방지를 위해 1분간 대기
                time.sleep(60)
            
            # 30초마다 체크
            time.sleep(30)
        except Exception as e:
            app.logger.error(f"[스케줄러] NAS 루프 오류: {e}")
            time.sleep(60)

threading.Thread(target=nas_sync_scheduler, daemon=True).start()

# --- API 엔드포인트 ---
@app.route("/health", methods=["GET"])
def health(): return jsonify({"status": "ok", "service": "els-core", "sb_ready": bool(supabase)})

# 1. 로그 관리 (Logs)
@app.route("/api/logs", methods=["GET"])
def get_logs():
    import math
    email = request.args.get("email", "")
    log_type = request.args.get("type", "")
    start_date = request.args.get("startDate", "")
    end_date = request.args.get("endDate", "")
    page, limit = int(request.args.get("page", 1)), int(request.args.get("limit", 30))
    try:
        query = supabase.from_("user_activity_logs").select("*", count="exact")
        if email: query = query.ilike("user_email", f"%{email}%")
        if log_type: query = query.eq("action_type", log_type)
        if start_date: query = query.gte("created_at", f"{start_date} 00:00:00")
        if end_date: query = query.lte("created_at", f"{end_date} 23:59:59")
        query = query.order("created_at", desc=True)
        start = (page - 1) * limit
        res = query.range(start, start + limit - 1).execute()
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

@app.route("/api/logs", methods=["POST"])
def post_log():
    data = request.json or {}
    meta = data.get("metadata", {})
    supabase.from_("user_activity_logs").insert({
        "user_id": meta.get("user_id"), "user_email": data.get("user_email", "anonymous"),
        "action_type": data.get("action_type", "PAGE_VIEW"), "path": data.get("path", "/"), "metadata": meta
    }).execute()
    return jsonify({"ok": True})

@app.route("/api/logs", methods=["DELETE"])
def delete_logs():
    supabase.from_("user_activity_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    return jsonify({"success": True})

# 2. 차량 관제 (Vehicle Tracking / Dispatch)
@app.route("/api/vehicle-tracking", methods=["GET"])
def get_vehicle_tracking():
    twenty_four_hours_ago = (datetime.now(KST) - timedelta(hours=24)).isoformat()
    trips_res = supabase.from_("vehicle_trips").select("*").gte("started_at", twenty_four_hours_ago) \
            .in_("status", ["driving", "paused", "completed"]).order("started_at", desc=True).execute()
    trips = trips_res.data or []
    trip_ids = [t["id"] for t in trips if t.get("id")]
    if not trip_ids: return jsonify({"data": [], "trips": []})
    locs_res = supabase.from_("vehicle_locations").select("*").in_("trip_id", trip_ids).order("recorded_at", desc=True).execute()
    locs = locs_res.data or []
    loc_map = {}
    for l in locs:
        tid = l["trip_id"]
        if tid not in loc_map:  # 가장 최근 위치만 유지 (ordered by recorded_at desc)
            loc_map[tid] = l
    for t in trips:
        t["lastLocation"] = loc_map.get(t["id"])
        t["last_location_address"] = t["lastLocation"]["address"] if t.get("lastLocation") else None
    return jsonify({"data": trips, "trips": trips})

@app.route("/api/vehicle-tracking/trips/<trip_id>", methods=["GET"])
def get_trip_detail(trip_id):
    """트립 상세 정보 조회"""
    try:
        res = supabase.from_("vehicle_trips").select("*").eq("id", trip_id).single().execute()
        return jsonify(res.data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/vehicle-tracking/trips/<trip_id>/locations", methods=["GET"])
@app.route("/api/vehicle-tracking/<trip_id>/locations", methods=["GET"])
def get_trip_locations(trip_id):
    """특정 트립의 전체 경로 조회"""
    try:
        res = supabase.from_("vehicle_locations").select("*").eq("trip_id", trip_id).order("recorded_at", asc=True).execute()
        return jsonify({"locations": res.data})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/vehicle-tracking/trips/<trip_id>/logs", methods=["GET"])
def get_trip_logs(trip_id):
    """트립 운행 로그 조회"""
    try:
        res = supabase.from_("vehicle_trip_logs").select("*").eq("trip_id", trip_id).order("created_at", desc=True).execute()
        return jsonify({"logs": res.data})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/vehicle-tracking/trips/<trip_id>", methods=["DELETE"])
def delete_trip(trip_id):
    supabase.from_("vehicle_locations").delete().eq("trip_id", trip_id).execute()
    supabase.from_("vehicle_trip_logs").delete().eq("trip_id", trip_id).execute()
    supabase.from_("vehicle_trips").delete().eq("id", trip_id).execute()
    return jsonify({"ok": True})

# 3. 배차판 조회 (Branch Dispatch)
@app.route("/api/branches/<branch_id>/dispatch", methods=["GET"])
def get_branch_dispatch(branch_id):
    dtype = request.args.get("type", "glovis")
    res = supabase.from_("branch_dispatch").select("*").eq("branch_id", branch_id).eq("type", dtype).order("target_date", asc=True).execute()
    return jsonify({"ok": True, "data": res.data})

# 3-1. 아산 배차판 강제 동기화 (Manual Trigger)
@app.route("/api/branches/asan/sync", methods=["POST"])
def trigger_asan_sync():
    """웹 UI의 'NAS 동기화' 버튼 클릭 시 호출됨"""
    try:
        app.logger.info("🚀 [API] 아산 배차판 강제 동기화 요청 수신")
        # force=True 옵션으로 캐시 무시하고 강제 실행하되, 백그라운드 쓰레드로 분리하여 Vercel Timeout(504) 방지
        threading.Thread(target=sync_asan_dispatch_python, args=(True,), daemon=True).start()
        return jsonify({"ok": True, "message": "강제 동기화가 백그라운드에서 시작되었습니다. 잠시 후 새로고침 해주세요."}), 202
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# 4. 공휴일/나스파일/스크린샷-릴레이
@app.route("/api/off-days", methods=["GET"])
def get_off_days():
    res = supabase.from_("off_days").select("*").order("date", asc=True).execute()
    return jsonify({"ok": True, "data": res.data})

@app.route("/api/nas/files", methods=["GET", "POST"])
def handle_nas_files():
    if request.method == "POST":
        f = request.files["file"]; rel = request.form.get("path", "/uploads")
        path = Path("/app/data") / rel.strip("/"); path.mkdir(parents=True, exist_ok=True)
        fname = secure_filename(f.filename); f.save(str(path / fname))
        return jsonify({"success": True, "path": f"{rel.strip('/')}/{fname}"})
    rel = request.args.get("path")
    return send_file(str(Path("/app/data") / rel.strip("/")), as_attachment=True)

from nas_vectorizer import process_nas_directory
from web_vectorizer import process_web_attachments, init_supabase as init_web_supabase

# --- 벡터화 작업 상태 추적 (NAS/Web 공유) ---
vect_status = {
    "is_running": False,
    "start_time": None,
    "current_branch": None
}
vect_lock = threading.Lock()

def _check_vect_busy():
    """좀비 락 해제 후 busy 여부를 반환. busy이면 (True, response) 반환."""
    global vect_status
    if vect_status["is_running"] and vect_status["start_time"]:
        elapsed = time.time() - vect_status["start_time"]
        if elapsed > 7200:
            app.logger.warning(f"⚠️ [좀비방지] {vect_status['current_branch']} 작업이 2시간 초과 → 락 강제 해제")
            vect_status["is_running"] = False

    if vect_status["is_running"]:
        return True, jsonify({
            "status": "busy",
            "message": f"Another task ({vect_status['current_branch']}) is already running.",
            "elapsed_sec": int(time.time() - vect_status["start_time"]) if vect_status["start_time"] else 0
        })
    return False, None

def _run_vect_task(branch_name, task_fn):
    """벡터화 백그라운드 태스크를 공통 패턴으로 실행."""
    global vect_status
    with vect_lock:
        try:
            vect_status["is_running"] = True
            vect_status["start_time"] = time.time()
            vect_status["current_branch"] = branch_name

            app.logger.info(f"🚀 [Vectorize] {branch_name} 시작...")
            task_fn()
            app.logger.info(f"✅ [Vectorize] {branch_name} 완료")
        except Exception as e:
            app.logger.error(f"❌ [Vectorize] {branch_name} 실패: {e}")
        finally:
            vect_status["is_running"] = False
            vect_status["start_time"] = None

@app.route('/api/vectorize/nas/unlock', methods=['POST'])
def force_unlock_nas_vectorize():
    """작업이 꼬였을 때 강제로 락을 해제하는 API"""
    global vect_status
    vect_status = {"is_running": False, "start_time": None, "current_branch": None}
    app.logger.info("🔓 [API] 벡터화 락 강제 해제됨")
    return jsonify({"ok": True, "message": "Vectorization lock forced to release."})

@app.route('/api/vectorize/nas', methods=['POST'])
def trigger_nas_vectorize():
    """NAS 폴더 크롤링 및 벡터화 트리거 (Phase 5)."""
    if not supabase:
        return jsonify({"error": "Supabase client not initialized"}), 500

    data = request.json or {}
    raw_dir = data.get("directory", "/app/data/work-docs")
    branch_name = data.get("branch", "NAS자료")

    busy, resp = _check_vect_busy()
    if busy:
        return resp, 429

    threading.Thread(
        target=_run_vect_task,
        args=(branch_name, lambda: process_nas_directory(supabase, raw_dir, branch_name)),
        daemon=True
    ).start()

    return jsonify({"status": "processing", "message": f"Started vectorization for {branch_name} in background."}), 202

@app.route('/api/vectorize/web', methods=['POST'])
def trigger_web_vectorize():
    """웹 게시판 첨부파일 벡터화 트리거 (Phase 5 Extension)."""
    if not supabase:
        return jsonify({"error": "Supabase client not initialized"}), 500

    busy, resp = _check_vect_busy()
    if busy:
        return resp, 429

    def task():
        init_web_supabase(supabase)
        process_web_attachments()

    threading.Thread(target=_run_vect_task, args=("Web Attachments", task), daemon=True).start()

    return jsonify({"status": "processing", "message": "Started vectorization for Web Attachments in background."}), 202

import requests

@app.route('/api/proxy/kskill', methods=['GET'])
def proxy_kskill():
    """Vercel 의 IP 차단(403)을 우회하기 위한 NAS 자체 프록시"""
    target_url = request.args.get('url')
    if not target_url:
        return jsonify({"error": "Missing proxy url"}), 400
        
    try:
        res = requests.get(target_url, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
        return (res.text, res.status_code, {'Content-Type': 'application/json'})
    except Exception as e:
        app.logger.error(f"K-SKILL Proxy error: {e}")
        return jsonify({"error": str(e)}), 502

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=2930, threaded=True)
