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

        # NAS WebDAV 설정
        nas_url = os.environ.get("NAS_URL", "https://elssolution.synology.me:5006").rstrip('/')
        nas_user = os.environ.get("NAS_USER", "web_client_admin")
        nas_pw = os.environ.get("NAS_PW", "SKDNSNFL")
        auth = (nas_user, nas_pw)

        for dtype in ['glovis', 'mobis']:
            rel_path = settings.get(f"{dtype}_path")
            if not rel_path: continue
            
            # NAS WebDAV 직접 연결 확인
            file_url = f"{nas_url}/{quote(rel_path.lstrip('/'))}"
            
            try:
                # 1. 파일 상태 및 수정 시간 확인 (PROPFIND)
                r_prop = requests.request("PROPFIND", file_url, auth=auth, headers={"Depth": "0"}, verify=False, timeout=10)
                if r_prop.status_code not in (200, 207):
                    app.logger.warning(f"[자동동기화] WebDAV에서 파일을 찾을 수 없습니다 ({r_prop.status_code}): {file_url}")
                    continue
                
                mtime = None
                root = ET.fromstring(r_prop.text)
                for elem in root.iter():
                    if 'getlastmodified' in elem.tag:
                        mtime = elem.text
                        break
                        
                if not mtime:
                    continue
                
                # 변경 감지 (force 옵션이 없으면 캐시 확인)
                if not force and last_mtime_cache.get(dtype) == mtime:
                    continue
                
                app.logger.info(f"[자동동기화] 파일 변경 확인됨 (WebDAV). 데이터 다운로드 시작... ({dtype})")
                
                # 2. 파일 다운로드
                r_get = requests.get(file_url, auth=auth, verify=False, timeout=60)
                if r_get.status_code != 200:
                    app.logger.error(f"[자동동기화] 파일 다운로드 실패 ({r_get.status_code}): {file_url}")
                    continue
                
                # 임시 파일로 저장 후 처리
                with tempfile.NamedTemporaryFile(suffix=".xlsm", delete=False) as tmp:
                    tmp.write(r_get.content)
                    tmp_path = tmp.name
                
                # 3. 엑셀 읽기
                xl = pd.ExcelFile(tmp_path)
                sync_count = 0
                supabase.from_("branch_dispatch").delete().eq("branch_id", "asan").eq("type", dtype).execute()

                for sheet_name in xl.sheet_names:
                    match = re.search(r'(\d+)\.(\d+)', sheet_name)
                    if not match: continue
                    m, d = int(match.group(1)), int(match.group(2))
                    now = datetime.now(KST)
                    target_date = f"{now.year}-{m:02d}-{d:02d}"
                    
                    df = pd.read_excel(xl, sheet_name=sheet_name, header=None)
                    header_idx = -1
                    for i, row in df.head(10).iterrows():
                        if row.astype(str).str.contains('구분').any():
                            header_idx = i; break
                    if header_idx < 0: continue
                    
                    headers = df.iloc[header_idx].fillna('').astype(str).map(lambda x: x.replace('\n', ' ').strip()).tolist()
                    headers = [h if h else f"col_{i+1}" for i, h in enumerate(headers)]
                    data_df = df.iloc[header_idx + 1:]
                    
                    filter_col = 12 if dtype == 'glovis' else 15
                    rows = []
                    for _, row in data_df.iterrows():
                        if any(str(c).find('합계') >= 0 for c in row if pd.notnull(c)): break
                        f_val = str(row.iloc[filter_col]) if filter_col < len(row) else ''
                        if not f_val or f_val == '0' or f_val == 'nan': continue
                        rows.append(row.fillna('').astype(str).tolist())
                    
                    if not rows: continue
                    supabase.from_("branch_dispatch").insert({
                        "branch_id": "asan", "type": dtype, "target_date": target_date,
                        "headers": headers, "data": rows, "file_modified_at": mtime, "updated_at": now.isoformat()
                    }).execute()
                    sync_count += 1
                
                app.logger.info(f"[자동동기화] {dtype} 동기화 완료 ({sync_count} 시트)")
                last_mtime_cache[dtype] = mtime
                
                # 사용 끝난 임시 파일 삭제
                try: os.remove(tmp_path)
                except: pass

            except Exception as inner_e:
                app.logger.error(f"[자동동기화] {dtype} 처리 중 오류: {inner_e}")
                
    except Exception as e:
        app.logger.error(f"[자동동기화] 전체 프로세스 오류: {e}")

def asan_sync_scheduler():
    app.logger.info("[스케줄러] 아산 배차판 자동 동기화 스케줄러 시작 (실시간 변경 감지 모드)")
    while True:
        try:
            now = datetime.now(KST)
            if now.weekday() < 5 and 6 <= now.hour <= 23:
                # 매 루프(1분)마다 수정 여부를 체크하고, 수정된 경우만 동기화
                sync_asan_dispatch_python()
            time.sleep(60)
        except: time.sleep(60)

threading.Thread(target=asan_sync_scheduler, daemon=True).start()

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

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=2930, threaded=True)
