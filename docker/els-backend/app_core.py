# [v5.0.42] DNS 장애 환경 대응: 전역 소켓 패치 적용 (가장 먼저 실행)
import dns_fix
dns_fix.apply_dns_patch()

import os
import sys
import json
import gc
import threading
import time
import logging
import pandas as pd
import io
import re
import hashlib
import tempfile
import math
import uuid
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
from file_sync_gate import StableFileSyncGate
from asan_performance import register_asan_performance_routes
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
last_file_signature_cache = {}
last_sheet_hash_cache = {}  # [v5.10.14] 시트별 데이터 해시 캐시 — 변경된 시트만 Supabase upsert
asan_sync_lock = threading.Lock()
asan_sync_start_time = 0
asan_sync_control_lock = threading.Lock()
asan_sync_cancel_generation = 0
asan_sync_restart_lock = threading.Lock()
asan_sync_status_lock = threading.Lock()
asan_sync_status = {
    "running": False,
    "started_at": None,
    "finished_at": None,
    "ok": True,
    "message": "대기 중",
    "results": [],
    "last_requested_at": None,
    "request_cooldown_until": None,
    "quick_done": False,
    "quick_finished_at": None,
    "quick_completed_types": [],
    "quick_window_start": None,
    "quick_window_end": None,
    "priority_primary_date": None,
    "priority_adjacent_dates": [],
    "cancel_requested": False,
}
dispatch_settings_cache = {"data": None, "loaded_at": 0.0}

def _is_missing_dispatch_count_column(error):
    message = str(error).lower()
    return "row_count" in message or "valid_row_count" in message

def _upsert_branch_dispatch(payload):
    try:
        return supabase.from_("branch_dispatch").upsert(
            payload,
            on_conflict="branch_id,type,target_date",
        ).execute()
    except Exception as exc:
        if not _is_missing_dispatch_count_column(exc):
            raise
        fallback = dict(payload)
        fallback.pop("row_count", None)
        fallback.pop("valid_row_count", None)
        return supabase.from_("branch_dispatch").upsert(
            fallback,
            on_conflict="branch_id,type,target_date",
        ).execute()

def _env_int(name, default, minimum=0):
    try:
        return max(minimum, int(os.environ.get(name, default)))
    except (TypeError, ValueError):
        return default

ASAN_DISPATCH_SYNC_POLL_SECONDS = _env_int("ASAN_DISPATCH_SYNC_POLL_SECONDS", 60, 15)
ASAN_DISPATCH_SYNC_QUIET_SECONDS = _env_int("ASAN_DISPATCH_SYNC_QUIET_SECONDS", 8, 0)
ASAN_DISPATCH_SYNC_RETRY_SECONDS = _env_int("ASAN_DISPATCH_SYNC_RETRY_SECONDS", 60, 10)
ASAN_DISPATCH_SYNC_REQUEST_COOLDOWN_SECONDS = _env_int("ASAN_DISPATCH_SYNC_REQUEST_COOLDOWN_SECONDS", 60, 0)
ASAN_DISPATCH_DASHBOARD_CACHE_URL = os.environ.get(
    "ASAN_DISPATCH_DASHBOARD_CACHE_URL",
    "https://elssolution.com/api/branches/asan/dispatch/dashboard",
)
ASAN_DISPATCH_DASHBOARD_CACHE_TIMEOUT_SECONDS = _env_int("ASAN_DISPATCH_DASHBOARD_CACHE_TIMEOUT_SECONDS", 180, 30)
ASAN_SHIPPING_SYNC_POLL_SECONDS = _env_int("ASAN_SHIPPING_SYNC_POLL_SECONDS", 60, 30)
ASAN_SHIPPING_SYNC_QUIET_SECONDS = _env_int("ASAN_SHIPPING_SYNC_QUIET_SECONDS", 8, 0)
ASAN_SHIPPING_SYNC_RETRY_SECONDS = _env_int("ASAN_SHIPPING_SYNC_RETRY_SECONDS", 90, 10)
ASAN_TRANSPORT_HISTORY_DEFAULT_PATH = "/아산지점/2026_수출리스트.xlsx"
ASAN_TRANSPORT_HISTORY_SYNC_POLL_SECONDS = _env_int("ASAN_TRANSPORT_HISTORY_SYNC_POLL_SECONDS", 60, 15)
ASAN_TRANSPORT_HISTORY_SYNC_QUIET_SECONDS = _env_int("ASAN_TRANSPORT_HISTORY_SYNC_QUIET_SECONDS", 8, 0)
ASAN_TRANSPORT_HISTORY_SYNC_RETRY_SECONDS = _env_int("ASAN_TRANSPORT_HISTORY_SYNC_RETRY_SECONDS", 60, 10)
ASAN_TRANSPORT_HISTORY_SYNC_REQUEST_COOLDOWN_SECONDS = _env_int("ASAN_TRANSPORT_HISTORY_SYNC_REQUEST_COOLDOWN_SECONDS", 60, 0)
ASAN_DISPATCH_SETTINGS_CACHE_SECONDS = _env_int("ASAN_DISPATCH_SETTINGS_CACHE_SECONDS", 300, 30)
ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_HOUR = _env_int("ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_HOUR", 3, 0)
ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_MINUTE = _env_int("ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_MINUTE", 10, 0)
ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_FAIL_LIMIT = _env_int("ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_FAIL_LIMIT", 10, 1)
ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_MAX_TARGETS = _env_int("ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_MAX_TARGETS", 10000, 1)
ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_TIMEOUT_SECONDS = _env_int("ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_TIMEOUT_SECONDS", 3600, 300)
ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_ACQUIRE_TIMEOUT_SECONDS = _env_int("ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_ACQUIRE_TIMEOUT_SECONDS", 300, 30)
ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_SUBMIT_DELAY_SECONDS = _env_int("ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_SUBMIT_DELAY_SECONDS", 2, 0)
ELS_BOT_API_URL = os.environ.get("ELS_BOT_API_URL", "http://127.0.0.1:2931").rstrip("/")

dispatch_sync_gate = StableFileSyncGate(
    quiet_seconds=ASAN_DISPATCH_SYNC_QUIET_SECONDS,
    retry_seconds=ASAN_DISPATCH_SYNC_RETRY_SECONDS,
)
shipping_sync_gate = StableFileSyncGate(
    quiet_seconds=ASAN_SHIPPING_SYNC_QUIET_SECONDS,
    retry_seconds=ASAN_SHIPPING_SYNC_RETRY_SECONDS,
)
transport_history_sync_gate = StableFileSyncGate(
    quiet_seconds=ASAN_TRANSPORT_HISTORY_SYNC_QUIET_SECONDS,
    retry_seconds=ASAN_TRANSPORT_HISTORY_SYNC_RETRY_SECONDS,
)
transport_history_sync_lock = threading.Lock()
transport_history_sync_start_time = 0
transport_history_sync_status_lock = threading.Lock()
transport_history_sync_status = {
    "running": False,
    "started_at": None,
    "finished_at": None,
    "ok": True,
    "message": "대기 중",
    "results": [],
    "last_requested_at": None,
    "request_cooldown_until": None,
    "quick_done": False,
    "quick_finished_at": None,
    "quick_window_start": None,
    "quick_window_end": None,
    "priority_primary_month": None,
    "priority_adjacent_months": [],
}
last_transport_history_file_signature_cache = {}
last_transport_history_sheet_hash_cache = {}

register_asan_performance_routes(app, supabase, KST)


def get_asan_dispatch_settings(force=False):
    now_ts = time.time()
    cached = dispatch_settings_cache.get("data")
    if (
        not force
        and cached
        and now_ts - float(dispatch_settings_cache.get("loaded_at") or 0) < ASAN_DISPATCH_SETTINGS_CACHE_SECONDS
    ):
        return cached

    try:
        res = supabase.from_("branch_dispatch_settings").select("*").eq("branch_id", "asan").single().execute()
        settings = res.data
        if settings:
            dispatch_settings_cache["data"] = settings
            dispatch_settings_cache["loaded_at"] = now_ts
        return settings
    except Exception as exc:
        if cached:
            app.logger.warning(f"[자동동기화] 배차 설정 조회 실패, 캐시 사용: {exc}")
            return cached
        raise


def _dispatch_db_has_current_mtime(dtype, mtime_ts, mtime):
    """컨테이너 재시작 직후 캐시가 비어도 DB가 최신이면 대용량 엑셀 파싱을 건너뛴다."""
    if not supabase:
        return False
    try:
        res = (
            supabase.from_("branch_dispatch")
            .select("file_modified_at")
            .eq("branch_id", "asan")
            .eq("type", dtype)
            .order("file_modified_at", desc=True)
            .limit(1)
            .execute()
        )
        db_mtime = (res.data or [{}])[0].get("file_modified_at")
        if not db_mtime:
            return False
        db_ts = datetime.fromisoformat(str(db_mtime).replace("Z", "+00:00")).timestamp()
        if abs(db_ts - mtime_ts) < 1:
            last_mtime_cache[dtype] = mtime
            return True
    except Exception as exc:
        app.logger.warning(f"[자동동기화] {dtype} DB 파일수정일 확인 실패: {exc}")
    return False


def _refresh_asan_dispatch_dashboard_cache_async(reason="dispatch-sync"):
    if not ASAN_DISPATCH_DASHBOARD_CACHE_URL or not SUPABASE_KEY:
        return

    def runner():
        try:
            response = requests.post(
                ASAN_DISPATCH_DASHBOARD_CACHE_URL,
                json={"type": "all", "reason": reason},
                headers={"Authorization": f"Bearer {SUPABASE_KEY}"},
                timeout=ASAN_DISPATCH_DASHBOARD_CACHE_TIMEOUT_SECONDS,
            )
            if response.status_code >= 400:
                app.logger.warning(
                    f"[배차현황캐시] 프리워밍 실패 status={response.status_code} reason={reason}"
                )
        except Exception as exc:
            app.logger.warning(f"[배차현황캐시] 프리워밍 오류 reason={reason}: {exc}")

    threading.Thread(target=runner, daemon=True).start()


def _set_asan_sync_status(**updates):
    with asan_sync_status_lock:
        asan_sync_status.update(updates)
        return dict(asan_sync_status)


def _get_asan_sync_status():
    with asan_sync_status_lock:
        return dict(asan_sync_status)


class AsanDispatchSyncCancelled(Exception):
    pass


def _get_asan_sync_cancel_generation():
    with asan_sync_control_lock:
        return asan_sync_cancel_generation


def _request_asan_sync_cancel(reason=""):
    global asan_sync_cancel_generation
    with asan_sync_control_lock:
        asan_sync_cancel_generation += 1
        generation = asan_sync_cancel_generation
    _set_asan_sync_status(cancel_requested=True, message=reason or "기존 백그라운드 동기화 중단 요청")
    return generation


def _raise_if_asan_sync_cancelled(sync_cancel_generation):
    if _get_asan_sync_cancel_generation() != sync_cancel_generation:
        raise AsanDispatchSyncCancelled()


def _parse_iso_datetime(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def _asan_sync_cooldown_active(now_dt):
    if ASAN_DISPATCH_SYNC_REQUEST_COOLDOWN_SECONDS <= 0:
        return False
    cooldown_until = _parse_iso_datetime(_get_asan_sync_status().get("request_cooldown_until"))
    return bool(cooldown_until and now_dt < cooldown_until)


def _parse_dispatch_target_day(target_date):
    try:
        return datetime.strptime(str(target_date), "%Y-%m-%d").date()
    except Exception:
        return None


def _dispatch_priority_context(target_dates, now):
    """1순위=오늘, 없으면 오늘 이후 첫 작업일. 2순위=그 기준 전/후 작업일."""
    today = now.date()
    available_days = sorted({
        day for day in (_parse_dispatch_target_day(target_date) for target_date in target_dates)
        if day is not None
    })
    if not available_days:
        return {"primary": None, "adjacent": set(), "ordered": []}

    if today in available_days:
        primary_day = today
    else:
        future_days = [day for day in available_days if day > today]
        primary_day = future_days[0] if future_days else available_days[-1]

    primary_idx = available_days.index(primary_day)
    adjacent_days = set()
    if primary_idx > 0:
        adjacent_days.add(available_days[primary_idx - 1])
    if primary_idx + 1 < len(available_days):
        adjacent_days.add(available_days[primary_idx + 1])

    return {
        "primary": primary_day,
        "adjacent": adjacent_days,
        "ordered": available_days,
    }


def _dispatch_date_in_primary_priority(target_date, priority_context):
    target_day = _parse_dispatch_target_day(target_date)
    return bool(target_day and target_day == priority_context.get("primary"))


def _dispatch_date_in_adjacent_priority(target_date, priority_context):
    target_day = _parse_dispatch_target_day(target_date)
    return bool(target_day and target_day in (priority_context.get("adjacent") or set()))


def _mark_asan_sync_quick_type(dtype, sync_results=None):
    status = _get_asan_sync_status()
    completed = set(status.get("quick_completed_types") or [])
    completed.add(dtype)
    quick_done = all(item in completed for item in ("glovis", "mobis"))
    updates = {
        "quick_completed_types": sorted(completed),
        "quick_done": quick_done,
        "message": "1순위 작업일 자료 반영 완료. 전/후 작업일과 나머지 날짜는 계속 동기화 중입니다." if quick_done else f"{dtype} 1순위 작업일 자료 반영 완료",
    }
    if quick_done:
        updates["quick_finished_at"] = datetime.now(KST).isoformat()
    if sync_results is not None:
        updates["results"] = sync_results
    return _set_asan_sync_status(**updates)


def _dispatch_date_chunks(items, size=50):
    items = list(items)
    for i in range(0, len(items), size):
        yield items[i:i + size]


def _touch_dispatch_file_modified_at(dtype, target_dates, file_modified_at, updated_at):
    """데이터가 같아 upsert를 생략한 시트도 저장시각 표시는 최신 파일 저장 기준으로 맞춘다."""
    if not supabase:
        return 0
    dates = sorted({d for d in target_dates if d})
    touched = 0
    for chunk in _dispatch_date_chunks(dates):
        res = (
            supabase.from_("branch_dispatch")
            .update({"file_modified_at": file_modified_at, "updated_at": updated_at})
            .eq("branch_id", "asan")
            .eq("type", dtype)
            .in_("target_date", chunk)
            .execute()
        )
        touched += len(res.data or []) or len(chunk)
    return touched


def _resolve_dispatch_sheet_date(sheet_name, now):
    match = re.search(r'(\d+)\s*[\.월]\s*(\d+)', sheet_name)
    if not match:
        return None
    m, d = int(match.group(1)), int(match.group(2))
    year = now.year
    if m == 12 and now.month == 1:
        year -= 1
    elif m == 1 and now.month == 12:
        year += 1
    return f"{year}-{m:02d}-{d:02d}"


def _dispatch_sheet_sort_key(target_date, now, priority_context=None):
    target_day = _parse_dispatch_target_day(target_date)
    if not target_day:
        return (2, target_date)
    context = priority_context or _dispatch_priority_context([target_date], now)
    primary_day = context.get("primary")
    adjacent_days = context.get("adjacent") or set()
    if primary_day and target_day == primary_day:
        return (0, 0, target_day.toordinal())
    if target_day in adjacent_days:
        distance = abs(target_day.toordinal() - primary_day.toordinal()) if primary_day else 0
        return (1, distance, target_day.toordinal())
    if primary_day and target_day > primary_day:
        return (2, target_day.toordinal(), 0)
    return (3, -target_day.toordinal(), 0)


def sync_asan_dispatch_python(force=False, phase="all", preserve_quick=False):
    global last_mtime_cache, last_file_signature_cache, last_sheet_hash_cache, asan_sync_start_time
    if not supabase:
        return {"ok": False, "message": "Supabase 미설정", "results": []}
    
    # 중복 실행 방지 및 좀비 락 해제 (30분 초과 시)
    if asan_sync_lock.locked():
        if time.time() - asan_sync_start_time > 1800:
            app.logger.warning("[자동동기화] 이전 동기화가 30분 이상 지연되어 락을 강제 해제합니다.")
            try: asan_sync_lock.release()
            except: pass

    if not asan_sync_lock.acquire(blocking=False):
        app.logger.warning("[자동동기화] 이미 동기화가 진행 중입니다. 이번 요청은 건너뜁니다.")
        _set_asan_sync_status(
            running=True,
            ok=True,
            message="이미 동기화가 진행 중입니다.",
        )
        return {"ok": True, "running": True, "message": "이미 동기화가 진행 중입니다.", "results": []}

    asan_sync_start_time = time.time()
    sync_cancel_generation = _get_asan_sync_cancel_generation()
    sync_results = []
    sync_error = None
    sync_cancelled = False
    dashboard_cache_refresh_needed = False
    sync_started_at = datetime.now(KST)
    quick_updates = {} if preserve_quick else {
        "quick_done": False,
        "quick_finished_at": None,
        "quick_completed_types": [],
        "quick_window_start": None,
        "quick_window_end": None,
        "priority_primary_date": None,
        "priority_adjacent_dates": [],
        "cancel_requested": False,
    }
    if phase == "quick":
        phase_message = "아산 배차판 1순위 작업일 동기화 준비 중"
    elif phase == "adjacent":
        phase_message = "아산 배차판 전/후 작업일 동기화 준비 중"
    elif phase == "rest":
        phase_message = "아산 배차판 나머지 날짜 동기화 준비 중"
    else:
        phase_message = "아산 배차판 동기화 준비 중"
    _set_asan_sync_status(
        running=True,
        started_at=sync_started_at.isoformat(),
        finished_at=None,
        ok=True,
        message=phase_message,
        results=[],
        force=bool(force),
        phase=phase,
        **quick_updates,
    )

    try:
        if force:
            app.logger.info("[자동동기화] 아산 배차판 수동 동기화 시작...")
        settings = get_asan_dispatch_settings(force=force)
        if not settings: 
            app.logger.error("[자동동기화] 아산 배차 설정을 찾을 수 없습니다.")
            sync_error = "아산 배차 설정을 찾을 수 없습니다."
            return {"ok": False, "message": sync_error, "results": sync_results}

        for dtype in ['glovis', 'mobis']:
            _raise_if_asan_sync_cancelled(sync_cancel_generation)
            dtype_result = {"type": dtype, "phase": phase, "success": True, "sheets": 0, "metadata_touched": 0, "message": ""}
            _set_asan_sync_status(message=f"{dtype} 파일 확인 중", results=sync_results)
            rel_path = settings.get(f"{dtype}_path")
            if not rel_path:
                dtype_result["message"] = "파일 경로 없음"
                sync_results.append(dtype_result)
                if phase in ("all", "quick"):
                    _mark_asan_sync_quick_type(dtype, sync_results)
                continue
            
            full_path = Path("/app/data") / rel_path.lstrip("/")
            
            if not full_path.exists():
                app.logger.warning(f"[자동동기화] 파일을 찾을 수 없음: {full_path}")
                dtype_result.update({"success": False, "message": "파일을 찾을 수 없음"})
                sync_results.append(dtype_result)
                if phase in ("all", "quick"):
                    _mark_asan_sync_quick_type(dtype, sync_results)
                continue
            
            # 파일 수정 시간 체크
            file_stat = full_path.stat()
            mtime_ts = file_stat.st_mtime
            mtime = datetime.fromtimestamp(mtime_ts, tz=KST).isoformat()
            cache_mtime = last_mtime_cache.get(dtype)
            cached_signature = last_file_signature_cache.get(dtype)
            file_signature = (getattr(file_stat, "st_mtime_ns", int(mtime_ts * 1_000_000_000)), file_stat.st_size)

            if not force and cached_signature == file_signature:
                dtype_result["message"] = "파일 서명 동일"
                sync_results.append(dtype_result)
                continue

            if not force and not cached_signature and _dispatch_db_has_current_mtime(dtype, mtime_ts, mtime):
                last_file_signature_cache[dtype] = file_signature
                dispatch_sync_gate.mark_synced(f"dispatch:{dtype}", file_signature)
                app.logger.info(f"[자동동기화] {dtype} DB 최신 상태 확인, 컨테이너 재시작 후 최초 전체 파싱 생략")
                dtype_result["message"] = "DB 최신 상태"
                sync_results.append(dtype_result)
                continue

            if cache_mtime:
                app.logger.info(f"[자동동기화] {dtype} 파일 변경 감지: 이전={cache_mtime}, 현재={mtime}")
            else:
                app.logger.info(f"[자동동기화] {dtype} 최초 동기화 확인: 파일수정일={mtime}")

            decision = dispatch_sync_gate.check(f"dispatch:{dtype}", file_signature, force=force)
            if not decision.ready:
                if decision.reason in ("pending", "settling"):
                    app.logger.info(f"[자동동기화] {dtype} 파일 저장 안정화 대기 중 ({decision.reason})")
                continue
            
            app.logger.info(f"[자동동기화] {dtype} 데이터 추출 시작... (파일수정됨/강제)")
            
            # 네트워크 파일 행(Hang) 방지를 위해 로컬 임시 파일로 복사
            import tempfile, shutil
            temp_path = tempfile.mktemp(suffix=".xlsx")
            
            try:
                shutil.copy2(full_path, temp_path)
                app.logger.info(f"[자동동기화] {dtype} 로컬 임시 파일 복사 완료: {temp_path}")
            except Exception as e:
                app.logger.error(f"[자동동기화] {dtype} 로컬 임시 파일 복사 실패: {e}")
                dtype_result.update({"success": False, "message": f"로컬 임시 파일 복사 실패: {e}"})
                sync_results.append(dtype_result)
                continue
            
            # 파일에 현재 남아있는 날짜 시트. 파일에서 사라진 날짜는 마감 스냅샷으로 DB에 보존한다.
            valid_dates = []
            
            # 엑셀 읽기
            xl = None
            wb_comments = None
            df = None
            data_df = None
            rows = None
            comments_dict = None
            try:
                # [v5.10.6] 엔진 명시 및 최적화
                xl = pd.ExcelFile(temp_path, engine='openpyxl')
                sync_count = 0
                app.logger.info(f"[자동동기화] {dtype} 엑셀 로드 완료. 시트수: {len(xl.sheet_names)}")
                
                # [v5.10.15] 메모 추출용 워크북은 파일당 1회만 로드 (루프 밖)
                import openpyxl as _openpyxl
                try:
                    wb_comments = _openpyxl.load_workbook(temp_path, data_only=True, keep_vba=False)
                except Exception as e:
                    app.logger.warning(f"[자동동기화] {dtype} 메모 워크북 로드 실패: {e}")
                
                now = datetime.now(KST)
                sheet_jobs = []
                for sheet_name in xl.sheet_names:
                    # [v5.10.9] 더 유연한 시트명 파싱 ("4.29", "04. 29", "4월29일" 등 모두 매칭)
                    target_date = _resolve_dispatch_sheet_date(sheet_name, now)
                    if not target_date:
                        continue
                    sheet_jobs.append((target_date, sheet_name))
                priority_context = _dispatch_priority_context([target_date for target_date, _ in sheet_jobs], now)
                primary_date = priority_context.get("primary")
                adjacent_dates = sorted(day.isoformat() for day in (priority_context.get("adjacent") or set()))
                if phase in ("all", "quick") and primary_date:
                    _set_asan_sync_status(
                        quick_window_start=primary_date.isoformat(),
                        quick_window_end=primary_date.isoformat(),
                        priority_primary_date=primary_date.isoformat(),
                        priority_adjacent_dates=adjacent_dates,
                    )
                sheet_jobs = [
                    (_dispatch_sheet_sort_key(target_date, now, priority_context), target_date, sheet_name)
                    for target_date, sheet_name in sheet_jobs
                ]
                sheet_jobs.sort(key=lambda item: item[0])
                if phase == "quick":
                    _set_asan_sync_status(message=f"{dtype} 1순위 작업일 처리 중", results=sync_results)
                elif phase == "adjacent":
                    _set_asan_sync_status(message=f"{dtype} 전/후 작업일 처리 중", results=sync_results)
                elif phase == "rest":
                    _set_asan_sync_status(message=f"{dtype} 나머지 날짜 처리 중", results=sync_results)
                else:
                    _set_asan_sync_status(message=f"{dtype} 1순위 작업일 우선 처리 중", results=sync_results)

                metadata_only_dates = []
                quick_marked = False
                for _, target_date, sheet_name in sheet_jobs:
                    _raise_if_asan_sync_cancelled(sync_cancel_generation)
                    is_primary_sheet = _dispatch_date_in_primary_priority(target_date, priority_context)
                    is_adjacent_sheet = _dispatch_date_in_adjacent_priority(target_date, priority_context)
                    if phase == "quick" and not is_primary_sheet:
                        continue
                    if phase == "adjacent" and not is_adjacent_sheet:
                        continue
                    if phase == "rest" and (is_primary_sheet or is_adjacent_sheet):
                        continue
                    if phase == "all" and not quick_marked and not is_primary_sheet:
                        _mark_asan_sync_quick_type(dtype, sync_results)
                        quick_marked = True
                    valid_dates.append(target_date)
                    
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
                        # [v5.14.22] 행 데이터뿐 아니라 셀 메모도 변경 감지에 포함한다.
                        # 배차 완료 시간은 comments에 기록되는 경우가 많아 rows만 보면 자동 동기화가 누락될 수 있다.
                        sheet_hash_payload = json.dumps(
                            {"rows": rows, "comments": comments_dict},
                            ensure_ascii=False,
                            sort_keys=True,
                            default=str,
                        )
                        sheet_hash = hashlib.md5(sheet_hash_payload.encode('utf-8')).hexdigest()
                        cache_key = f"{dtype}:{sheet_name}"
                        if not force and last_sheet_hash_cache.get(cache_key) == sheet_hash:
                            metadata_only_dates.append(target_date)
                            continue  # 데이터 동일 → Supabase upsert 생략, 저장시각 메타만 갱신
                        
                        for attempt in range(3): # 최대 3번 재시도
                            try:
                                _upsert_branch_dispatch({
                                    "branch_id": "asan", "type": dtype, "target_date": target_date,
                                    "headers": headers, "data": rows, "comments": comments_dict, # [v5.10.15] 메모 복원
                                    "row_count": len(rows), "valid_row_count": len(rows),
                                    "file_modified_at": mtime, "updated_at": now.isoformat()
                                })
                                last_sheet_hash_cache[cache_key] = sheet_hash  # 성공 시 캐시 업데이트
                                sync_count += 1
                                break # 성공 시 재시도 루프 탈출
                            except Exception as e:
                                app.logger.error(f"[자동동기화] {dtype} 시트 '{sheet_name}' 저장 실패 (시도 {attempt+1}/3): {e}")
                                time.sleep(1) # 1초 대기 후 재시도
                        else:
                            app.logger.error(f"[자동동기화] {dtype} 시트 '{sheet_name}' 최종 저장 실패.")
                    df = None
                    data_df = None
                    rows = None
                    comments_dict = None
                    gc.collect()
                    _raise_if_asan_sync_cancelled(sync_cancel_generation)
                if phase in ("all", "quick") and not quick_marked:
                    _mark_asan_sync_quick_type(dtype, sync_results)

                metadata_touched = 0
                _raise_if_asan_sync_cancelled(sync_cancel_generation)
                if metadata_only_dates:
                    metadata_touched = _touch_dispatch_file_modified_at(
                        dtype,
                        metadata_only_dates,
                        mtime,
                        now.isoformat(),
                    )
                    app.logger.info(
                        f"[자동동기화] {dtype} 데이터 동일 시트 {metadata_touched}건 파일수정일만 갱신"
                    )

                app.logger.info(f"[자동동기화] {dtype} 동기화 완료 ({sync_count} 시트)")
                if sync_count > 0:
                    dashboard_cache_refresh_needed = True
                if phase != "quick":
                    last_mtime_cache[dtype] = mtime
                    last_file_signature_cache[dtype] = file_signature
                    dispatch_sync_gate.mark_synced(f"dispatch:{dtype}", file_signature)
                dtype_result.update({
                    "success": True,
                    "sheets": sync_count,
                    "metadata_touched": metadata_touched,
                    "message": "동기화 완료",
                })
                sync_results.append(dtype_result)
                
                # [v5.14.21] 엑셀에서 삭제된 과거 시트는 "마감된 자료"로 간주해 DB에 보존한다.
                # 현행 파일은 진행 중 입력판이고, branch_dispatch는 삭제된 시트까지 포함하는 조회 원장이다.
                if valid_dates:
                    app.logger.info(
                        f"[자동동기화] {dtype} 현재 파일 날짜 {len(valid_dates)}개 확인. "
                        "파일에서 삭제된 과거 시트는 DB 마감 스냅샷으로 보존합니다."
                    )

                # [v5.10.15] 메모용 워크북 메모리 해제
                if wb_comments:
                    try: wb_comments.close()
                    except: pass
            except Exception as e:
                app.logger.error(f"[자동동기화] {dtype} 엑셀 처리 중 에러: {e}")
                dtype_result.update({"success": False, "message": str(e)})
                sync_results.append(dtype_result)
            finally:
                # 임시 파일 삭제
                try:
                    import os
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
                except Exception as e:
                    app.logger.warning(f"[자동동기화] {dtype} 임시 파일 삭제 실패: {e}")
                try:
                    if wb_comments:
                        wb_comments.close()
                except Exception:
                    pass
                try:
                    if xl:
                        xl.close()
                except Exception:
                    pass
                xl = None
                wb_comments = None
                df = None
                data_df = None
                rows = None
                comments_dict = None
                gc.collect()

    except AsanDispatchSyncCancelled:
        sync_cancelled = True
        app.logger.info("[자동동기화] 새 1순위 요청으로 기존 백그라운드 동기화를 중단합니다.")
    except Exception as e:
        sync_error = str(e)
        app.logger.error(f"[자동동기화] 전체 프로세스 에러: {e}", exc_info=True)
    finally:
        ok = sync_error is None and all(result.get("success", True) for result in sync_results)
        if sync_cancelled:
            message = "새 1순위 동기화 요청으로 기존 백그라운드 동기화를 중단했습니다."
        elif sync_error:
            message = sync_error
        elif phase == "quick":
            message = "아산 배차판 1순위 작업일 동기화 완료"
        elif phase == "adjacent":
            message = "아산 배차판 전/후 작업일 동기화 완료"
        elif phase == "rest":
            message = "아산 배차판 나머지 날짜 동기화 완료"
        else:
            message = "아산 배차판 동기화 완료"
        _set_asan_sync_status(
            running=False,
            finished_at=datetime.now(KST).isoformat(),
            ok=ok,
            message=message,
            results=sync_results,
            cancel_requested=False,
        )
        if ok and not sync_cancelled and dashboard_cache_refresh_needed and phase in ("quick", "rest", "all"):
            _refresh_asan_dispatch_dashboard_cache_async(f"dispatch-{phase}")
        asan_sync_lock.release()
    return {"ok": ok, "cancelled": sync_cancelled, "message": message, "results": sync_results}


def sync_asan_dispatch_manual_python():
    """수동 요청은 1순위 작업일을 먼저 끝낸 뒤 전/후 작업일과 나머지 날짜를 이어서 처리한다."""
    quick_result = sync_asan_dispatch_python(force=True, phase="quick")
    if quick_result.get("ok") is False:
        return quick_result
    adjacent_result = sync_asan_dispatch_python(force=True, phase="adjacent", preserve_quick=True)
    if adjacent_result.get("ok") is False or adjacent_result.get("cancelled"):
        return adjacent_result
    return sync_asan_dispatch_python(force=True, phase="rest", preserve_quick=True)


def _restart_asan_dispatch_manual_after_current():
    with asan_sync_restart_lock:
        for _ in range(1200):
            if not asan_sync_lock.locked():
                break
            time.sleep(0.25)
        sync_asan_dispatch_manual_python()


def _asan_dispatch_auto_ready_to_sync():
    """자동 동기화는 파일 변경이 안정화된 뒤 수동 동기화와 같은 순서로 실행한다."""
    if not supabase:
        return False

    try:
        settings = get_asan_dispatch_settings(force=False)
    except Exception as exc:
        app.logger.warning(f"[자동동기화] 배차 설정 조회 실패: {exc}")
        return False

    if not settings:
        return False

    ready_types = []
    waiting_reasons = []
    for dtype in ['glovis', 'mobis']:
        rel_path = settings.get(f"{dtype}_path")
        if not rel_path:
            continue

        full_path = Path("/app/data") / rel_path.lstrip("/")
        if not full_path.exists():
            continue

        try:
            file_stat = full_path.stat()
        except Exception as exc:
            app.logger.warning(f"[자동동기화] {dtype} 파일 상태 확인 실패: {exc}")
            continue

        mtime_ts = file_stat.st_mtime
        mtime = datetime.fromtimestamp(mtime_ts, tz=KST).isoformat()
        file_signature = (getattr(file_stat, "st_mtime_ns", int(mtime_ts * 1_000_000_000)), file_stat.st_size)
        cached_signature = last_file_signature_cache.get(dtype)

        if cached_signature == file_signature:
            continue

        if not cached_signature and _dispatch_db_has_current_mtime(dtype, mtime_ts, mtime):
            last_file_signature_cache[dtype] = file_signature
            dispatch_sync_gate.mark_synced(f"dispatch:{dtype}", file_signature)
            app.logger.info(f"[자동동기화] {dtype} DB 최신 상태 확인, 자동 동기화 생략")
            continue

        decision = dispatch_sync_gate.check(f"dispatch:{dtype}", file_signature, force=False)
        if decision.ready:
            ready_types.append(dtype)
        else:
            waiting_reasons.append(f"{dtype}:{decision.reason}")

    if waiting_reasons:
        app.logger.info(f"[자동동기화] 파일 안정화/재시도 대기 중: {', '.join(waiting_reasons)}")
        return False

    if ready_types:
        app.logger.info(
            f"[자동동기화] 변경 파일 안정화 완료: {', '.join(ready_types)}. "
            "수동 동기화와 동일한 1순위 우선 절차로 실행합니다."
        )
        return True

    return False


def sync_asan_dispatch_auto_python():
    """파일 변경 감지는 자동으로 하되, 실제 반영 순서는 수동 동기화와 동일하게 맞춘다."""
    if not _asan_dispatch_auto_ready_to_sync():
        return {"ok": True, "message": "변경 없음", "results": []}
    return sync_asan_dispatch_manual_python()


def asan_sync_scheduler():
    app.logger.info(
        f"[스케줄러] 아산 배차판 자동 동기화 스케줄러 시작 "
        f"(poll={ASAN_DISPATCH_SYNC_POLL_SECONDS}s, quiet={ASAN_DISPATCH_SYNC_QUIET_SECONDS}s)"
    )
    while True:
        try:
            now = datetime.now(KST)
            if 6 <= now.hour <= 23:
                sync_asan_dispatch_auto_python()
            time.sleep(ASAN_DISPATCH_SYNC_POLL_SECONDS)
        except Exception as e:
            app.logger.error(f"[스케줄러] 에러: {e}")
            time.sleep(ASAN_DISPATCH_SYNC_POLL_SECONDS)

threading.Thread(target=asan_sync_scheduler, daemon=True).start()

TRANSPORT_HISTORY_HEADER_ALIASES = {
    "출차시간": "청구금액",
}


def _set_transport_history_sync_status(**updates):
    with transport_history_sync_status_lock:
        transport_history_sync_status.update(updates)
        return dict(transport_history_sync_status)


def _get_transport_history_sync_status():
    with transport_history_sync_status_lock:
        return dict(transport_history_sync_status)


def _transport_history_cooldown_active(now_dt):
    if ASAN_TRANSPORT_HISTORY_SYNC_REQUEST_COOLDOWN_SECONDS <= 0:
        return False
    cooldown_until = _parse_iso_datetime(_get_transport_history_sync_status().get("request_cooldown_until"))
    return bool(cooldown_until and now_dt < cooldown_until)


def _normalize_transport_history_rel_path(value):
    rel_path = str(value or "").strip() or ASAN_TRANSPORT_HISTORY_DEFAULT_PATH
    rel_path = rel_path.replace("\\", "/")
    return "/" + rel_path.lstrip("/")


def _path_to_transport_history_rel(path):
    try:
        rel = Path(path).resolve().relative_to(Path("/app/data").resolve())
        return "/" + str(rel).replace("\\", "/")
    except Exception:
        return _normalize_transport_history_rel_path(path)


def _find_transport_history_file():
    root = Path("/app/data/아산지점")
    if not root.exists():
        return None
    for pattern in ("**/2026_수출리스트*.xlsx", "**/2026_수출리스트*.xlsm"):
        matches = sorted(root.glob(pattern), key=lambda p: len(str(p)))
        if matches:
            return matches[0]
    return None


def _resolve_asan_transport_history_path(settings=None):
    settings = settings or {}
    rel_path = _normalize_transport_history_rel_path(settings.get("transport_history_path"))
    candidates = [Path("/app/data") / rel_path.lstrip("/")]

    default_candidate = Path("/app/data") / ASAN_TRANSPORT_HISTORY_DEFAULT_PATH.lstrip("/")
    if default_candidate not in candidates:
        candidates.append(default_candidate)

    for candidate in candidates:
        if candidate.exists():
            return _path_to_transport_history_rel(candidate), candidate

    found = _find_transport_history_file()
    if found:
        return _path_to_transport_history_rel(found), found

    return rel_path, candidates[0]


def _extract_transport_history_source_year(rel_path, full_path):
    for value in (rel_path, str(full_path)):
        match = re.search(r"(20\d{2})", str(value or ""))
        if match:
            return int(match.group(1))
    return datetime.now(KST).year


def _resolve_transport_history_sheet_month(sheet_name, source_year):
    text = str(sheet_name or "").strip()
    year_month = re.search(r"(20\d{2})\D{0,4}(\d{1,2})\s*월?", text)
    if year_month:
        year = int(year_month.group(1))
        month = int(year_month.group(2))
    else:
        month_match = re.search(r"(\d{1,2})\s*월", text) or re.match(r"^\s*(\d{1,2})\s*$", text)
        if not month_match:
            return None
        year = int(source_year)
        month = int(month_match.group(1))

    if month < 1 or month > 12:
        return None
    return f"{year}-{month:02d}-01"


def _parse_transport_history_month_day(target_month):
    try:
        return datetime.strptime(str(target_month), "%Y-%m-%d").date().replace(day=1)
    except Exception:
        return None


def _transport_history_priority_context(target_months, now):
    current_month = now.date().replace(day=1)
    available_months = sorted({
        day for day in (_parse_transport_history_month_day(target_month) for target_month in target_months)
        if day is not None
    })
    if not available_months:
        return {"primary": None, "adjacent": set(), "ordered": []}

    if current_month in available_months:
        primary = current_month
    else:
        future = [day for day in available_months if day > current_month]
        primary = future[0] if future else available_months[-1]

    primary_idx = available_months.index(primary)
    adjacent = set()
    if primary_idx > 0:
        adjacent.add(available_months[primary_idx - 1])
    if primary_idx + 1 < len(available_months):
        adjacent.add(available_months[primary_idx + 1])

    return {"primary": primary, "adjacent": adjacent, "ordered": available_months}


def _transport_history_month_in_primary(target_month, priority_context):
    target_day = _parse_transport_history_month_day(target_month)
    return bool(target_day and target_day == priority_context.get("primary"))


def _transport_history_month_in_adjacent(target_month, priority_context):
    target_day = _parse_transport_history_month_day(target_month)
    return bool(target_day and target_day in (priority_context.get("adjacent") or set()))


def _transport_history_sheet_sort_key(target_month, now, priority_context=None):
    target_day = _parse_transport_history_month_day(target_month)
    if not target_day:
        return (2, target_month)
    context = priority_context or _transport_history_priority_context([target_month], now)
    primary = context.get("primary")
    adjacent = context.get("adjacent") or set()
    if primary and target_day == primary:
        return (0, 0, target_day.toordinal())
    if target_day in adjacent:
        distance = abs(target_day.toordinal() - primary.toordinal()) if primary else 0
        return (1, distance, target_day.toordinal())
    if primary and target_day > primary:
        return (2, target_day.toordinal(), 0)
    return (3, -target_day.toordinal(), 0)


def _transport_history_cell_to_text(value):
    try:
        if pd.isna(value):
            return ""
    except Exception:
        pass
    if isinstance(value, pd.Timestamp):
        value = value.to_pydatetime()
    if isinstance(value, datetime):
        if value.year <= 1901:
            return value.strftime("%H:%M")
        if value.hour == 0 and value.minute == 0 and value.second == 0:
            return value.strftime("%Y-%m-%d")
        return value.strftime("%Y-%m-%d %H:%M")
    if isinstance(value, float) and math.isfinite(value) and value.is_integer():
        return str(int(value))
    return str(value).replace("\n", " ").strip()


def _compact_transport_history_header(value):
    return re.sub(r"\s+", "", str(value or "")).strip()


def _normalize_transport_history_headers(source_headers):
    headers = []
    used = {}
    for idx, header in enumerate(source_headers or []):
        raw = str(header or "").replace("\n", " ").strip()
        compact = _compact_transport_history_header(raw)
        normalized = TRANSPORT_HISTORY_HEADER_ALIASES.get(compact, raw or f"col_{idx + 1}")
        count = used.get(normalized, 0)
        used[normalized] = count + 1
        headers.append(f"{normalized}_{count + 1}" if count else normalized)
    return headers


def _transport_history_header_score(values):
    nonempty = [v for v in values if v]
    joined = "".join(nonempty)
    score = len(nonempty)
    matched = 0
    for token in ("컨테이너", "청구", "출차", "차량", "상차", "하차", "수출", "수입", "작업지", "운송", "비고"):
        if token in joined:
            matched += 1
            score += 5
    if "합계" in joined or "소계" in joined:
        score -= 8
    if matched == 0:
        return min(score, 4)
    return score


def _find_transport_history_header_idx(df):
    best_idx = -1
    best_score = -1
    for idx, row in df.head(40).iterrows():
        values = [_transport_history_cell_to_text(value) for value in row.tolist()]
        score = _transport_history_header_score(values)
        if score > best_score:
            best_idx = idx
            best_score = score
    return best_idx if best_score >= 8 else -1


def _is_meaningful_transport_history_row(values):
    nonempty = [str(value or "").strip() for value in values if str(value or "").strip()]
    if len(nonempty) < 2:
        return False
    joined = "".join(nonempty)
    if joined in ("합계", "소계") or joined.startswith("합계"):
        return False
    return True


def _upsert_branch_transport_history(payload):
    return supabase.from_("branch_transport_history").upsert(
        payload,
        on_conflict="branch_id,target_month,sheet_name",
    ).execute()


def _touch_transport_history_file_modified_at(items, file_modified_at, updated_at):
    touched = 0
    for item in items:
        res = (
            supabase.from_("branch_transport_history")
            .update({"file_modified_at": file_modified_at, "updated_at": updated_at})
            .eq("branch_id", "asan")
            .eq("target_month", item["target_month"])
            .eq("sheet_name", item["sheet_name"])
            .execute()
        )
        touched += len(res.data or []) or 1
    return touched


def _transport_history_db_has_current_mtime(mtime_ts, mtime):
    if not supabase:
        return False
    try:
        res = (
            supabase.from_("branch_transport_history")
            .select("file_modified_at")
            .eq("branch_id", "asan")
            .order("file_modified_at", desc=True)
            .limit(1)
            .execute()
        )
        db_mtime = (res.data or [{}])[0].get("file_modified_at")
        if not db_mtime:
            return False
        db_ts = datetime.fromisoformat(str(db_mtime).replace("Z", "+00:00")).timestamp()
        return abs(db_ts - mtime_ts) < 1
    except Exception as exc:
        app.logger.warning(f"[운송내역 자동동기화] DB 파일수정일 확인 실패: {exc}")
    return False


def _mark_transport_history_quick(sync_results=None):
    updates = {
        "quick_done": True,
        "quick_finished_at": datetime.now(KST).isoformat(),
        "message": "운송내역 1순위 월 자료 반영 완료. 인접월과 나머지 월은 계속 동기화 중입니다.",
    }
    if sync_results is not None:
        updates["results"] = sync_results
    return _set_transport_history_sync_status(**updates)


def sync_asan_transport_history_python(force=False, phase="all", preserve_quick=False):
    global transport_history_sync_start_time
    if not supabase:
        return {"ok": False, "message": "Supabase 미설정", "results": []}

    if transport_history_sync_lock.locked():
        if time.time() - transport_history_sync_start_time > 1800:
            app.logger.warning("[운송내역 동기화] 이전 동기화가 30분 이상 지연되어 락을 강제 해제합니다.")
            try:
                transport_history_sync_lock.release()
            except Exception:
                pass

    if not transport_history_sync_lock.acquire(blocking=False):
        _set_transport_history_sync_status(running=True, ok=True, message="이미 동기화가 진행 중입니다.")
        return {"ok": True, "running": True, "message": "이미 동기화가 진행 중입니다.", "results": []}

    transport_history_sync_start_time = time.time()
    sync_results = []
    sync_error = None
    sync_started_at = datetime.now(KST)
    quick_updates = {} if preserve_quick else {
        "quick_done": False,
        "quick_finished_at": None,
        "quick_window_start": None,
        "quick_window_end": None,
        "priority_primary_month": None,
        "priority_adjacent_months": [],
    }
    if phase == "quick":
        phase_message = "운송내역 1순위 월 동기화 준비 중"
    elif phase == "adjacent":
        phase_message = "운송내역 인접월 동기화 준비 중"
    elif phase == "rest":
        phase_message = "운송내역 나머지 월 동기화 준비 중"
    else:
        phase_message = "운송내역 동기화 준비 중"

    _set_transport_history_sync_status(
        running=True,
        started_at=sync_started_at.isoformat(),
        finished_at=None,
        ok=True,
        message=phase_message,
        results=[],
        force=bool(force),
        phase=phase,
        **quick_updates,
    )

    xl = None
    temp_path = None
    try:
        settings = get_asan_dispatch_settings(force=force) or {}
        rel_path, full_path = _resolve_asan_transport_history_path(settings)
        result = {"type": "transport-history", "phase": phase, "success": True, "sheets": 0, "metadata_touched": 0, "message": ""}

        if not full_path.exists():
            result.update({"success": False, "message": f"파일을 찾을 수 없음: {rel_path}"})
            sync_results.append(result)
            sync_error = result["message"]
            return {"ok": False, "message": sync_error, "results": sync_results}

        file_stat = full_path.stat()
        mtime_ts = file_stat.st_mtime
        mtime = datetime.fromtimestamp(mtime_ts, tz=KST).isoformat()
        file_signature = (getattr(file_stat, "st_mtime_ns", int(mtime_ts * 1_000_000_000)), file_stat.st_size)
        cache_key = "transport-history"

        if not force and last_transport_history_file_signature_cache.get(cache_key) == file_signature:
            result["message"] = "파일 서명 동일"
            sync_results.append(result)
            return {"ok": True, "message": result["message"], "results": sync_results}

        if not force and cache_key not in last_transport_history_file_signature_cache and _transport_history_db_has_current_mtime(mtime_ts, mtime):
            last_transport_history_file_signature_cache[cache_key] = file_signature
            transport_history_sync_gate.mark_synced(cache_key, file_signature)
            result["message"] = "DB 최신 상태"
            sync_results.append(result)
            return {"ok": True, "message": result["message"], "results": sync_results}

        decision = transport_history_sync_gate.check(cache_key, file_signature, force=force)
        if not decision.ready:
            result["message"] = f"파일 안정화 대기 중: {decision.reason}"
            sync_results.append(result)
            return {"ok": True, "message": result["message"], "results": sync_results}

        import tempfile, shutil
        temp_path = tempfile.mktemp(suffix=full_path.suffix or ".xlsx")
        shutil.copy2(full_path, temp_path)
        app.logger.info(f"[운송내역 동기화] 로컬 임시 파일 복사 완료: {temp_path}")

        xl = pd.ExcelFile(temp_path, engine="openpyxl")
        source_year = _extract_transport_history_source_year(rel_path, full_path)
        sheet_jobs = []
        for sheet_name in xl.sheet_names:
            target_month = _resolve_transport_history_sheet_month(sheet_name, source_year)
            if target_month:
                sheet_jobs.append((target_month, sheet_name))

        now = datetime.now(KST)
        priority_context = _transport_history_priority_context([target_month for target_month, _ in sheet_jobs], now)
        primary = priority_context.get("primary")
        adjacent = sorted(day.isoformat() for day in (priority_context.get("adjacent") or set()))
        if phase in ("all", "quick") and primary:
            _set_transport_history_sync_status(
                quick_window_start=primary.isoformat(),
                quick_window_end=primary.isoformat(),
                priority_primary_month=primary.isoformat(),
                priority_adjacent_months=adjacent,
            )

        sheet_jobs = [
            (_transport_history_sheet_sort_key(target_month, now, priority_context), target_month, sheet_name)
            for target_month, sheet_name in sheet_jobs
        ]
        sheet_jobs.sort(key=lambda item: item[0])

        metadata_only_items = []
        for _, target_month, sheet_name in sheet_jobs:
            is_primary = _transport_history_month_in_primary(target_month, priority_context)
            is_adjacent = _transport_history_month_in_adjacent(target_month, priority_context)
            if phase == "quick" and not is_primary:
                continue
            if phase == "adjacent" and not is_adjacent:
                continue
            if phase == "rest" and (is_primary or is_adjacent):
                continue

            _set_transport_history_sync_status(message=f"{sheet_name} 시트 처리 중", results=sync_results)
            df = pd.read_excel(xl, sheet_name=sheet_name, header=None, dtype=object)
            header_idx = _find_transport_history_header_idx(df)
            if header_idx < 0:
                app.logger.warning(f"[운송내역 동기화] '{sheet_name}' 헤더 행을 찾지 못해 건너뜁니다.")
                continue

            source_headers = [_transport_history_cell_to_text(value) or f"col_{idx + 1}" for idx, value in enumerate(df.iloc[header_idx].tolist())]
            headers = _normalize_transport_history_headers(source_headers)
            data_df = df.iloc[header_idx + 1:]
            rows = []
            for _, row in data_df.iterrows():
                values = [_transport_history_cell_to_text(value) for value in row.tolist()[:len(headers)]]
                if _is_meaningful_transport_history_row(values):
                    if len(values) < len(headers):
                        values += [""] * (len(headers) - len(values))
                    rows.append(values)

            sheet_hash_payload = json.dumps(
                {"headers": headers, "source_headers": source_headers, "rows": rows},
                ensure_ascii=False,
                sort_keys=True,
                default=str,
            )
            sheet_hash = hashlib.md5(sheet_hash_payload.encode("utf-8")).hexdigest()
            sheet_cache_key = f"{target_month}:{sheet_name}"
            if not force and last_transport_history_sheet_hash_cache.get(sheet_cache_key) == sheet_hash:
                metadata_only_items.append({"target_month": target_month, "sheet_name": sheet_name})
                continue

            _upsert_branch_transport_history({
                "branch_id": "asan",
                "target_month": target_month,
                "sheet_name": sheet_name,
                "headers": headers,
                "source_headers": source_headers,
                "data": rows,
                "row_count": len(rows),
                "valid_row_count": len(rows),
                "file_modified_at": mtime,
                "metadata": {
                    "source_path": rel_path,
                    "source_year": source_year,
                    "header_row_index": int(header_idx),
                },
                "updated_at": now.isoformat(),
            })
            last_transport_history_sheet_hash_cache[sheet_cache_key] = sheet_hash
            result["sheets"] += 1
            df = None
            data_df = None
            gc.collect()

        if metadata_only_items:
            result["metadata_touched"] = _touch_transport_history_file_modified_at(metadata_only_items, mtime, now.isoformat())

        last_transport_history_file_signature_cache[cache_key] = file_signature
        transport_history_sync_gate.mark_synced(cache_key, file_signature)
        result["message"] = "동기화 완료"
        sync_results.append(result)
        if phase in ("all", "quick"):
            _mark_transport_history_quick(sync_results)
        return {"ok": True, "message": "운송내역 동기화 완료", "results": sync_results}
    except Exception as exc:
        sync_error = str(exc)
        app.logger.error(f"[운송내역 동기화] 오류: {exc}", exc_info=True)
        return {"ok": False, "message": sync_error, "results": sync_results}
    finally:
        try:
            if xl:
                xl.close()
        except Exception:
            pass
        try:
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)
        except Exception as exc:
            app.logger.warning(f"[운송내역 동기화] 임시 파일 삭제 실패: {exc}")
        ok = sync_error is None
        if phase == "quick" and ok:
            message = "운송내역 1순위 월 동기화 완료"
        elif phase == "adjacent" and ok:
            message = "운송내역 인접월 동기화 완료"
        elif phase == "rest" and ok:
            message = "운송내역 나머지 월 동기화 완료"
        elif ok:
            message = "운송내역 동기화 완료"
        else:
            message = sync_error or "운송내역 동기화 실패"
        _set_transport_history_sync_status(
            running=False,
            finished_at=datetime.now(KST).isoformat(),
            ok=ok,
            message=message,
            results=sync_results,
        )
        try:
            transport_history_sync_lock.release()
        except Exception:
            pass
        gc.collect()


def sync_asan_transport_history_manual_python():
    quick_result = sync_asan_transport_history_python(force=True, phase="quick")
    if quick_result.get("ok") is False:
        return quick_result
    adjacent_result = sync_asan_transport_history_python(force=True, phase="adjacent", preserve_quick=True)
    if adjacent_result.get("ok") is False:
        return adjacent_result
    return sync_asan_transport_history_python(force=True, phase="rest", preserve_quick=True)


def _asan_transport_history_auto_ready_to_sync():
    if not supabase:
        return False
    try:
        settings = get_asan_dispatch_settings(force=False) or {}
        _, full_path = _resolve_asan_transport_history_path(settings)
        if not full_path.exists():
            return False
        file_stat = full_path.stat()
        mtime_ts = file_stat.st_mtime
        mtime = datetime.fromtimestamp(mtime_ts, tz=KST).isoformat()
        file_signature = (getattr(file_stat, "st_mtime_ns", int(mtime_ts * 1_000_000_000)), file_stat.st_size)
        cache_key = "transport-history"
        if last_transport_history_file_signature_cache.get(cache_key) == file_signature:
            return False
        if cache_key not in last_transport_history_file_signature_cache and _transport_history_db_has_current_mtime(mtime_ts, mtime):
            last_transport_history_file_signature_cache[cache_key] = file_signature
            transport_history_sync_gate.mark_synced(cache_key, file_signature)
            return False
        decision = transport_history_sync_gate.check(cache_key, file_signature, force=False)
        return decision.ready
    except Exception as exc:
        app.logger.warning(f"[운송내역 자동동기화] 준비 확인 실패: {exc}")
        return False


def sync_asan_transport_history_auto_python():
    if not _asan_transport_history_auto_ready_to_sync():
        return {"ok": True, "message": "변경 없음", "results": []}
    return sync_asan_transport_history_manual_python()


def asan_transport_history_sync_scheduler():
    app.logger.info(
        f"[스케줄러] 아산 운송내역 자동 동기화 스케줄러 시작 "
        f"(poll={ASAN_TRANSPORT_HISTORY_SYNC_POLL_SECONDS}s, quiet={ASAN_TRANSPORT_HISTORY_SYNC_QUIET_SECONDS}s)"
    )
    while True:
        try:
            now = datetime.now(KST)
            if 6 <= now.hour <= 23:
                sync_asan_transport_history_auto_python()
            time.sleep(ASAN_TRANSPORT_HISTORY_SYNC_POLL_SECONDS)
        except Exception as exc:
            app.logger.error(f"[운송내역 스케줄러] 에러: {exc}")
            time.sleep(ASAN_TRANSPORT_HISTORY_SYNC_POLL_SECONDS)


threading.Thread(target=asan_transport_history_sync_scheduler, daemon=True).start()

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

@app.route("/api/debug/log", methods=["POST"])
def post_debug_log():
    """Android app and overlay debug log receiver."""
    try:
        data = request.get_json(silent=True) or {}
        ts = datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S")
        log_file = Path(os.environ.get("DEBUG_APP_LOG_PATH", "debug_app.log"))
        log_file.parent.mkdir(parents=True, exist_ok=True)
        with log_file.open("a", encoding="utf-8") as f:
            f.write(f"[{ts}] {json.dumps(data, ensure_ascii=False)}\n")
        return jsonify({"ok": True})
    except Exception as e:
        app.logger.error(f"디버그 로그 저장 실패: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/debug/view", methods=["GET"])
def view_debug_log():
    """Show the collected Android app debug log."""
    log_file = Path(os.environ.get("DEBUG_APP_LOG_PATH", "debug_app.log"))
    if not log_file.exists():
        return Response("공개된 로그가 아직 없습니다.", mimetype="text/plain; charset=utf-8")
    return send_file(log_file, mimetype="text/plain; charset=utf-8")

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
    trips_res = supabase.from_("vehicle_trips").select("*") \
        .in_("status", ["driving", "paused", "completed"]) \
        .or_(f"started_at.gte.{twenty_four_hours_ago},completed_at.gte.{twenty_four_hours_ago},updated_at.gte.{twenty_four_hours_ago}") \
        .order("started_at", desc=True).execute()
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
    latest_by_vehicle = {}
    status_rank = {"driving": 0, "paused": 1, "completed": 2}
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
        vehicle_key = (t.get("vehicle_number") or t.get("vehicle_id") or t.get("id") or "").replace(" ", "").upper()
        last_time = (
            (t.get("lastLocation") or {}).get("recorded_at")
            or (t.get("lastLocation") or {}).get("timestamp")
            or t.get("updated_at")
            or t.get("completed_at")
            or t.get("started_at")
            or ""
        )
        prev = latest_by_vehicle.get(vehicle_key) if vehicle_key else None
        prev_rank = status_rank.get((prev or {}).get("status"), 9)
        curr_rank = status_rank.get(t.get("status"), 9)
        if (
            not vehicle_key
            or not prev
            or curr_rank < prev_rank
            or (curr_rank == prev_rank and last_time > prev.get("_sort_time", ""))
        ):
            t["_sort_time"] = last_time
            latest_by_vehicle[vehicle_key] = t

    merged = sorted(latest_by_vehicle.values(), key=lambda x: x.get("_sort_time", ""), reverse=True)
    merged = sorted(merged, key=lambda x: status_rank.get(x.get("status"), 9))
    for t in merged:
        t.pop("_sort_time", None)
    return jsonify({"data": merged, "trips": merged})

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
SHIPPING_ARCHIVE_RETENTION_DAYS = 365
SHIPPING_LOOKUP_RETENTION_DAYS = 180
shipping_cache = {}
shipping_sync_lock = threading.Lock()
shipping_container_auto_lookup_lock = threading.Lock()
shipping_container_lookup_jobs = {}
shipping_container_lookup_jobs_lock = threading.Lock()
shipping_db_available = True
shipping_history_cleanup_last_date = None
shipping_container_auto_lookup_last_date = None

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

def _shipping_month_keys(months):
    if isinstance(months, (list, tuple, set)):
        raw_months = months
    else:
        raw_months = str(months or "").split(",")
    seen = set()
    keys = []
    for month in raw_months:
        m = re.fullmatch(r"(20\d{2})-(0[1-9]|1[0-2])", str(month or "").strip())
        if not m:
            continue
        key = f"{m.group(1)}-{m.group(2)}"
        if key in seen:
            continue
        seen.add(key)
        keys.append(key)
    return keys

def _shipping_next_month_key(month_key):
    year, month = [int(part) for part in month_key.split("-")]
    if month == 12:
        return f"{year + 1}-01"
    return f"{year}-{month + 1:02d}"

def _shipping_month_ranges(months):
    ranges = [
        {"key": key, "start": f"{key}-01", "end": f"{_shipping_next_month_key(key)}-01", "keys": [key]}
        for key in sorted(_shipping_month_keys(months))
    ]
    merged = []
    for item in ranges:
        if merged and merged[-1]["end"] == item["start"]:
            merged[-1]["end"] = item["end"]
            merged[-1]["keys"].extend(item["keys"])
        else:
            merged.append(item)
    return merged

def _shipping_work_date_index(headers):
    for i, header in enumerate(headers or []):
        text = re.sub(r"\s+", "", str(header or ""))
        if text in ("작업일", "작업일자"):
            return i
    for i, header in enumerate(headers or []):
        text = re.sub(r"\s+", "", str(header or "")).lower()
        if "작업" in text and ("일" in text or "일자" in text):
            return i
    for label in ("반입일", "반입일자", "픽업일", "픽업일자"):
        for i, header in enumerate(headers or []):
            if re.sub(r"\s+", "", str(header or "")) == label:
                return i
    return -1

def _shipping_resolve_date_col(headers, date_col):
    requested = str(date_col or "").strip()
    if requested and requested in (headers or []):
        return requested
    idx = _shipping_work_date_index(headers)
    return headers[idx] if idx >= 0 else ""

def _shipping_apply_month_filter(q, headers, date_col, months):
    resolved_col = _shipping_resolve_date_col(headers, date_col)
    ranges = _shipping_month_ranges(months)
    if not resolved_col or not ranges:
        return q, "", []

    col_expr = f"row_data->>{resolved_col}"
    if len(ranges) == 1:
        item = ranges[0]
        return q.gte(col_expr, item["start"]).lt(col_expr, item["end"]), resolved_col, item["keys"]

    filters = ",".join(
        f"and({col_expr}.gte.{item['start']},{col_expr}.lt.{item['end']})"
        for item in ranges
    )
    keys = [key for item in ranges for key in item["keys"]]
    return q.or_(filters), resolved_col, keys

def _shipping_rows_query(normalized_path, headers, search_terms, date_col, months, count=None):
    if count:
        q = supabase.from_("branch_shipping_rows").select("row_values,row_index", count=count)
    else:
        q = supabase.from_("branch_shipping_rows").select("row_values,row_index")
    q = q.eq("branch_id", "asan").eq("file_path", normalized_path)
    if len(search_terms) == 1:
        q = q.ilike("search_text", f"%{_shipping_search_filter_value(search_terms[0])}%")
    elif search_terms:
        filters = ",".join(f"search_text.ilike.%{_shipping_search_filter_value(term)}%" for term in search_terms)
        q = q.or_(filters)
    return _shipping_apply_month_filter(q, headers, date_col, months)

def _shipping_fetch_rows_in_chunks(query_factory, start, end, chunk_size=1000):
    rows = []
    total = None
    cursor = max(0, int(start or 0))
    final_end = max(cursor, int(end or cursor))

    while cursor <= final_end:
        chunk_end = min(final_end, cursor + chunk_size - 1)
        q, _, _ = query_factory(count="exact" if total is None else None)
        rows_res = q.order("row_index", desc=False).range(cursor, chunk_end).execute()
        chunk_rows = rows_res.data or []
        rows.extend(chunk_rows)

        if total is None and rows_res.count is not None:
            total = rows_res.count
            final_end = min(final_end, max(0, total - 1))
        if not chunk_rows or (total is None and len(chunk_rows) < (chunk_end - cursor + 1)):
            break
        cursor = chunk_end + 1

    return rows, total

def _shipping_normalize_container_no(value):
    return re.sub(r"\s+", "", str(value or "")).upper()

def _shipping_is_container_no_shape(value):
    return bool(re.fullmatch(r"[A-Z]{4}\d{7}", _shipping_normalize_container_no(value)))

def _shipping_is_actual_history_row(row):
    if not isinstance(row, (list, tuple)) or len(row) < 4:
        return False
    if not re.fullmatch(r"\d+", str(row[1] or "").strip()):
        return False
    text = "|".join(str(cell or "") for cell in row[2:14])
    return any(token in text for token in ("수입", "수출", "반입", "반출", "양하", "적하"))

def _shipping_lookup_main_status(record):
    main_row = record.get("main_row") if isinstance(record, dict) else None
    if isinstance(main_row, list) and len(main_row) > 3:
        return str(main_row[3] or "").strip()
    return str((record or {}).get("main_status") or "").strip()

def _shipping_latest_lookup_statuses(normalized_path, containers):
    statuses = {}
    if not supabase or not containers:
        return statuses
    ordered = [_shipping_normalize_container_no(cn) for cn in containers if _shipping_is_container_no_shape(cn)]
    for i in range(0, len(ordered), 500):
        chunk = ordered[i:i + 500]
        try:
            res = supabase.from_("branch_shipping_container_lookups") \
                .select("container_no,main_status,main_row,looked_up_at") \
                .eq("branch_id", "asan") \
                .eq("file_path", normalized_path) \
                .in_("container_no", chunk) \
                .order("looked_up_at", desc=True) \
                .execute()
        except Exception as exc:
            app.logger.warning(f"[컨테이너자동조회] 기존 이력 조회 실패: {exc}")
            return statuses
        for item in res.data or []:
            cn = _shipping_normalize_container_no(item.get("container_no"))
            if cn and cn not in statuses:
                statuses[cn] = _shipping_lookup_main_status(item)
    return statuses

def _shipping_container_auto_lookup_enabled():
    try:
        settings = get_asan_dispatch_settings(force=True) or {}
        if "shipping_container_auto_lookup_enabled" not in settings:
            app.logger.warning("[컨테이너자동조회] DB 설정 컬럼 미적용 상태라 자동조회 실행을 보류")
            return False
        return settings.get("shipping_container_auto_lookup_enabled", True) is not False
    except Exception as exc:
        app.logger.warning(f"[컨테이너자동조회] 설정 조회 실패로 자동조회 실행 보류: {exc}")
        return False

def set_asan_shipping_container_auto_lookup_enabled(enabled, reason=""):
    if not supabase:
        return False
    try:
        settings = get_asan_dispatch_settings(force=True) or {}
        payload = {
            "shipping_container_auto_lookup_enabled": bool(enabled),
            "updated_at": datetime.now(KST).isoformat(),
        }
        supabase.from_("branch_dispatch_settings").update(payload).eq("branch_id", "asan").execute()
        dispatch_settings_cache["data"] = {**settings, **payload}
        dispatch_settings_cache["loaded_at"] = time.time()
        suffix = f" ({reason})" if reason else ""
        app.logger.warning(f"[컨테이너자동조회] 사용 여부 {bool(enabled)} 저장{suffix}")
        return True
    except Exception as exc:
        app.logger.warning(f"[컨테이너자동조회] 사용 여부 저장 실패: {exc}")
        return False

def _shipping_auto_lookup_targets(rel_path=None, max_targets=ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_MAX_TARGETS):
    normalized_path = (rel_path or DEFAULT_ASAN_SHIPPING_PATH).replace("\\", "/").strip()
    if not normalized_path.startswith("/"):
        normalized_path = f"/{normalized_path}"

    meta_res = supabase.from_("branch_shipping_files").select("*").eq("branch_id", "asan").eq("file_path", normalized_path).execute()
    meta = meta_res.data[0] if meta_res.data else None
    if not meta:
        return normalized_path, [], 0, 0

    headers = meta.get("headers") or []
    container_idx = -1
    for i, header in enumerate(headers):
        text = str(header or "").upper()
        if "CONTAINER" in text or "컨테이너" in text:
            container_idx = i
            break

    rows = []
    cursor = 0
    chunk_size = 1000
    while len(rows) < max_targets:
        end = min(cursor + chunk_size - 1, max_targets - 1)
        res = supabase.from_("branch_shipping_rows") \
            .select("row_values,row_index,container_no") \
            .eq("branch_id", "asan") \
            .eq("file_path", normalized_path) \
            .order("row_index", desc=False) \
            .range(cursor, end) \
            .execute()
        chunk = res.data or []
        rows.extend(chunk)
        if len(chunk) < (end - cursor + 1):
            break
        cursor = end + 1

    seen = set()
    containers = []
    for item in rows:
        row = item.get("row_values") or []
        cn = _shipping_normalize_container_no(item.get("container_no") or (row[container_idx] if 0 <= container_idx < len(row) else ""))
        if not _shipping_is_container_no_shape(cn) or cn in seen:
            continue
        seen.add(cn)
        containers.append(cn)

    statuses = _shipping_latest_lookup_statuses(normalized_path, containers)
    targets = [cn for cn in containers if statuses.get(cn) != "적하"]
    skipped = len(containers) - len(targets)
    return normalized_path, targets, len(containers), skipped

def _shipping_group_actual_lookup_rows(rows):
    grouped = {}
    for row in rows or []:
        if not _shipping_is_actual_history_row(row):
            continue
        cn = _shipping_normalize_container_no(row[0] if row else "")
        if not cn:
            continue
        grouped.setdefault(cn, []).append(list(row))
    for cn in list(grouped):
        grouped[cn].sort(key=lambda item: int(item[1]) if str(item[1]).isdigit() else 999)
    return grouped

def _save_asan_shipping_container_lookup_rows(normalized_path, rows, lookup_source="asan_shipping_auto"):
    grouped = _shipping_group_actual_lookup_rows(rows)
    if not grouped:
        return 0

    containers = list(grouped.keys())
    supabase.from_("branch_shipping_container_lookups") \
        .delete() \
        .eq("branch_id", "asan") \
        .eq("file_path", normalized_path) \
        .in_("container_no", containers) \
        .execute()

    looked_up_at = datetime.now(KST).isoformat()
    run_id = str(uuid.uuid4())
    payload = []
    for cn, container_rows in grouped.items():
        main_row = next((row for row in container_rows if str(row[1]).strip() == "1"), container_rows[0])
        payload.append({
            "run_id": run_id,
            "branch_id": "asan",
            "file_path": normalized_path,
            "container_no": cn,
            "result_rows": container_rows,
            "main_row": main_row,
            "main_status": str(main_row[2] if len(main_row) > 2 else ""),
            "terminal": str(main_row[4] if len(main_row) > 4 else ""),
            "move_time": str(main_row[5] if len(main_row) > 5 else ""),
            "vehicle_no": str(main_row[13] if len(main_row) > 13 else ""),
            "lookup_source": lookup_source,
            "looked_up_at": looked_up_at,
            "updated_at": looked_up_at,
        })
    supabase.from_("branch_shipping_container_lookups").insert(payload).execute()
    return len(payload)

def _shipping_lookup_rows_failed(rows):
    if not rows:
        return True
    first = rows[0] if isinstance(rows[0], (list, tuple)) else []
    return str(first[1] if len(first) > 1 else "").strip().upper() == "ERROR"

def _shipping_normalize_path(rel_path=None):
    normalized_path = (rel_path or DEFAULT_ASAN_SHIPPING_PATH).replace("\\", "/").strip()
    if not normalized_path.startswith("/"):
        normalized_path = f"/{normalized_path}"
    return normalized_path

def _shipping_lookup_failure_reason(rows):
    if not rows:
        return "결과 없음"
    first = rows[0] if isinstance(rows[0], (list, tuple)) else []
    return str(first[2] if len(first) > 2 else "조회 실패").strip() or "조회 실패"

def _shipping_lookup_job_snapshot(job):
    error_reasons = job.get("error_reasons") or {}
    reasons = [
        {"reason": reason, "count": count}
        for reason, count in sorted(error_reasons.items(), key=lambda item: item[1], reverse=True)
    ]
    total = int(job.get("total") or 0)
    completed = len(job.get("completed_set") or set())
    failed = len((job.get("failed_set") or set()) - (job.get("completed_set") or set()))
    return {
        "id": job.get("id"),
        "path": job.get("path"),
        "state": job.get("state"),
        "status": job.get("status"),
        "total": total,
        "completed": completed,
        "failed": failed,
        "remaining": max(0, total - completed - failed),
        "saved": int(job.get("saved") or 0),
        "startedAt": job.get("started_at"),
        "updatedAt": job.get("updated_at"),
        "errorSummary": {
            "total": sum(error_reasons.values()),
            "reasons": reasons,
            "message": ", ".join(f"{item['reason']} {item['count']}건" for item in reasons[:2]),
        } if reasons else None,
    }

def _update_shipping_lookup_job(job_id, **patch):
    with shipping_container_lookup_jobs_lock:
        job = shipping_container_lookup_jobs.get(job_id)
        if not job:
            return None
        job.update(patch)
        job["updated_at"] = datetime.now(KST).isoformat()
        return _shipping_lookup_job_snapshot(job)

def _apply_shipping_lookup_job_rows(job_id, normalized_path, rows):
    cn = _shipping_normalize_container_no(rows[0][0] if rows and rows[0] else "")
    failed = _shipping_lookup_rows_failed(rows)
    saved = 0
    reason = ""
    if failed:
        reason = _shipping_lookup_failure_reason(rows)
    else:
        try:
            saved = _save_asan_shipping_container_lookup_rows(
                normalized_path,
                rows,
                lookup_source="asan_shipping_manual_background",
            )
        except Exception as exc:
            failed = True
            reason = f"저장 실패: {exc}"

    with shipping_container_lookup_jobs_lock:
        job = shipping_container_lookup_jobs.get(job_id)
        if not job:
            return None
        if cn:
            if failed:
                if cn not in job["completed_set"]:
                    job["failed_set"].add(cn)
                job["error_reasons"][reason] = job["error_reasons"].get(reason, 0) + 1
            else:
                job["completed_set"].add(cn)
                job["failed_set"].discard(cn)
                job["saved"] = int(job.get("saved") or 0) + saved
        snapshot = _shipping_lookup_job_snapshot(job)
        job["status"] = (
            f"백그라운드 조회 중: 완료 {snapshot['completed']}건 / 실패 {snapshot['failed']}건 / "
            f"대상 {snapshot['total']}건"
        )
        job["updated_at"] = datetime.now(KST).isoformat()
        return snapshot

def _run_shipping_container_lookup_job(job_id):
    response = None
    with shipping_container_lookup_jobs_lock:
        job = shipping_container_lookup_jobs.get(job_id)
        if not job:
            return
        normalized_path = job["path"]
        containers = list(job["containers"])

    try:
        _update_shipping_lookup_job(job_id, state="running", status=f"백그라운드 컨테이너 조회 시작: {len(containers)}건")
        try:
            cap = requests.get(f"{ELS_BOT_API_URL}/api/els/capabilities", timeout=5).json()
            if int(cap.get("total_drivers") or 0) <= 0:
                requests.post(f"{ELS_BOT_API_URL}/api/els/warmup", json={"wait": False}, timeout=10)
        except Exception as exc:
            app.logger.warning(f"[컨테이너백그라운드조회] 봇 준비 확인 실패: {exc}")

        response = requests.post(
            f"{ELS_BOT_API_URL}/api/els/run",
            json={
                "containers": containers,
                "reserveSingle": False,
                "stableBatchMode": len(containers) >= 100,
                "maxBatchWorkers": 1 if len(containers) >= 100 else None,
                "acquireTimeoutSec": 300 if len(containers) >= 100 else 45,
                "submitDelaySec": 2 if len(containers) >= 100 else 0,
            },
            stream=True,
            timeout=(10, max(3600, len(containers) * 30)),
        )
        response.raise_for_status()
        response.encoding = "utf-8"
        for line in response.iter_lines(decode_unicode=True):
            if not line:
                continue
            with shipping_container_lookup_jobs_lock:
                stop_requested = bool((shipping_container_lookup_jobs.get(job_id) or {}).get("stop_requested"))
            if stop_requested:
                _update_shipping_lookup_job(job_id, state="cancelled", status="사용자 요청으로 백그라운드 조회 중단")
                try:
                    requests.post(f"{ELS_BOT_API_URL}/api/els/stop-daemon", timeout=5)
                except Exception:
                    pass
                return
            if line.startswith("LOG:"):
                _update_shipping_lookup_job(job_id, status=line[4:].strip())
                continue
            if line.startswith("RESULT_PARTIAL:"):
                payload = json.loads(line[15:])
                rows = payload.get("result") or []
                _apply_shipping_lookup_job_rows(job_id, normalized_path, rows)
                continue
            if line.startswith("RESULT:"):
                payload = json.loads(line[7:])
                if payload.get("ok") is False:
                    raise RuntimeError(payload.get("error") or "컨테이너 조회 실패")

        snapshot = _update_shipping_lookup_job(job_id)
        final_state = "failed" if snapshot and snapshot["failed"] > 0 else "completed"
        final_status = (
            f"백그라운드 조회 종료: 완료 {snapshot['completed']}건, 실패 {snapshot['failed']}건"
            if snapshot else "백그라운드 조회 종료"
        )
        _update_shipping_lookup_job(job_id, state=final_state, status=final_status)
    except Exception as exc:
        app.logger.error(f"[컨테이너백그라운드조회] 실행 오류: {exc}", exc_info=True)
        _update_shipping_lookup_job(job_id, state="failed", status=f"백그라운드 조회 오류: {exc}")
    finally:
        if response is not None:
            try:
                response.close()
            except Exception:
                pass

@app.route("/api/branches/asan/shipping/container-lookup/jobs", methods=["GET", "POST", "DELETE"])
def asan_shipping_container_lookup_jobs():
    if not supabase or not shipping_db_available:
        return jsonify({"ok": False, "error": "Supabase/선적관리 DB 미사용 상태입니다."}), 503

    if request.method == "GET":
        job_id = request.args.get("id")
        with shipping_container_lookup_jobs_lock:
            if job_id:
                job = shipping_container_lookup_jobs.get(job_id)
            else:
                jobs = list(shipping_container_lookup_jobs.values())
                job = next((item for item in jobs if item.get("state") in ("running", "stopping")), None)
                if not job and jobs:
                    job = max(jobs, key=lambda item: item.get("updated_at") or item.get("started_at") or "")
            if not job:
                return jsonify({"ok": False, "error": "작업을 찾을 수 없습니다."}), 404
            return jsonify({"ok": True, "job": _shipping_lookup_job_snapshot(job)})

    data = request.get_json(silent=True) or {}
    if request.method == "DELETE":
        job_id = data.get("id") or request.args.get("id")
        with shipping_container_lookup_jobs_lock:
            job = shipping_container_lookup_jobs.get(job_id)
            if not job:
                return jsonify({"ok": False, "error": "작업을 찾을 수 없습니다."}), 404
            job["stop_requested"] = True
            job["state"] = "stopping"
            job["status"] = "사용자 중지 요청 처리 중"
            job["updated_at"] = datetime.now(KST).isoformat()
            snapshot = _shipping_lookup_job_snapshot(job)
        try:
            requests.post(f"{ELS_BOT_API_URL}/api/els/stop-daemon", timeout=5)
        except Exception:
            pass
        return jsonify({"ok": True, "job": snapshot})

    normalized_path = _shipping_normalize_path(data.get("path") or data.get("file_path"))
    seen = set()
    containers = []
    for value in data.get("containers") or []:
        cn = _shipping_normalize_container_no(value)
        if not _shipping_is_container_no_shape(cn) or cn in seen:
            continue
        seen.add(cn)
        containers.append(cn)
    if not containers:
        return jsonify({"ok": False, "error": "조회할 컨테이너가 없습니다."}), 400

    with shipping_container_lookup_jobs_lock:
        for job in shipping_container_lookup_jobs.values():
            if job.get("state") in ("running", "stopping"):
                return jsonify({"ok": True, "already_running": True, "job": _shipping_lookup_job_snapshot(job)}), 202
        job_id = str(uuid.uuid4())
        now_iso = datetime.now(KST).isoformat()
        shipping_container_lookup_jobs[job_id] = {
            "id": job_id,
            "path": normalized_path,
            "containers": containers,
            "total": len(containers),
            "state": "running",
            "status": f"백그라운드 컨테이너 조회 준비: {len(containers)}건",
            "saved": 0,
            "completed_set": set(),
            "failed_set": set(),
            "error_reasons": {},
            "stop_requested": False,
            "started_at": now_iso,
            "updated_at": now_iso,
        }
        snapshot = _shipping_lookup_job_snapshot(shipping_container_lookup_jobs[job_id])

    threading.Thread(target=_run_shipping_container_lookup_job, args=(job_id,), daemon=True).start()
    return jsonify({"ok": True, "job": snapshot}), 202

def run_asan_shipping_container_auto_lookup():
    if not shipping_container_auto_lookup_lock.acquire(blocking=False):
        app.logger.info("[컨테이너자동조회] 이미 실행 중이라 건너뜀")
        return
    try:
        if not _shipping_container_auto_lookup_enabled():
            app.logger.info("[컨테이너자동조회] 설정 OFF 상태라 실행하지 않음")
            return
        if not supabase or not shipping_db_available:
            app.logger.warning("[컨테이너자동조회] Supabase/선적관리 DB 미사용 상태라 실행 불가")
            return

        normalized_path, containers, total_containers, skipped_loaded = _shipping_auto_lookup_targets()
        app.logger.info(
            f"[컨테이너자동조회] 시작: 전체 컨테이너 {total_containers}건, 적하 제외 {skipped_loaded}건, 조회대상 {len(containers)}건"
        )
        if not containers:
            return

        try:
            cap = requests.get(f"{ELS_BOT_API_URL}/api/els/capabilities", timeout=5).json()
            if cap.get("progress", {}).get("is_running"):
                app.logger.warning("[컨테이너자동조회] 기존 컨테이너 조회가 진행 중이라 오늘 자동조회는 건너뜀")
                return
        except Exception as exc:
            app.logger.warning(f"[컨테이너자동조회] 봇 상태 확인 실패: {exc}")

        failed_count = 0
        completed_count = 0
        saved_count = 0
        response = None
        try:
            response = requests.post(
                f"{ELS_BOT_API_URL}/api/els/run",
                json={
                    "containers": containers,
                    "reserveSingle": False,
                    "stableBatchMode": True,
                    "maxBatchWorkers": 1,
                    "acquireTimeoutSec": ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_ACQUIRE_TIMEOUT_SECONDS,
                    "submitDelaySec": ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_SUBMIT_DELAY_SECONDS,
                },
                stream=True,
                timeout=(10, ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_TIMEOUT_SECONDS),
            )
            response.raise_for_status()
            response.encoding = "utf-8"
            for line in response.iter_lines(decode_unicode=True):
                if not line:
                    continue
                if line.startswith("LOG:"):
                    app.logger.info(f"[컨테이너자동조회] {line[4:].strip()}")
                    continue
                if line.startswith("RESULT_PARTIAL:"):
                    payload = json.loads(line[15:])
                    rows = payload.get("result") or []
                    if _shipping_lookup_rows_failed(rows):
                        failed_count += 1
                    else:
                        completed_count += 1
                        saved_count += _save_asan_shipping_container_lookup_rows(normalized_path, rows)
                    if failed_count >= ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_FAIL_LIMIT:
                        reason = f"조회 실패 {failed_count}회 도달"
                        set_asan_shipping_container_auto_lookup_enabled(False, reason=reason)
                        app.logger.error(f"[컨테이너자동조회] {reason}로 자동조회 중지")
                        try:
                            if response is not None:
                                response.close()
                        finally:
                            try:
                                requests.post(f"{ELS_BOT_API_URL}/api/els/stop-daemon", timeout=5)
                            except Exception:
                                pass
                        return
                elif line.startswith("RESULT:"):
                    payload = json.loads(line[7:])
                    if payload.get("ok") is False:
                        raise RuntimeError(payload.get("error") or "컨테이너 자동조회 실패")
            app.logger.info(
                f"[컨테이너자동조회] 완료: 조회완료 {completed_count}건, 조회실패 {failed_count}건, 저장 {saved_count}건"
            )
        except Exception as exc:
            set_asan_shipping_container_auto_lookup_enabled(False, reason=f"실행 오류: {exc}")
            app.logger.error(f"[컨테이너자동조회] 실행 오류로 중지: {exc}", exc_info=True)
        finally:
            if response is not None:
                try:
                    response.close()
                except Exception:
                    pass
    finally:
        shipping_container_auto_lookup_lock.release()

def maybe_run_asan_shipping_container_auto_lookup(now=None):
    global shipping_container_auto_lookup_last_date
    now = now or datetime.now(KST)
    today_key = now.date().isoformat()
    minute_end = min(60, ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_MINUTE + 2)
    in_window = (
        now.hour == ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_HOUR
        and ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_MINUTE <= now.minute < minute_end
    )
    if not in_window or shipping_container_auto_lookup_last_date == today_key:
        return
    shipping_container_auto_lookup_last_date = today_key
    threading.Thread(target=run_asan_shipping_container_auto_lookup, daemon=True).start()

def _shipping_sort_value(value):
    s = str(value if value is not None else "").strip()
    if not s:
        return None

    compact = s.replace(",", "")
    if re.fullmatch(r"-?\d+(?:\.\d+)?", compact):
        return (0, float(compact))

    date_match = re.fullmatch(r"(\d{4})[-/.]?(\d{2})[-/.]?(\d{2})(?:\.0)?", s)
    if date_match:
        return (1, tuple(int(part) for part in date_match.groups()))

    time_match = re.fullmatch(r"(\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?", s)
    if time_match:
        return (2, int(time_match.group(1)), int(time_match.group(2)))

    return (3, s.casefold())

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
            _shipping_check_supabase_result(
                supabase.from_("branch_shipping_row_archive").insert(archive_payload[i:i + 500]).execute(),
                "선적관리 삭제 행 아카이브 저장 실패"
            )
        return len(archive_payload)
    except Exception as e:
        app.logger.warning(f"[선적관리DB] 삭제 이력 archive 건너뜀: {e}")
        return 0

def _shipping_check_supabase_result(result, action):
    error = getattr(result, "error", None)
    if error:
        raise RuntimeError(f"{action}: {error}")
    return result

def _shipping_count_synced_rows(normalized_path):
    res = supabase.from_("branch_shipping_rows") \
        .select("id", count="exact") \
        .eq("branch_id", "asan") \
        .eq("file_path", normalized_path) \
        .limit(1) \
        .execute()
    _shipping_check_supabase_result(res, "선적관리 행 count 확인 실패")
    if getattr(res, "count", None) is not None:
        return int(res.count or 0)
    return len(res.data or [])

def _shipping_db_data_is_stale_empty(db_data):
    if not db_data:
        return False
    try:
        meta_count = int(db_data.get("meta_row_count") or 0)
        total = int(db_data.get("total") or 0)
    except (TypeError, ValueError):
        return False
    return meta_count > 0 and total <= 0 and not (db_data.get("data") or [])

def cleanup_asan_shipping_history_retention(
    now=None,
    archive_retention_days=SHIPPING_ARCHIVE_RETENTION_DAYS,
    lookup_retention_days=SHIPPING_LOOKUP_RETENTION_DAYS
):
    if not supabase or not shipping_db_available:
        return None

    now = now or datetime.now(KST)
    archive_cutoff = (now - timedelta(days=archive_retention_days)).isoformat()
    lookup_cutoff = (now - timedelta(days=lookup_retention_days)).isoformat()
    try:
        archive_res = supabase.from_("branch_shipping_row_archive").delete().lt("archived_at", archive_cutoff).execute()
        lookup_res = supabase.from_("branch_shipping_container_lookups").delete().lt("looked_up_at", lookup_cutoff).execute()
        archive_deleted = len(archive_res.data or [])
        lookup_deleted = len(lookup_res.data or [])
        app.logger.info(
            f"[선적관리DB] 이력 보존기간 정리 완료: archive_cutoff={archive_cutoff}, lookup_cutoff={lookup_cutoff}, "
            f"archive={archive_deleted}, lookup={lookup_deleted}"
        )
        return {
            "archive_cutoff": archive_cutoff,
            "lookup_cutoff": lookup_cutoff,
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

    file_stat = file_path.stat()
    mtime_ts = file_stat.st_mtime
    file_modified_at = datetime.fromtimestamp(mtime_ts, tz=KST).isoformat()
    file_signature = (mtime_ts, file_stat.st_size)
    parsed = None
    rows = None
    payload = None
    lock_acquired = shipping_sync_lock.acquire(blocking=False)
    if not lock_acquired:
        app.logger.info(f"[선적관리DB] 동기화 이미 진행 중: {normalized_path}")
        try:
            meta_res = supabase.from_("branch_shipping_files").select("*").eq("branch_id", "asan").eq("file_path", normalized_path).execute()
            if meta_res.data:
                current_meta = meta_res.data[0]
                current_meta["sync_running"] = True
                return current_meta
        except Exception:
            pass
        return {"file_modified_at": file_modified_at, "sync_running": True}

    try:
        meta_res = supabase.from_("branch_shipping_files").select("file_modified_at").eq("branch_id", "asan").eq("file_path", normalized_path).execute()
        current_meta = meta_res.data[0] if meta_res.data else None
        if not force and current_meta and current_meta.get("file_modified_at"):
            try:
                db_mtime = datetime.fromisoformat(current_meta["file_modified_at"].replace("Z", "+00:00")).timestamp()
                if abs(db_mtime - mtime_ts) < 1:
                    shipping_sync_gate.mark_synced(normalized_path, file_signature)
                    return current_meta
            except Exception:
                pass

        decision = shipping_sync_gate.check(normalized_path, file_signature, force=force)
        if not decision.ready:
            if decision.reason in ("pending", "settling"):
                app.logger.info(f"[선적관리DB] 파일 저장 안정화 대기 중: {normalized_path} ({decision.reason})")
            return current_meta

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
        _shipping_check_supabase_result(
            supabase.from_("branch_shipping_rows").delete().eq("branch_id", "asan").eq("file_path", normalized_path).execute(),
            "선적관리 기존 행 삭제 실패"
        )
        for i in range(0, len(payload), 500):
            _shipping_check_supabase_result(
                supabase.from_("branch_shipping_rows").insert(payload[i:i + 500]).execute(),
                "선적관리 행 저장 실패"
            )

        synced_count = _shipping_count_synced_rows(normalized_path)
        if synced_count != len(payload):
            raise RuntimeError(f"선적관리 행 저장 검증 실패: 예상 {len(payload)}행, 실제 {synced_count}행")

        _shipping_check_supabase_result(supabase.from_("branch_shipping_files").upsert({
            "branch_id": "asan",
            "file_path": normalized_path,
            "headers": headers,
            "row_count": len(rows),
            "file_modified_at": file_modified_at,
            "synced_at": datetime.now(KST).isoformat()
        }, on_conflict="branch_id,file_path").execute(), "선적관리 파일 메타 저장 실패")

        shipping_cache.pop(normalized_path, None)
        shipping_sync_gate.mark_synced(normalized_path, file_signature)
        app.logger.info(f"[선적관리DB] 동기화 완료: {normalized_path} ({len(rows)}행, 삭제 archive {archived_count}행)")
        return {"file_modified_at": file_modified_at, "archived_count": archived_count, "row_count": len(rows), "synced_count": synced_count}
    except Exception as e:
        if "branch_shipping_" in str(e) or "relation" in str(e).lower():
            shipping_db_available = False
            app.logger.warning("[선적관리DB] Supabase 테이블이 없어 DB 동기화를 비활성화합니다. migration 적용 후 컨테이너를 재시작하세요.")
        else:
            app.logger.error(f"[선적관리DB] 동기화 실패: {e}", exc_info=True)
        return None
    finally:
        parsed = None
        rows = None
        payload = None
        if lock_acquired:
            shipping_sync_lock.release()
        gc.collect()

def query_asan_shipping_db(rel_path, page=1, page_size=5000, search="", sort_key="", sort_dir="asc", date_col="", months=""):
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

    headers = meta.get("headers") or []
    sort_key = str(sort_key or "").strip()
    sort_desc = str(sort_dir or "asc").lower() == "desc"
    sort_idx = headers.index(sort_key) if sort_key in headers else -1

    search_terms = _shipping_search_terms(search)
    def query_factory(count=None):
        return _shipping_rows_query(normalized_path, headers, search_terms, date_col, months, count=count)

    _, resolved_date_col, filtered_months = query_factory()

    if sort_idx >= 0:
        fetched_rows, total_count = _shipping_fetch_rows_in_chunks(query_factory, 0, 9999)
        sortable = []
        blanks = []
        for item in fetched_rows:
            row = item.get("row_values") or []
            sort_value = _shipping_sort_value(row[sort_idx] if sort_idx < len(row) else "")
            if sort_value is None:
                blanks.append(item)
            else:
                sortable.append((sort_value, item))
        sortable.sort(key=lambda pair: pair[0], reverse=sort_desc)
        ordered_rows = ([item for _, item in sortable] + blanks) if sort_desc else (blanks + [item for _, item in sortable])
        page_rows = ordered_rows[start:end + 1]
    else:
        page_rows, total_count = _shipping_fetch_rows_in_chunks(query_factory, start, end)

    return {
        "headers": headers,
        "data": [r.get("row_values") for r in page_rows],
        "file_modified_at": meta.get("file_modified_at"),
        "synced_at": meta.get("synced_at"),
        "total": total_count if total_count is not None else meta.get("row_count", 0),
        "meta_row_count": meta.get("row_count", 0),
        "page": page,
        "page_size": page_size,
        "sort_key": sort_key if sort_idx >= 0 else "",
        "sort_dir": "desc" if sort_desc else "asc",
        "date_col": resolved_date_col,
        "months": filtered_months,
        "source": "supabase"
    }

def asan_shipping_sync_scheduler():
    app.logger.info(
        f"[스케줄러] 아산 선적관리 DB 동기화 스케줄러 시작 "
        f"(poll={ASAN_SHIPPING_SYNC_POLL_SECONDS}s, quiet={ASAN_SHIPPING_SYNC_QUIET_SECONDS}s)"
    )
    while True:
        try:
            now = datetime.now(KST)
            maybe_cleanup_asan_shipping_history(now)
            maybe_run_asan_shipping_container_auto_lookup(now)
            if 6 <= now.hour <= 23:
                sync_asan_shipping_python()
            time.sleep(ASAN_SHIPPING_SYNC_POLL_SECONDS)
        except Exception as e:
            app.logger.error(f"[선적관리DB 스케줄러] 에러: {e}")
            time.sleep(ASAN_SHIPPING_SYNC_POLL_SECONDS)

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
            sort_key = (body.get("sort_key") or request.args.get("sort_key") or "").strip()
            sort_dir = body.get("sort_dir") or request.args.get("sort_dir") or "asc"
            date_col = (body.get("date_col") or request.args.get("date_col") or "").strip()
            months = body.get("months") or request.args.get("months") or ""
            db_data = query_asan_shipping_db(
                rel_path,
                page=page,
                page_size=page_size,
                search=search,
                sort_key=sort_key,
                sort_dir=sort_dir,
                date_col=date_col,
                months=months
            )
            return jsonify({"ok": True, "data": db_data or sync_result})

        source = request.args.get("source", "auto")
        page = request.args.get("page", 1)
        page_size = request.args.get("page_size", 5000)
        search = (request.args.get("search") or "").strip()
        sort_key = (request.args.get("sort_key") or "").strip()
        sort_dir = request.args.get("sort_dir") or "asc"
        date_col = (request.args.get("date_col") or "").strip()
        months = request.args.get("months") or ""

        if source != "excel" and supabase and shipping_db_available:
            db_data = query_asan_shipping_db(
                rel_path,
                page=page,
                page_size=page_size,
                search=search,
                sort_key=sort_key,
                sort_dir=sort_dir,
                date_col=date_col,
                months=months
            )
            if db_data and not _shipping_db_data_is_stale_empty(db_data):
                return jsonify({"data": db_data})
            if db_data:
                app.logger.warning(
                    f"[선적관리DB] 메타 row_count={db_data.get('meta_row_count')}이나 실제 rows=0이라 엑셀 fallback 사용: {rel_path}"
                )

        file_path, normalized_path = resolve_asan_shipping_file(rel_path)
        if not file_path.exists():
            return jsonify({"error": "선적관리 엑셀 파일을 찾을 수 없습니다."}), 404

        mtime = file_path.stat().st_mtime
        cached = shipping_cache.get(normalized_path)
        if cached and cached["mtime"] == mtime and cached["data"]:
            return jsonify({"data": {**cached["data"], "source": "excel-cache"}})

        parsed = parse_asan_shipping_excel(file_path)
        try:
            page_num = max(1, int(page or 1))
            page_limit = max(1, min(10000, int(page_size or 5000)))
            start = (page_num - 1) * page_limit
            end = start + page_limit
            all_rows = parsed.get("data") or []
            res = {
                **parsed,
                "data": all_rows[start:end],
                "file_modified_at": datetime.fromtimestamp(mtime, tz=KST).isoformat(),
                "source": "excel-cache",
                "total": len(all_rows),
                "page": page_num,
                "page_size": page_limit,
            }
            shipping_cache.pop(normalized_path, None)
            return jsonify({"data": res})
        finally:
            parsed = None
            gc.collect()
        
    except Exception as e:
        app.logger.error(f"선적관리 파싱 오류: {e}")
        return jsonify({"error": str(e)}), 500

# 3-2. 아산 배차판 강제 동기화 (Manual Trigger)
@app.route("/api/branches/asan/sync", methods=["GET", "POST"])
def trigger_asan_sync():
    """웹 UI의 'NAS 동기화' 버튼 클릭 시 호출됨"""
    if request.method == "GET":
        return jsonify({"ok": True, "status": _get_asan_sync_status()})

    try:
        app.logger.info("🚀 [API] 아산 배차판 강제 동기화 요청 수신")
        now_dt = datetime.now(KST)
        if _asan_sync_cooldown_active(now_dt):
            status = _get_asan_sync_status()
            return jsonify({
                "ok": True,
                "running": bool(status.get("running")),
                "cooldown": True,
                "status": status,
                "message": "최근 1분 이내 동기화 요청이 있어 새 요청은 건너뜁니다. 새로고침으로 최신 DB를 확인해 주세요.",
            }), 202

        if asan_sync_lock.locked():
            status = _get_asan_sync_status()
            if status.get("quick_done"):
                _request_asan_sync_cancel("전/후/나머지 백그라운드 동기화를 중단하고 1순위 작업일 재동기화를 예약했습니다.")
                _set_asan_sync_status(
                    running=True,
                    started_at=now_dt.isoformat(),
                    finished_at=None,
                    ok=True,
                    message="기존 백그라운드 동기화 중단 후 1순위 작업일 재동기화를 시작합니다.",
                    results=[],
                    force=True,
                    last_requested_at=now_dt.isoformat(),
                    request_cooldown_until=(now_dt + timedelta(seconds=ASAN_DISPATCH_SYNC_REQUEST_COOLDOWN_SECONDS)).isoformat(),
                    quick_done=False,
                    quick_finished_at=None,
                    quick_completed_types=[],
                    cancel_requested=True,
                )
                threading.Thread(target=_restart_asan_dispatch_manual_after_current, daemon=True).start()
                return jsonify({
                    "ok": True,
                    "running": True,
                    "status": _get_asan_sync_status(),
                    "message": "백그라운드 동기화를 중단하고 1순위 작업일 재동기화를 시작합니다.",
                }), 202
            return jsonify({
                "ok": True,
                "running": True,
                "status": status,
                "message": "1순위 작업일 동기화가 진행 중입니다. 완료까지 기다려 주세요.",
            }), 202

        # force=True 옵션으로 캐시 무시하고 강제 실행하되, 백그라운드 쓰레드로 분리하여 Vercel Timeout(504) 방지
        _set_asan_sync_status(
            running=True,
            started_at=now_dt.isoformat(),
            finished_at=None,
            ok=True,
            message="아산 배차판 1순위 작업일 동기화 대기 중",
            results=[],
            force=True,
            last_requested_at=now_dt.isoformat(),
            request_cooldown_until=(now_dt + timedelta(seconds=ASAN_DISPATCH_SYNC_REQUEST_COOLDOWN_SECONDS)).isoformat(),
            quick_done=False,
            quick_finished_at=None,
            quick_completed_types=[],
            cancel_requested=False,
        )
        threading.Thread(target=sync_asan_dispatch_manual_python, daemon=True).start()
        return jsonify({
            "ok": True,
            "running": True,
            "status": _get_asan_sync_status(),
            "message": "동기화를 시작했습니다. 완료까지 기다려 주세요.",
        }), 202
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/branches/asan/transport-history/sync", methods=["GET", "POST"])
def trigger_asan_transport_history_sync():
    """웹 UI의 운송내역 'NAS 동기화' 버튼 클릭 시 호출됨"""
    if request.method == "GET":
        return jsonify({"ok": True, "status": _get_transport_history_sync_status()})

    try:
        now_dt = datetime.now(KST)
        if _transport_history_cooldown_active(now_dt):
            status = _get_transport_history_sync_status()
            return jsonify({
                "ok": True,
                "running": bool(status.get("running")),
                "cooldown": True,
                "status": status,
                "message": "최근 1분 이내 동기화 요청이 있어 새 요청은 건너뜁니다. 새로고침으로 최신 DB를 확인해 주세요.",
            }), 202

        if transport_history_sync_lock.locked():
            return jsonify({
                "ok": True,
                "running": True,
                "status": _get_transport_history_sync_status(),
                "message": "운송내역 동기화가 진행 중입니다. 완료까지 기다려 주세요.",
            }), 202

        _set_transport_history_sync_status(
            running=True,
            started_at=now_dt.isoformat(),
            finished_at=None,
            ok=True,
            message="운송내역 1순위 월 동기화 대기 중",
            results=[],
            force=True,
            last_requested_at=now_dt.isoformat(),
            request_cooldown_until=(now_dt + timedelta(seconds=ASAN_TRANSPORT_HISTORY_SYNC_REQUEST_COOLDOWN_SECONDS)).isoformat(),
            quick_done=False,
            quick_finished_at=None,
        )
        threading.Thread(target=sync_asan_transport_history_manual_python, daemon=True).start()
        return jsonify({
            "ok": True,
            "running": True,
            "status": _get_transport_history_sync_status(),
            "message": "운송내역 동기화를 시작했습니다. 완료까지 기다려 주세요.",
        }), 202
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

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
