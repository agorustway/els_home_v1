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
import hashlib
import tempfile
import math
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
last_sheet_hash_cache = {}  # [v5.10.14] 시트별 데이터 해시 캐시 — 변경된 시트만 Supabase upsert
asan_sync_lock = threading.Lock()
asan_sync_start_time = 0

def sync_asan_dispatch_python(force=False):
    global last_mtime_cache, last_sheet_hash_cache, asan_sync_start_time
    if not supabase: return
    
    import time
    # 중복 실행 방지 및 좀비 락 해제 (30분 초과 시)
    if asan_sync_lock.locked():
        if time.time() - asan_sync_start_time > 1800:
            app.logger.warning("[자동동기화] 이전 동기화가 30분 이상 지연되어 락을 강제 해제합니다.")
            try: asan_sync_lock.release()
            except: pass

    if not asan_sync_lock.acquire(blocking=False):
        app.logger.warning("[자동동기화] 이미 동기화가 진행 중입니다. 이번 요청은 건너뜁니다.")
        return

    asan_sync_start_time = time.time()

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
            
            # 네트워크 파일 행(Hang) 방지를 위해 로컬 임시 파일로 복사
            import tempfile, shutil
            temp_path = tempfile.mktemp(suffix=".xlsx")
            
            try:
                shutil.copy2(full_path, temp_path)
                app.logger.info(f"[자동동기화] {dtype} 로컬 임시 파일 복사 완료: {temp_path}")
            except Exception as e:
                app.logger.error(f"[자동동기화] {dtype} 로컬 임시 파일 복사 실패: {e}")
                continue
            
            # [v5.10.19] 삭제된 시트 추적용 리스트
            valid_dates = []
            
            # 엑셀 읽기
            try:
                # [v5.10.6] 엔진 명시 및 최적화
                xl = pd.ExcelFile(temp_path, engine='openpyxl')
                sync_count = 0
                app.logger.info(f"[자동동기화] {dtype} 엑셀 로드 완료. 시트수: {len(xl.sheet_names)}")
                
                # [v5.10.15] 메모 추출용 워크북은 파일당 1회만 로드 (루프 밖)
                import openpyxl as _openpyxl
                wb_comments = None
                try:
                    wb_comments = _openpyxl.load_workbook(temp_path, data_only=True, keep_vba=False)
                except Exception as e:
                    app.logger.warning(f"[자동동기화] {dtype} 메모 워크북 로드 실패: {e}")
                
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
                    valid_dates.append(target_date) # [v5.10.19] 유효한 날짜 수집
                    
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
                    
                    # [v5.10.20] 방법 B: 오더/계/수량 컬럼 인덱스 사전 파악 (템플릿 행 필터용)
                    order_col_idx = -1
                    for _oi, _oh in enumerate(headers):
                        if _oh.strip() in ['오더', '계', '수량']:
                            order_col_idx = _oi
                            break
                    app.logger.info(f"[자동동기화] {dtype} 시트 '{sheet_name}' 오더 컬럼 인덱스: {order_col_idx} (헤더: {headers[order_col_idx] if order_col_idx >= 0 else 'N/A'})")
                    
                    rows = []
                    comments_dict = {}
                    
                    # [v5.10.15] ws 참조 준비 (메모 추출용)
                    ws_c = None
                    if wb_comments and sheet_name in wb_comments.sheetnames:
                        ws_c = wb_comments[sheet_name]

                    row_idx_in_db = 0
                    for orig_iloc_idx, row in data_df.iterrows():
                        if any(str(c).find('합계') >= 0 for c in row if pd.notnull(c)):
                            continue
                        
                        # [v5.10.9] 하드코딩된 filter_col(12, 15) 제거하고, 유효한 데이터가 최소 3개 이상인지 검증
                        valid_cells = [c for c in row if str(c).strip() not in ['', '0', 'nan', 'None']]
                        if len(valid_cells) < 3:
                            continue
                        
                        # [v5.10.20] 방법 B: 오더/계/수량 컬럼이 0이거나 없으면 빈 양식(템플릿) → 저장 제외
                        if order_col_idx >= 0:
                            try:
                                order_val = str(row.iloc[order_col_idx]).strip()
                                if not order_val or order_val in ['0', 'nan', 'None', '']:
                                    continue  # 템플릿(빈 양식) 행 건너뛰기
                            except Exception:
                                pass
                        
                        rows.append(row.fillna('').astype(str).tolist())
                        
                        # [v5.10.15] 메모 추출: ws 행(1-based) = pandas iloc index + 1
                        if ws_c is not None:
                            ws_row_num = orig_iloc_idx + 1  # openpyxl은 1-based
                            try:
                                for ws_col_idx, cell in enumerate(ws_c[ws_row_num]):
                                    if cell.comment and cell.comment.text:
                                        comments_dict[f"{row_idx_in_db}:{ws_col_idx}"] = cell.comment.text.strip()
                            except Exception:
                                pass
                        
                        row_idx_in_db += 1
                    
                    if rows:
                        # [v5.10.14] 시트 데이터 해시 비교 — 변경 없으면 Supabase 호출 스킵
                        sheet_hash = hashlib.md5(str(rows).encode('utf-8')).hexdigest()
                        cache_key = f"{dtype}:{sheet_name}"
                        if not force and last_sheet_hash_cache.get(cache_key) == sheet_hash:
                            continue  # 데이터 동일 → Supabase 호출 생략
                        
                        for attempt in range(3): # 최대 3번 재시도
                            try:
                                supabase.from_("branch_dispatch").upsert({
                                    "branch_id": "asan", "type": dtype, "target_date": target_date,
                                    "headers": headers, "data": rows, "comments": comments_dict, # [v5.10.15] 메모 복원
                                    "file_modified_at": mtime, "updated_at": now.isoformat()
                                }, on_conflict="branch_id,type,target_date").execute()
                                last_sheet_hash_cache[cache_key] = sheet_hash  # 성공 시 캐시 업데이트
                                sync_count += 1
                                break # 성공 시 재시도 루프 탈출
                            except Exception as e:
                                app.logger.error(f"[자동동기화] {dtype} 시트 '{sheet_name}' 저장 실패 (시도 {attempt+1}/3): {e}")
                                time.sleep(1) # 1초 대기 후 재시도
                        else:
                            app.logger.error(f"[자동동기화] {dtype} 시트 '{sheet_name}' 최종 저장 실패.")
                
                app.logger.info(f"[자동동기화] {dtype} 동기화 완료 ({sync_count} 시트)")
                
                # [v5.10.19] 엑셀에서 삭제된 시트는 DB에서도 제거
                if valid_dates:
                    try:
                        res = supabase.from_("branch_dispatch").select("target_date").eq("branch_id", "asan").eq("type", dtype).execute()
                        db_dates = [r["target_date"] for r in res.data]
                        deleted_count = 0
                        for db_date in db_dates:
                            if db_date not in valid_dates:
                                supabase.from_("branch_dispatch").delete().eq("branch_id", "asan").eq("type", dtype).eq("target_date", db_date).execute()
                                # 캐시 정리
                                for k in list(last_sheet_hash_cache.keys()):
                                    if k.startswith(f"{dtype}:") and f"{int(db_date[5:7])}.{int(db_date[8:10])}" in k:
                                        del last_sheet_hash_cache[k]
                                deleted_count += 1
                        if deleted_count > 0:
                            app.logger.info(f"[자동동기화] {dtype} 엑셀에 없는 과거 시트 {deleted_count}개 DB에서 삭제 완료.")
                    except Exception as clean_err:
                        app.logger.error(f"[자동동기화] {dtype} 삭제된 시트 정리 실패: {clean_err}")

                # [v5.10.15] 메모용 워크북 메모리 해제
                if wb_comments:
                    try: wb_comments.close()
                    except: pass
            except Exception as e:
                app.logger.error(f"[자동동기화] {dtype} 엑셀 처리 중 에러: {e}")
            finally:
                # 임시 파일 삭제
                try:
                    import os
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
                except Exception as e:
                    app.logger.warning(f"[자동동기화] {dtype} 임시 파일 삭제 실패: {e}")

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
    while True:
        try:
            now = datetime.now(KST)
            # 매일 새벽 1시 30분에 한 번만 실행
            if now.hour == 1 and now.minute == 30:
                # NAS 폴더 스캔 기능은 부하 문제로 해제됨 (WEB 게시판 첨부파일만 동기화)
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

def _vehicle_haversine_km(lat1, lng1, lat2, lng2):
    p = math.pi / 180
    a = (
        0.5
        - math.cos((lat2 - lat1) * p) / 2
        + math.cos(lat1 * p) * math.cos(lat2 * p) * (1 - math.cos((lng2 - lng1) * p)) / 2
    )
    return 12742 * math.asin(math.sqrt(max(0, a)))


def _vehicle_point_ms(point):
    raw = (point or {}).get("recorded_at") or (point or {}).get("timestamp") or (point or {}).get("created_at")
    if not raw:
        return 0
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).timestamp() * 1000
    except Exception:
        return 0


def _vehicle_filter_locations(points):
    ordered = []
    for p in points or []:
        try:
            lat = float(p.get("lat"))
            lng = float(p.get("lng"))
        except Exception:
            continue
        if not (33 <= lat <= 39.5 and 124 <= lng <= 132):
            continue
        item = dict(p)
        item["lat"] = lat
        item["lng"] = lng
        try:
            item["speed"] = float(item.get("speed") or 0)
        except Exception:
            item["speed"] = 0
        try:
            item["accuracy"] = float(item.get("accuracy") or 0)
        except Exception:
            item["accuracy"] = 0
        ordered.append(item)

    ordered.sort(key=_vehicle_point_ms)
    filtered = []
    for idx, curr in enumerate(ordered):
        if curr.get("accuracy", 0) > 120:
            continue
        prev = filtered[-1] if filtered else None
        if not prev:
            filtered.append(curr)
            continue

        time_sec = max(1, (_vehicle_point_ms(curr) - _vehicle_point_ms(prev)) / 1000)
        if _vehicle_point_ms(curr) + 1000 < _vehicle_point_ms(prev):
            continue
        dist_km = _vehicle_haversine_km(prev["lat"], prev["lng"], curr["lat"], curr["lng"])
        implied = dist_km / (time_sec / 3600)
        sensor = max(0, curr.get("speed", 0))
        speed_limit = 60 if sensor <= 4 else (90 if sensor < 15 else min(145, max(105, sensor + 45)))
        if dist_km > 0.05 and implied > speed_limit:
            continue
        if sensor <= 4 and dist_km > 0.06 and implied > 25:
            continue
        if sensor < 15 and dist_km > 0.08 and implied > 45:
            continue

        nxt = ordered[idx + 1] if idx + 1 < len(ordered) else None
        if nxt:
            next_dist = _vehicle_haversine_km(curr["lat"], curr["lng"], float(nxt["lat"]), float(nxt["lng"]))
            bridge_dist = _vehicle_haversine_km(prev["lat"], prev["lng"], float(nxt["lat"]), float(nxt["lng"]))
            if sensor < 15 and dist_km > 0.08 and next_dist > 0.08 and bridge_dist < max(0.06, dist_km * 0.45):
                continue
            if dist_km > 0.7 and next_dist > 0.7 and bridge_dist < max(0.3, min(dist_km, next_dist) * 0.55):
                continue

        min_move_km = 0.02 if sensor < 10 else (0.035 if sensor < 40 else 0.06)
        if dist_km < min_move_km and not curr.get("marker_type"):
            continue
        filtered.append(curr)
    return filtered


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
    loc_groups = {}
    for l in locs:
        loc_groups.setdefault(l["trip_id"], []).append(l)
    loc_map = {}
    for tid, rows in loc_groups.items():
        clean_rows = _vehicle_filter_locations(rows)
        loc_map[tid] = (clean_rows[-1] if clean_rows else rows[0])
    driver_map = {}
    vehicle_numbers = list({t.get("vehicle_number") for t in trips if t.get("vehicle_number")})
    if vehicle_numbers:
        try:
            drivers = supabase.from_("driver_contacts").select("vehicle_number, branch, partner_company, contract_type, cargo_type, map_visibility, general_vehicle_type, general_payload, general_body_type").in_("vehicle_number", vehicle_numbers).execute().data or []
            for d in drivers:
                if d.get("vehicle_number"):
                    driver_map[d["vehicle_number"]] = d
        except Exception:
            driver_map = {}
    for t in trips:
        d = driver_map.get(t.get("vehicle_number")) or {}
        t["cargo_type"] = t.get("cargo_type") or d.get("cargo_type") or "container"
        t["driver_contract_type"] = t.get("driver_contract_type") or d.get("contract_type") or "uncontracted"
        t["map_visibility"] = t.get("map_visibility") or d.get("map_visibility") or "own"
        t["branch"] = t.get("branch") or d.get("branch")
        t["partner_company"] = t.get("partner_company") or d.get("partner_company")
        t["general_vehicle_type"] = t.get("general_vehicle_type") or d.get("general_vehicle_type")
        t["general_payload"] = t.get("general_payload") or d.get("general_payload")
        t["general_body_type"] = t.get("general_body_type") or d.get("general_body_type")
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

# 3-1. 아산지점 선적관리 엑셀 파싱/DB 동기화
DEFAULT_ASAN_SHIPPING_PATH = "/아산지점/2026_자체보관리스트.xlsx"
SHIPPING_HISTORY_RETENTION_DAYS = 365
shipping_cache = {}
shipping_db_available = True
shipping_history_cleanup_last_date = None

def resolve_asan_shipping_file(rel_path=None):
    rel_path = (rel_path or DEFAULT_ASAN_SHIPPING_PATH).replace("\\", "/").strip()
    if not rel_path.startswith("/"):
        rel_path = f"/{rel_path}"

    file_path = Path("/app/data") / rel_path.lstrip("/")
    if file_path.exists():
        return file_path, rel_path

    fallback_root = Path("C:/Els") if os.name == "nt" else Path("/Volumes/Els")
    file_path = fallback_root / rel_path.lstrip("/")
    if file_path.exists():
        return file_path, rel_path

    return file_path, rel_path

def parse_asan_shipping_excel(file_path):
    app.logger.info(f"선적관리 엑셀 파싱 시작: {file_path}")
    import shutil, tempfile as _tf
    temp_path = _tf.mktemp(suffix=".xlsx")
    try:
        shutil.copy2(str(file_path), temp_path)
    except Exception as cp_err:
        app.logger.error(f"선적관리 임시복사 실패: {cp_err}")
        raise RuntimeError(f"파일 복사 실패: {cp_err}")

    try:
        df = pd.read_excel(temp_path, sheet_name=0, header=2)
    finally:
        try: os.remove(temp_path)
        except: pass

    raw_cols = [str(c).replace('\n', ' ').strip() for c in df.columns]
    seen = {}
    clean_cols = []
    for c in raw_cols:
        if c.startswith('Unnamed') or c == '':
            c = f'col_{len(clean_cols)+1}'
        if c in seen:
            seen[c] += 1
            c = f'{c}_{seen[c]}'
        else:
            seen[c] = 0
        clean_cols.append(c)
    df.columns = clean_cols

    df = df.fillna("")
    df = df.astype(str).replace(['nan', 'None', '#N/A', 'NaT'], '')

    container_cols = [c for c in df.columns if 'CONTAINER' in c.upper()]
    if container_cols:
        c_col = container_cols[0]
        df = df[df[c_col].str.strip() != ""]

    headers = df.columns.tolist()
    data_rows = df.values.tolist()

    import math
    data_rows = [
        [("" if (isinstance(v, float) and math.isnan(v)) or v is None else v) for v in row]
        for row in data_rows
    ]

    return {"headers": headers, "data": data_rows}

def _shipping_value(headers, row, keywords):
    for i, header in enumerate(headers):
        normalized = str(header or "").replace(" ", "").upper()
        if any(keyword.replace(" ", "").upper() in normalized for keyword in keywords):
            return str(row[i] if i < len(row) else "").strip()
    return ""

def _shipping_search_terms(search):
    return [term.strip() for term in str(search or "").split(",") if term.strip()]

def _shipping_search_filter_value(term):
    return str(term).replace(",", " ").replace("\\", " ")

def _shipping_row_hash(row):
    return hashlib.sha256(json.dumps(row or [], ensure_ascii=False, default=str).encode("utf-8")).hexdigest()

def _archive_removed_asan_shipping_rows(normalized_path, new_payload, removed_file_modified_at):
    try:
        existing_res = supabase.from_("branch_shipping_rows").select(
            "row_index,row_values,row_data,container_no,vessel_name,search_text,file_modified_at"
        ).eq("branch_id", "asan").eq("file_path", normalized_path).execute()
        existing_rows = existing_res.data or []
        if not existing_rows:
            return 0

        new_hashes = {_shipping_row_hash(item.get("row_values")) for item in new_payload}
        archived_at = datetime.now(KST).isoformat()
        archive_payload = []
        for row in existing_rows:
            row_hash = _shipping_row_hash(row.get("row_values") or [])
            if row_hash in new_hashes:
                continue
            archive_payload.append({
                "branch_id": "asan",
                "file_path": normalized_path,
                "row_index": row.get("row_index"),
                "row_values": row.get("row_values") or [],
                "row_data": row.get("row_data") or {},
                "container_no": row.get("container_no") or "",
                "vessel_name": row.get("vessel_name") or "",
                "search_text": row.get("search_text") or "",
                "source_row_hash": row_hash,
                "original_file_modified_at": row.get("file_modified_at"),
                "removed_file_modified_at": removed_file_modified_at,
                "archive_reason": "deleted_from_excel",
                "archived_at": archived_at,
            })

        for i in range(0, len(archive_payload), 500):
            supabase.from_("branch_shipping_row_archive").insert(archive_payload[i:i + 500]).execute()
        return len(archive_payload)
    except Exception as e:
        app.logger.warning(f"[선적관리DB] 삭제 이력 archive 건너뜀: {e}")
        return 0

def cleanup_asan_shipping_history_retention(now=None, retention_days=SHIPPING_HISTORY_RETENTION_DAYS):
    if not supabase or not shipping_db_available:
        return None

    now = now or datetime.now(KST)
    cutoff = (now - timedelta(days=retention_days)).isoformat()
    try:
        archive_res = supabase.from_("branch_shipping_row_archive").delete().lt("archived_at", cutoff).execute()
        lookup_res = supabase.from_("branch_shipping_container_lookups").delete().lt("looked_up_at", cutoff).execute()
        archive_deleted = len(archive_res.data or [])
        lookup_deleted = len(lookup_res.data or [])
        app.logger.info(
            f"[선적관리DB] 이력 보존기간 정리 완료: cutoff={cutoff}, "
            f"archive={archive_deleted}, lookup={lookup_deleted}"
        )
        return {
            "cutoff": cutoff,
            "archive_deleted": archive_deleted,
            "lookup_deleted": lookup_deleted,
        }
    except Exception as e:
        app.logger.warning(f"[선적관리DB] 이력 보존기간 정리 실패: {e}")
        return None

def maybe_cleanup_asan_shipping_history(now=None):
    global shipping_history_cleanup_last_date
    now = now or datetime.now(KST)
    today_key = now.date().isoformat()
    if shipping_history_cleanup_last_date == today_key:
        return None
    if now.hour < 3:
        return None

    shipping_history_cleanup_last_date = today_key
    return cleanup_asan_shipping_history_retention(now=now)

def sync_asan_shipping_python(force=False, rel_path=None):
    global shipping_db_available
    if not supabase or not shipping_db_available:
        return None

    file_path, normalized_path = resolve_asan_shipping_file(rel_path)
    if not file_path.exists():
        app.logger.warning(f"[선적관리DB] 파일을 찾을 수 없음: {file_path}")
        return None

    mtime_ts = file_path.stat().st_mtime
    file_modified_at = datetime.fromtimestamp(mtime_ts, tz=KST).isoformat()

    try:
        meta_res = supabase.from_("branch_shipping_files").select("file_modified_at").eq("branch_id", "asan").eq("file_path", normalized_path).execute()
        current_meta = meta_res.data[0] if meta_res.data else None
        if not force and current_meta and current_meta.get("file_modified_at"):
            try:
                db_mtime = datetime.fromisoformat(current_meta["file_modified_at"].replace("Z", "+00:00")).timestamp()
                if abs(db_mtime - mtime_ts) < 1:
                    return current_meta
            except Exception:
                pass

        parsed = parse_asan_shipping_excel(file_path)
        headers = parsed["headers"]
        rows = parsed["data"]

        payload = []
        for row_index, row in enumerate(rows):
            row_data = {headers[i]: (row[i] if i < len(row) else "") for i in range(len(headers))}
            search_text = " ".join(str(v) for v in row if v)
            payload.append({
                "branch_id": "asan",
                "file_path": normalized_path,
                "row_index": row_index,
                "row_values": row,
                "row_data": row_data,
                "container_no": _shipping_value(headers, row, ["CONTAINER"]),
                "vessel_name": _shipping_value(headers, row, ["선적확정모선", "모선", "VESSEL"]),
                "search_text": search_text[:8000],
                "file_modified_at": file_modified_at,
                "updated_at": datetime.now(KST).isoformat()
            })

        archived_count = _archive_removed_asan_shipping_rows(normalized_path, payload, file_modified_at)
        supabase.from_("branch_shipping_rows").delete().eq("branch_id", "asan").eq("file_path", normalized_path).execute()
        for i in range(0, len(payload), 500):
            supabase.from_("branch_shipping_rows").insert(payload[i:i + 500]).execute()

        supabase.from_("branch_shipping_files").upsert({
            "branch_id": "asan",
            "file_path": normalized_path,
            "headers": headers,
            "row_count": len(rows),
            "file_modified_at": file_modified_at,
            "synced_at": datetime.now(KST).isoformat()
        }, on_conflict="branch_id,file_path").execute()

        shipping_cache[normalized_path] = {"mtime": mtime_ts, "data": {**parsed, "file_modified_at": file_modified_at}}
        app.logger.info(f"[선적관리DB] 동기화 완료: {normalized_path} ({len(rows)}행, 삭제 archive {archived_count}행)")
        return {"file_modified_at": file_modified_at, "archived_count": archived_count}
    except Exception as e:
        if "branch_shipping_" in str(e) or "relation" in str(e).lower():
            shipping_db_available = False
            app.logger.warning("[선적관리DB] Supabase 테이블이 없어 DB 동기화를 비활성화합니다. migration 적용 후 컨테이너를 재시작하세요.")
        else:
            app.logger.error(f"[선적관리DB] 동기화 실패: {e}", exc_info=True)
        return None

def query_asan_shipping_db(rel_path, page=1, page_size=5000, search=""):
    if not supabase or not shipping_db_available:
        return None

    normalized_path = (rel_path or DEFAULT_ASAN_SHIPPING_PATH).replace("\\", "/").strip()
    if not normalized_path.startswith("/"):
        normalized_path = f"/{normalized_path}"

    meta_res = supabase.from_("branch_shipping_files").select("*").eq("branch_id", "asan").eq("file_path", normalized_path).execute()
    meta = meta_res.data[0] if meta_res.data else None
    if not meta:
        return None

    page = max(1, int(page or 1))
    page_size = max(1, min(10000, int(page_size or 5000)))
    start = (page - 1) * page_size
    end = start + page_size - 1

    q = supabase.from_("branch_shipping_rows").select("row_values", count="exact").eq("branch_id", "asan").eq("file_path", normalized_path)
    search_terms = _shipping_search_terms(search)
    if len(search_terms) == 1:
        q = q.ilike("search_text", f"%{_shipping_search_filter_value(search_terms[0])}%")
    elif search_terms:
        filters = ",".join(f"search_text.ilike.%{_shipping_search_filter_value(term)}%" for term in search_terms)
        q = q.or_(filters)
    rows_res = q.order("row_index", desc=False).range(start, end).execute()

    return {
        "headers": meta.get("headers") or [],
        "data": [r.get("row_values") for r in (rows_res.data or [])],
        "file_modified_at": meta.get("file_modified_at"),
        "synced_at": meta.get("synced_at"),
        "total": rows_res.count if rows_res.count is not None else meta.get("row_count", 0),
        "page": page,
        "page_size": page_size,
        "source": "supabase"
    }

def asan_shipping_sync_scheduler():
    app.logger.info("[스케줄러] 아산 선적관리 DB 동기화 스케줄러 시작")
    while True:
        try:
            now = datetime.now(KST)
            maybe_cleanup_asan_shipping_history(now)
            if 6 <= now.hour <= 23:
                sync_asan_shipping_python()
            time.sleep(120)
        except Exception as e:
            app.logger.error(f"[선적관리DB 스케줄러] 에러: {e}")
            time.sleep(120)

threading.Thread(target=asan_shipping_sync_scheduler, daemon=True).start()

@app.route("/api/branches/asan/shipping", methods=["GET", "POST"])
def get_asan_shipping():
    """아산지점 선적관리 조회/동기화.

    GET은 빠른 조회를 위해 Supabase DB를 먼저 읽고, 요청 중 엑셀 파싱/동기화를 하지 않는다.
    POST는 사용자가 명시적으로 누른 NAS 동기화 버튼과 운영 스케줄러용 강제 동기화 경로다.
    """
    try:
        rel_path = request.args.get("path") or DEFAULT_ASAN_SHIPPING_PATH
        body = request.get_json(silent=True) or {}
        if request.method == "POST":
            rel_path = body.get("path") or rel_path
            force = body.get("force", True)
            if isinstance(force, str):
                force = force.lower() in ("1", "true", "yes", "y")

            if not supabase or not shipping_db_available:
                return jsonify({"ok": False, "error": "선적관리 Supabase 동기화가 비활성화되어 있습니다."}), 503

            sync_result = sync_asan_shipping_python(force=bool(force), rel_path=rel_path)
            if not sync_result:
                return jsonify({"ok": False, "error": "선적관리 NAS 동기화에 실패했습니다."}), 500

            page = body.get("page") or request.args.get("page", 1)
            page_size = body.get("page_size") or request.args.get("page_size", 5000)
            search = (body.get("search") or request.args.get("search") or "").strip()
            db_data = query_asan_shipping_db(rel_path, page=page, page_size=page_size, search=search)
            return jsonify({"ok": True, "data": db_data or sync_result})

        source = request.args.get("source", "auto")
        page = request.args.get("page", 1)
        page_size = request.args.get("page_size", 5000)
        search = (request.args.get("search") or "").strip()

        if source != "excel" and supabase and shipping_db_available:
            db_data = query_asan_shipping_db(rel_path, page=page, page_size=page_size, search=search)
            if db_data:
                return jsonify({"data": db_data})

        file_path, normalized_path = resolve_asan_shipping_file(rel_path)
        if not file_path.exists():
            return jsonify({"error": "선적관리 엑셀 파일을 찾을 수 없습니다."}), 404

        mtime = file_path.stat().st_mtime
        cached = shipping_cache.get(normalized_path)
        if cached and cached["mtime"] == mtime and cached["data"]:
            return jsonify({"data": {**cached["data"], "source": "excel-cache"}})

        parsed = parse_asan_shipping_excel(file_path)
        
        res = {
            **parsed,
            "file_modified_at": datetime.fromtimestamp(mtime, tz=KST).isoformat(),
            "source": "excel-cache"
        }
        
        shipping_cache[normalized_path] = {"mtime": mtime, "data": res}
        return jsonify({"data": res})
        
    except Exception as e:
        app.logger.error(f"선적관리 파싱 오류: {e}")
        return jsonify({"error": str(e)}), 500

# 3-2. 아산 배차판 강제 동기화 (Manual Trigger)
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
    return jsonify({"status": "disabled", "message": "NAS vectorization is disabled due to system load."}), 400

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
