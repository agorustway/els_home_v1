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
# --- 환경 변수 로드 상태 디버깅 ---
required_vars = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY"]
print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [CORE] [DEBUG] 환경변수 체크 시작...")
for v in required_vars:
    val = os.environ.get(v)
    if val:
        # 값의 앞뒤 공백이나 \r이 있는지 체크 (디버깅용)
        has_whitespace = val != val.strip()
        # 보안상 앞 4자리만 출력
        masked = val[:4] + "****" if len(val) > 4 else "****"
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [CORE] [DEBUG] {v}: ✅ {masked} (길이: {len(val)}, 공백포함: {has_whitespace})")
    else:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [CORE] [DEBUG] {v}: ❌ 미설정")

print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [CORE] [DEBUG] 환경변수/네트워크 체크 완료")
# -----------------------------

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

last_mtime_cache = {}

def sync_asan_dispatch_python(force=False):
    global last_mtime_cache
    if not supabase: return
    try:
        app.logger.info("[자동동기화] 아산 배차판 동기화 시작...")
        res = supabase.from_("branch_dispatch_settings").select("*").eq("branch_id", "asan").single().execute()
        settings = res.data
        if not settings: return

        # (웹대브 로직 완전 삭제 - 로컬 마운트 경로 직접 사용)

        for dtype in ['glovis', 'mobis']:
            rel_path = settings.get(f"{dtype}_path")
            if not rel_path: continue
            
            full_path = Path("/app/data") / rel_path.lstrip("/")
            
            if not full_path.exists():
                app.logger.warning(f"[자동동기화] 파일을 찾을 수 없음: {full_path} (rel_path: {rel_path})")
                continue
            
            # 파일 수정 시간
            mtime = datetime.fromtimestamp(full_path.stat().st_mtime, tz=KST).isoformat()
            cache_mtime = last_mtime_cache.get(dtype)
            
            # 상세로그 추가 (디버깅용)
            # app.logger.info(f"[자동동기화] {dtype} 체크: cache={cache_mtime}, current={mtime}")
            
            # 변경 감지 (force 옵션이 없으면 캐시 확인)
            if not force and cache_mtime == mtime:
                continue
            
            app.logger.info(f"[자동동기화] 파일 변경 확인됨(또는 강제실행). 데이터 추출 시작... ({dtype})")
            
            # 엑셀 읽기
            xl = pd.ExcelFile(full_path)
            sync_count = 0
            
            # 기존 데이터 삭제 (정합성 보장) - UPSERT 도입으로 인해 불필요한 전체 삭제 로직 제거 (v5.5.14)
            # supabase.from_("branch_dispatch").delete().eq("branch_id", "asan").eq("type", dtype).execute()

            for sheet_name in xl.sheet_names:
                # "3.3" 형식의 시트명 파싱
                match = re.search(r'(\d+)\.(\d+)', sheet_name)
                if not match: continue
                
                m, d = int(match.group(1)), int(match.group(2))
                now = datetime.now(KST)
                year = now.year
                if m > now.month + 3: year -= 1 # 12월 시트인데 현재 3월이면 작년거
                target_date = f"{year}-{m:02d}-{d:02d}"
                
                # 시트 파싱
                df = pd.read_excel(xl, sheet_name=sheet_name, header=None)
                # '구분'이 포함된 행 찾기 (헤더 행) - 범위를 100줄로 대폭 확장하여 다양한 엑셀 레이아웃에 대응
                header_idx = -1
                for i, row in df.head(100).iterrows():
                    if row.astype(str).str.contains('구분').any():
                        header_idx = i
                        break
                
                if header_idx < 0: continue
                
                # 헤더 추출 및 정제
                headers = df.iloc[header_idx].fillna('').astype(str).map(lambda x: x.replace('\n', ' ').strip()).tolist()
                # 빈 헤더 보정
                headers = [h if h else f"col_{i+1}" for i, h in enumerate(headers)]
                
                # 데이터 추출
                data_df = df.iloc[header_idx + 1:]
                
                # 필터링 로직 (Next.js와 동일하게 적용)
                filter_col = 12 if dtype == 'glovis' else 15 # 0-indexed
                rows = []
                comments_dict = {}
                row_idx_in_db = 0
                
                # 메모 추출용 openpyxl
                sheet_comments = {}
                try:
                    import openpyxl
                    wb = openpyxl.load_workbook(full_path, data_only=True)
                    target_ws_name = next((s for s in wb.sheetnames if s.strip() == sheet_name.strip()), sheet_name)
                    if target_ws_name not in wb.sheetnames:
                        continue
                    ws = wb[target_ws_name]
                    
                    # Pandas에서의 헤더 컬럼 인덱스 찾기 ('구분')
                    header_col_idx = -1
                    for j, h in enumerate(headers):
                        if '구분' in str(h):
                            header_col_idx = j
                            break
                    if header_col_idx == -1:
                        header_col_idx = 0
                        
                    # openpyxl에서 헤더 컬럼 마커 ('구분') 찾아서 Offset 계산 (검색 범위 100행으로 확장)
                    openpyxl_r_offset = 0
                    openpyxl_c_offset = 0
                    found_header = False
                    for r_cells in ws.iter_rows(min_row=1, max_row=100):
                        for cell in r_cells:
                            val = str(cell.value) if cell.value else ""
                            if '구분' in val:
                                openpyxl_r_offset = (cell.row - 1) - header_idx
                                openpyxl_c_offset = (cell.column - 1) - header_col_idx
                                found_header = True
                                app.logger.info(f"[오프셋계산] 시트:{sheet_name}, 구분위치(R/C):{cell.row}/{cell.column}, Offset(R/C):{openpyxl_r_offset}/{openpyxl_c_offset}")
                                break
                        if found_header:
                            break
                    
                    if not found_header:
                        app.logger.warning(f"[오프셋계산 실패] 시트:{sheet_name}에서 '구분' 헤더를 찾지 못함. 기본값 유지.")
                            
                    # 주석 데이터 적재 (Pandas index 기준으로 상대적 변환)
                    for r_cells in ws.iter_rows():
                        for cell in r_cells:
                            if cell.comment:
                                pd_r = (cell.row - 1) - openpyxl_r_offset
                                pd_c = (cell.column - 1) - openpyxl_c_offset
                                sheet_comments[(pd_r, pd_c)] = cell.comment.text
                except Exception as e:
                    app.logger.warning(f"openpyxl load_workbook 실패: {e}")

                orig_index_list = data_df.index.tolist()
                for i_pos, orig_iloc_idx in enumerate(orig_index_list):
                    row = data_df.loc[orig_iloc_idx]
                    # '합계' 포함 시 건너뜀 (break 대신 continue로 변경하여 데이터 유실 방지)
                    if any(str(c).find('합계') >= 0 for c in row if pd.notnull(c)):
                        continue
                    
                    f_val = str(row.iloc[filter_col]) if filter_col < len(row) else ''
                    if not f_val or f_val == '0' or f_val == 'nan':
                        continue
                    
                    row_list = row.fillna('').astype(str).tolist()
                    rows.append(row_list)
                    
                    # 메모 추출 (엑셀 row 인덱스는 pandas header_idx가 포함된 df의 원본 인덱스)
                    for c_idx in range(len(row_list)):
                        cmt = sheet_comments.get((orig_iloc_idx, c_idx))
                        if cmt:
                            comments_dict[f"{row_idx_in_db}:{c_idx}"] = str(cmt)
                            
                    row_idx_in_db += 1
                
                if not rows: continue
                
                # Supabase 저장 (upsert로 변경하여 중복 데이터 방지)
                supabase.from_("branch_dispatch").upsert({
                    "branch_id": "asan",
                    "type": dtype,
                    "target_date": target_date,
                    "headers": headers,
                    "data": rows,
                    "comments": comments_dict,
                    "file_modified_at": mtime,
                    "updated_at": now.isoformat()
                }, on_conflict="branch_id,type,target_date").execute()
                sync_count += 1
            
            app.logger.info(f"[자동동기화] {dtype} 동기화 완료 ({sync_count} 시트)")
            last_mtime_cache[dtype] = mtime

                
    except Exception as e:
        app.logger.error(f"[자동동기화] 전체 프로세스 오류: {e}", exc_info=True)

def asan_sync_scheduler():
    app.logger.info("[스케줄러] 아산 배차판 자동 동기화 스케줄러 시작 (실시간 변경 감지 모드)")
    check_count = 0
    while True:
        try:
            now = datetime.now(KST)
            if 6 <= now.hour <= 23:
                check_count += 1
                # 10회(약 10분)마다 "살아있음" 생존 신고 로그 출력
                if check_count % 10 == 0:
                    app.logger.info(f"[스케줄러] 아산 배차판 감시 중... (현재시간: {now.strftime('%H:%M:%S')})")
                
                # 매 루프(60초)마다 수정 여부를 체크하고, 수정된 경우만 동기화
                sync_asan_dispatch_python()
            time.sleep(60)
        except Exception as e:
            app.logger.error(f"[스케줄러] 에러 발생: {e}")
            time.sleep(60)

threading.Thread(target=asan_sync_scheduler, daemon=True).start()

def nas_sync_scheduler():
    """매일 새벽 04:30에 나스 전 지점 폴더를 스캔하여 AI 지식을 업데이트합니다."""
    app.logger.info("[스케줄러] NAS AI 지식 자동 동기화 스케줄러 대기 중...")
    
    # 스캔 대상 목록 (도커 내부 경로 기준)
    scan_targets = [
        {"path": "/app/volume1/서울본사", "branch": "본사"},
        {"path": "/app/volume2/아산지점", "branch": "아산"},
        {"path": "/app/volume2/당진지점", "branch": "당진"},
        {"path": "/app/volume2/자료실", "branch": "자료실"}
    ]
    
    while True:
        try:
            now = datetime.now(KST)
            # 매일 새벽 04:30에 실행
            if now.hour == 4 and now.minute == 30:
                app.logger.info(f"[스케줄러] NAS 정기 스캔 시작 (대상: {len(scan_targets)}개 구역)")
                for target in scan_targets:
                    if not supabase: break
                    try:
                        # 동기 함수로 직접 호출
                        res = process_nas_directory(supabase, target["path"], target["branch"])
                        app.logger.info(f"✅ {target['branch']} 동기화 완료: {res}")
                    except Exception as e:
                        app.logger.error(f"❌ {target['branch']} 동기화 실패: {e}")
                
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
        # force=True 옵션으로 캐시 무시하고 강제 실행
        sync_asan_dispatch_python(force=True)
        return jsonify({"ok": True, "message": "강제 동기화 완료"})
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

# 벡터화 작업 상태 추적용 전역 변수
vect_status = {
    "is_running": False,
    "start_time": None,
    "current_branch": None
}
vect_lock = threading.Lock()

@app.route('/api/vectorize/nas/unlock', methods=['POST'])
def force_unlock_nas_vectorize():
    """작업이 꼬였을 때 강제로 락을 해제하는 API"""
    global vect_status
    vect_status["is_running"] = False
    vect_status["start_time"] = None
    vect_status["current_branch"] = None
    app.logger.info("🔓 [API] 벡터화 락 강제 해제됨")
    return jsonify({"ok": True, "message": "Vectorization lock forced to release."})

@app.route('/api/vectorize/nas', methods=['POST'])
def trigger_nas_vectorize():
    """Trigger NAS folder crawling and vectorization (Phase 5)."""
    if not supabase:
        return jsonify({"error": "Supabase client not initialized"}), 500
        
    data = request.json or {}
    raw_dir = data.get("directory", "/app/data/work-docs")  # Update path to /app/data which is mounted
    branch_name = data.get("branch", "NAS자료")
    
    # 백그라운드 태스크 중복 실행 방지 및 좀비 락 해제
    global vect_status, vect_lock
    
    # 2시간 이상 실행 중이면 좀비로 간주하고 강제 해제
    if vect_status["is_running"] and vect_status["start_time"]:
        elapsed = time.time() - vect_status["start_time"]
        if elapsed > 7200: # 2시간
            app.logger.warning(f"⚠️ [좀비방지] {vect_status['current_branch']} 작업이 2시간을 초과하여 락을 강제 해제합니다.")
            vect_status["is_running"] = False
        
    if vect_status["is_running"]:
        return jsonify({
            "status": "busy", 
            "message": f"Another task ({vect_status['current_branch']}) is already running.",
            "elapsed_sec": int(time.time() - vect_status["start_time"]) if vect_status["start_time"] else 0
        }), 429

    def run_task():
        global vect_status
        with vect_lock:
            try:
                vect_status["is_running"] = True
                vect_status["start_time"] = time.time()
                vect_status["current_branch"] = branch_name
                
                app.logger.info(f"🚀 [API Trigger] {branch_name} ({raw_dir}) 벡터화 시작...")
                res = process_nas_directory(supabase, raw_dir, branch_name)
                app.logger.info(f"✅ [API Trigger] {branch_name} 완료: {res}")
            except Exception as e:
                app.logger.error(f"❌ [API Trigger] {branch_name} 실패: {e}")
            finally:
                vect_status["is_running"] = False
                vect_status["start_time"] = None

    threading.Thread(target=run_task, daemon=True).start()
    
    return jsonify({"status": "processing", "message": f"Started vectorization for {branch_name} in background."}), 202

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
