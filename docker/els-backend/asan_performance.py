import gc
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path

import pandas as pd
from flask import jsonify, request

from file_sync_gate import StableFileSyncGate


DEFAULT_ASAN_ANNUAL_PERFORMANCE_PATH = "/아산지점/B_총무/C_마감/합계연간실적/합계연간실적.xlsx"
DEFAULT_ASAN_ANNUAL_PERFORMANCE_SHEET = "합계"
DEFAULT_ASAN_MONTHLY_PERFORMANCE_BASE_DIR = "/아산지점/B_총무/C_마감"
DEFAULT_ASAN_MONTHLY_PERFORMANCE_EXTRA_MONTHS = 3
FIRST_SHEET_TOKEN = "__first__"
ASAN_VOLUME_BRANCH_ROOTS = ("아산지점",)


def _env_int(name, default, minimum=0):
    try:
        return max(minimum, int(os.environ.get(name, default)))
    except (TypeError, ValueError):
        return default


def _env_bool(name, default=False):
    raw = os.environ.get(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "y", "on"}


def _normalize_performance_path(rel_path=None):
    raw = str(rel_path or DEFAULT_ASAN_ANNUAL_PERFORMANCE_PATH).strip()
    raw = raw.replace("\\", "/")
    raw = re.sub(r"^[A-Za-z]:", "", raw)
    while raw.startswith("//"):
        raw = raw[1:]
    if not raw.startswith("/"):
        raw = f"/{raw}"
    raw = re.sub(r"^/volume[12]/", "/", raw)
    if raw.startswith("/B_총무/"):
        raw = f"/아산지점{raw}"
    return raw


def _resolve_performance_file(rel_path=None):
    normalized = _normalize_performance_path(rel_path)
    raw = str(rel_path or DEFAULT_ASAN_ANNUAL_PERFORMANCE_PATH).strip()
    branchless = re.sub(r"^/아산지점/", "/", normalized)

    candidates = []
    if raw:
        candidates.append(Path(raw))

    root_env = os.environ.get("ASAN_PERFORMANCE_ROOTS", "")
    for root in [p.strip() for p in root_env.split(";") if p.strip()]:
        candidates.append(Path(root) / normalized.lstrip("/"))

    for root in (Path("/app/data"), Path("/app/volume2"), Path("/app/volume1")):
        candidates.append(root / normalized.lstrip("/"))
        if branchless != normalized:
            candidates.append(root / branchless.lstrip("/"))
        if not normalized.startswith("/아산지점/"):
            for branch_root in ASAN_VOLUME_BRANCH_ROOTS:
                candidates.append(root / branch_root / normalized.lstrip("/"))

    if os.name == "nt":
        for root in (Path("A:/"), Path("N:/"), Path("C:/Els")):
            candidates.append(root / normalized.lstrip("/"))
            if branchless != normalized:
                candidates.append(root / branchless.lstrip("/"))
            if not normalized.startswith("/아산지점/"):
                for branch_root in ASAN_VOLUME_BRANCH_ROOTS:
                    candidates.append(root / branch_root / normalized.lstrip("/"))

    for candidate in candidates:
        try:
            if candidate.exists():
                return candidate, normalized
        except OSError:
            continue

    return candidates[0] if candidates else Path(normalized), normalized


def _performance_candidate_paths(rel_path=None):
    normalized = _normalize_performance_path(rel_path)
    raw = str(rel_path or DEFAULT_ASAN_ANNUAL_PERFORMANCE_PATH).strip()
    branchless = re.sub(r"^/아산지점/", "/", normalized)
    seen = set()
    paths = []

    def add(candidate):
        text = str(candidate)
        if text in seen:
            return
        seen.add(text)
        paths.append(text)

    if raw:
        add(Path(raw))
    for root in [p.strip() for p in os.environ.get("ASAN_PERFORMANCE_ROOTS", "").split(";") if p.strip()]:
        add(Path(root) / normalized.lstrip("/"))
    for root in (Path("/app/data"), Path("/app/volume2"), Path("/app/volume1")):
        add(root / normalized.lstrip("/"))
        if branchless != normalized:
            add(root / branchless.lstrip("/"))
        if not normalized.startswith("/아산지점/"):
            for branch_root in ASAN_VOLUME_BRANCH_ROOTS:
                add(root / branch_root / normalized.lstrip("/"))
    if os.name == "nt":
        for root in (Path("A:/"), Path("N:/"), Path("C:/Els")):
            add(root / normalized.lstrip("/"))
            if branchless != normalized:
                add(root / branchless.lstrip("/"))
            if not normalized.startswith("/아산지점/"):
                for branch_root in ASAN_VOLUME_BRANCH_ROOTS:
                    add(root / branch_root / normalized.lstrip("/"))
    return paths


def _monthly_periods(base_year=None, extra_months=3):
    try:
        year = int(base_year or datetime.now().year)
    except (TypeError, ValueError):
        year = datetime.now().year
    try:
        tail = max(0, min(12, int(extra_months)))
    except (TypeError, ValueError):
        tail = DEFAULT_ASAN_MONTHLY_PERFORMANCE_EXTRA_MONTHS

    periods = []
    for offset in range(12 + tail):
        period_year = year + ((offset) // 12)
        period_month = (offset % 12) + 1
        periods.append({
            "year": period_year,
            "month": period_month,
            "period": f"{period_year}-{period_month:02d}",
            "carryover": period_year > year,
        })
    return periods


def _default_monthly_performance_path(year, month, base_dir=DEFAULT_ASAN_MONTHLY_PERFORMANCE_BASE_DIR):
    return _normalize_performance_path(
        f"{base_dir}/{year}/{month}월/{year}년_실적-{month}월 컨테이너 운송 마감자료.xlsx"
    )


def _monthly_files_from_payload(body):
    body = body or {}
    base_year = body.get("base_year") or body.get("year") or datetime.now().year
    extra_months = body.get("extra_months", DEFAULT_ASAN_MONTHLY_PERFORMANCE_EXTRA_MONTHS)
    incoming = body.get("files") if isinstance(body.get("files"), list) else []
    by_period = {}
    for item in incoming:
        if not isinstance(item, dict):
            continue
        period = str(item.get("period") or "").strip()
        if not period:
            try:
                period = f"{int(item.get('year'))}-{int(item.get('month')):02d}"
            except (TypeError, ValueError):
                continue
        by_period[period] = item

    slots = []
    for period in _monthly_periods(base_year, extra_months=extra_months):
        override = by_period.get(period["period"], {})
        path = override.get("path") or _default_monthly_performance_path(period["year"], period["month"])
        slots.append({
            **period,
            "enabled": override.get("enabled", True) is not False,
            "path": _normalize_performance_path(path),
            "sheet_name": override.get("sheet_name") or override.get("sheetName") or FIRST_SHEET_TOKEN,
            "header_row": override.get("header_row") or override.get("headerRow"),
        })
    return slots


def _clean_cell(value):
    if value is None:
        return ""
    try:
        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass
    if hasattr(value, "to_pydatetime"):
        value = value.to_pydatetime()
    if hasattr(value, "isoformat") and not isinstance(value, str):
        return value.isoformat()
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).replace("\n", " ").strip()


def _parse_amount(value):
    if value is None:
        return 0.0
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if isinstance(value, float) and math.isnan(value):
            return 0.0
        return float(value)

    text = str(value).strip()
    if not text:
        return 0.0
    negative = text.startswith("(") and text.endswith(")")
    cleaned = (
        text.replace(",", "")
        .replace("원", "")
        .replace("₩", "")
        .replace("\u00a0", " ")
        .strip()
    )
    match = re.search(r"-?\d+(?:\.\d+)?", cleaned)
    if not match:
        return 0.0
    amount = float(match.group(0))
    return -abs(amount) if negative else amount


def _has_number(value):
    if value is None:
        return False
    return bool(re.search(r"\d", str(value)))


def _header_text(header):
    return re.sub(r"\s+", "", str(header or "")).lower()


def _has_keyword(header, keywords):
    compact = _header_text(header)
    return any(str(keyword).replace(" ", "").lower() in compact for keyword in keywords)


def _is_total_row(row):
    values = [_clean_cell(value) for value in row]
    labels = [value for value in values if value]
    if not labels:
        return False
    first = labels[0].replace(" ", "")
    return first in {"합계", "총계", "소계", "누계", "합계:"}


def _detect_header_index(df, header_row=None):
    if header_row:
        try:
            return max(0, min(len(df) - 1, int(header_row) - 1))
        except (TypeError, ValueError):
            pass

    keywords = ["년", "연도", "월", "일자", "거래처", "업체", "매출", "매입", "손익", "금액", "합계"]
    best_idx = 0
    best_score = -1
    scan_count = min(len(df), 40)
    for idx in range(scan_count):
        values = [_clean_cell(v) for v in df.iloc[idx].tolist()]
        non_empty = [v for v in values if v]
        if len(non_empty) < 2:
            continue
        keyword_hits = sum(1 for value in non_empty if any(k in value for k in keywords))
        below_non_empty = 0
        for below_idx in range(idx + 1, min(len(df), idx + 4)):
            below_non_empty += sum(1 for v in df.iloc[below_idx].tolist() if _clean_cell(v))
        score = (len(non_empty) * 2) + (keyword_hits * 4) + min(below_non_empty, 20) - (idx * 0.05)
        if score > best_score:
            best_score = score
            best_idx = idx
    return best_idx


def _clean_headers(raw_headers):
    seen = {}
    headers = []
    for idx, value in enumerate(raw_headers):
        header = _clean_cell(value)
        if not header or header.lower().startswith("unnamed"):
            header = f"col_{idx + 1}"
        if header in seen:
            seen[header] += 1
            header = f"{header}_{seen[header]}"
        else:
            seen[header] = 0
        headers.append(header)
    return headers


def _sheet_name_from_workbook(excel_file, preferred):
    sheets = excel_file.sheet_names
    if not preferred or preferred == FIRST_SHEET_TOKEN or str(preferred).lower() == "first":
        return sheets[0]
    if preferred in sheets:
        return preferred
    for sheet_name in sheets:
        if preferred and preferred in sheet_name:
            return sheet_name
    return sheets[0]


def parse_asan_performance_excel(file_path, sheet_name=DEFAULT_ASAN_ANNUAL_PERFORMANCE_SHEET, header_row=None):
    temp_path = tempfile.mktemp(suffix=Path(file_path).suffix or ".xlsx")
    excel_file = None
    try:
        shutil.copy2(str(file_path), temp_path)
        excel_file = pd.ExcelFile(temp_path)
        actual_sheet = _sheet_name_from_workbook(excel_file, sheet_name or DEFAULT_ASAN_ANNUAL_PERFORMANCE_SHEET)
        df = pd.read_excel(excel_file, sheet_name=actual_sheet, header=None, dtype=object)
    finally:
        try:
            if excel_file is not None:
                excel_file.close()
        except Exception:
            pass
        try:
            os.remove(temp_path)
        except OSError:
            pass

    if df.empty:
        return {"headers": [], "data": [], "sheet_name": sheet_name, "header_row": header_row or 1}

    header_idx = _detect_header_index(df, header_row=header_row)
    raw_header = df.iloc[header_idx].tolist()

    last_col = -1
    for col_idx in range(df.shape[1]):
        if _clean_cell(raw_header[col_idx]):
            last_col = col_idx
            continue
        sample = df.iloc[header_idx + 1:min(len(df), header_idx + 201), col_idx].tolist()
        if any(_clean_cell(value) for value in sample):
            last_col = col_idx
    if last_col < 0:
        last_col = df.shape[1] - 1

    headers = _clean_headers(raw_header[:last_col + 1])
    rows = []
    for row_idx in range(header_idx + 1, len(df)):
        row = [_clean_cell(value) for value in df.iloc[row_idx, :last_col + 1].tolist()]
        if not any(row):
            continue
        rows.append(row)

    return {
        "headers": headers,
        "data": rows,
        "sheet_name": actual_sheet,
        "header_row": header_idx + 1,
    }


def _numeric_column_indices(headers, rows):
    sample_rows = rows[:2000]
    total = max(1, len(sample_rows))
    result = []
    excluded = ["년", "연도", "월", "일자", "날짜", "번호", "코드", "사업자", "전화", "차량", "작업지", "영업넘버", "seal", "booking", "type", "비고"]
    for idx, header in enumerate(headers):
        if _has_keyword(header, excluded):
            continue
        parsed = 0
        amount_sum = 0.0
        for row in sample_rows:
            value = row[idx] if idx < len(row) else ""
            if not _has_number(value):
                continue
            amount = _parse_amount(value)
            parsed += 1
            amount_sum += abs(amount)
        if parsed >= 3 and parsed / total >= 0.08 and amount_sum > 0:
            result.append(idx)
    return result


def _infer_year_month(headers, row):
    year = None
    month = None
    date_keywords = ["일자", "날짜", "년월", "마감월", "마감일"]
    year_keywords = ["연도", "년도", "년"]
    month_keywords = ["월"]

    for idx, header in enumerate(headers):
        value = row[idx] if idx < len(row) else ""
        text = str(value or "")
        compact_match = re.match(r"^(\d{4})(0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])?$", text.strip())
        date_match = compact_match or re.match(r"^(\d{4})[-./년\s]+(1[0-2]|0?[1-9])(?:[-./월\s]+(3[01]|[12]\d|0?[1-9]))?", text.strip())
        if _has_keyword(header, date_keywords) and date_match:
            year = year or int(date_match.group(1))
            month = month or int(date_match.group(2))
            continue
        if year is None and _has_keyword(header, year_keywords):
            match = re.search(r"(20\d{2}|19\d{2})", text)
            if match:
                year = int(match.group(1))
        if month is None and _has_keyword(header, month_keywords):
            match = re.search(r"\b(1[0-2]|0?[1-9])\b", text)
            if match:
                month = int(match.group(1))

    return year, month


def _year_from_header(header):
    match = re.search(r"(20\d{2}|19\d{2})", str(header or ""))
    return int(match.group(1)) if match else None


def _build_performance_summary(headers, rows):
    analysis_rows = [row for row in rows if not _is_total_row(row)]
    numeric_cols = _numeric_column_indices(headers, analysis_rows)
    sales_words = ["매출", "청구", "수입", "운송수입", "공급가", "운임"]
    purchase_words = ["매입", "원가", "비용", "지급", "외주", "운송비", "정산", "하불"]
    profit_words = ["손익", "이익", "마진", "차익", "수익"]
    amount_excludes = ["처", "거래처", "업체", "부가세", "vat", "세액", "번호", "코드"]

    revenue_cols = [
        idx for idx in numeric_cols
        if _has_keyword(headers[idx], sales_words) and not _has_keyword(headers[idx], amount_excludes)
    ]
    purchase_cols = [
        idx for idx in numeric_cols
        if _has_keyword(headers[idx], purchase_words) and not _has_keyword(headers[idx], amount_excludes)
    ]
    profit_cols = [
        idx for idx in numeric_cols
        if _has_keyword(headers[idx], profit_words) and not _has_keyword(headers[idx], amount_excludes)
    ]
    if not revenue_cols:
        revenue_cols = [
            idx for idx in numeric_cols
            if _has_keyword(headers[idx], ["금액", "합계", "total"]) and not _has_keyword(headers[idx], purchase_words)
        ][:1]

    group_candidates = [
        idx for idx, header in enumerate(headers)
        if not idx in numeric_cols and _has_keyword(header, ["거래처", "업체", "화주", "운송사", "구분", "품목", "노선", "작업지", "지점"])
    ][:4]

    yearly = {}
    monthly = {}
    groups = {}
    total_revenue = 0.0
    total_purchase = 0.0
    total_profit = 0.0

    if revenue_cols or purchase_cols or profit_cols:
        for row in analysis_rows:
            year, month = _infer_year_month(headers, row)
            revenue = sum(_parse_amount(row[idx] if idx < len(row) else "") for idx in revenue_cols)
            purchase = sum(_parse_amount(row[idx] if idx < len(row) else "") for idx in purchase_cols)
            explicit_profit = sum(_parse_amount(row[idx] if idx < len(row) else "") for idx in profit_cols)
            profit = explicit_profit if profit_cols else revenue - purchase
            total_revenue += revenue
            total_purchase += purchase
            total_profit += profit

            year_key = str(year or "미지정")
            yearly.setdefault(year_key, {"year": year_key, "revenue": 0.0, "purchase": 0.0, "profit": 0.0, "rowCount": 0})
            yearly[year_key]["revenue"] += revenue
            yearly[year_key]["purchase"] += purchase
            yearly[year_key]["profit"] += profit
            yearly[year_key]["rowCount"] += 1

            if year and month:
                month_key = f"{year}-{month:02d}"
                monthly.setdefault(month_key, {"period": month_key, "year": year, "month": month, "revenue": 0.0, "purchase": 0.0, "profit": 0.0, "rowCount": 0})
                monthly[month_key]["revenue"] += revenue
                monthly[month_key]["purchase"] += purchase
                monthly[month_key]["profit"] += profit
                monthly[month_key]["rowCount"] += 1

            if group_candidates:
                group_value = next((row[idx] for idx in group_candidates if idx < len(row) and row[idx]), "미분류")
                groups.setdefault(group_value, {"name": group_value, "revenue": 0.0, "purchase": 0.0, "profit": 0.0, "rowCount": 0})
                groups[group_value]["revenue"] += revenue
                groups[group_value]["purchase"] += purchase
                groups[group_value]["profit"] += profit
                groups[group_value]["rowCount"] += 1
    else:
        year_cols = [idx for idx in numeric_cols if _year_from_header(headers[idx])]
        label_cols = [idx for idx in range(len(headers)) if idx not in year_cols][:4]
        for row in analysis_rows:
            label = " ".join(str(row[idx]) for idx in label_cols if idx < len(row) and row[idx])
            is_revenue = any(word in label for word in sales_words) or not any(word in label for word in purchase_words + profit_words)
            is_purchase = any(word in label for word in purchase_words)
            is_profit = any(word in label for word in profit_words)
            for idx in year_cols:
                year = _year_from_header(headers[idx])
                amount = _parse_amount(row[idx] if idx < len(row) else "")
                year_key = str(year)
                yearly.setdefault(year_key, {"year": year_key, "revenue": 0.0, "purchase": 0.0, "profit": 0.0, "rowCount": 0})
                if is_purchase:
                    yearly[year_key]["purchase"] += amount
                    total_purchase += amount
                elif is_profit:
                    yearly[year_key]["profit"] += amount
                    total_profit += amount
                elif is_revenue:
                    yearly[year_key]["revenue"] += amount
                    total_revenue += amount
                yearly[year_key]["rowCount"] += 1
        for item in yearly.values():
            if not item["profit"]:
                item["profit"] = item["revenue"] - item["purchase"]
        total_profit = total_profit or total_revenue - total_purchase

    def _round_item(item):
        for key in ("revenue", "purchase", "profit"):
            if key in item:
                item[key] = round(float(item[key]), 2)
        return item

    yearly_list = [_round_item(item) for item in yearly.values()]
    yearly_list.sort(key=lambda item: (item["year"] == "미지정", str(item["year"])))
    monthly_list = [_round_item(item) for item in monthly.values()]
    monthly_list.sort(key=lambda item: item["period"])
    top_groups = [_round_item(item) for item in groups.values()]
    top_groups.sort(key=lambda item: abs(item["revenue"]), reverse=True)

    return {
        "totalRows": len(rows),
        "analysisRows": len(analysis_rows),
        "totalRevenue": round(total_revenue, 2),
        "totalPurchase": round(total_purchase, 2),
        "totalProfit": round(total_profit, 2),
        "profitRate": round((total_profit / total_revenue) * 100, 2) if total_revenue else 0,
        "yearly": yearly_list,
        "monthly": monthly_list[:240],
        "topGroups": top_groups[:15],
        "detected": {
            "numericColumns": [headers[idx] for idx in numeric_cols],
            "revenueColumns": [headers[idx] for idx in revenue_cols],
            "purchaseColumns": [headers[idx] for idx in purchase_cols],
            "profitColumns": [headers[idx] for idx in profit_cols],
            "groupColumns": [headers[idx] for idx in group_candidates],
        },
    }


def _empty_supabase_data(rel_path=None, sheet_name=DEFAULT_ASAN_ANNUAL_PERFORMANCE_SHEET, page=1, page_size=500):
    try:
        page = max(1, int(page or 1))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = max(1, min(5000, int(page_size or 500)))
    except (TypeError, ValueError):
        page_size = 500

    return {
        "headers": [],
        "data": [],
        "summary": _build_performance_summary([], []),
        "file_path": _normalize_performance_path(rel_path),
        "sheet_name": sheet_name or DEFAULT_ASAN_ANNUAL_PERFORMANCE_SHEET,
        "header_row": None,
        "file_modified_at": None,
        "synced_at": None,
        "total": 0,
        "page": page,
        "page_size": page_size,
        "sort_key": "",
        "sort_dir": "asc",
        "source": "supabase-empty",
        "needs_sync": True,
    }


def _row_hash(headers, row):
    payload = {"headers": headers, "row": row}
    return hashlib.sha256(json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")).hexdigest()


def _sort_value(value):
    text = str(value if value is not None else "").strip()
    if not text:
        return None
    compact = text.replace(",", "")
    if re.fullmatch(r"-?\d+(?:\.\d+)?", compact):
        return (0, float(compact))
    match = re.fullmatch(r"(20\d{2}|19\d{2})[-/.]?(\d{1,2})?[-/.]?(\d{1,2})?", text)
    if match:
        return (1, tuple(int(part or 0) for part in match.groups()))
    return (2, text.casefold())


def _search_terms(search):
    return [term.strip() for term in str(search or "").split(",") if term.strip()]


def _search_filter_value(term):
    return str(term).replace(",", " ").replace("\\", " ")


def register_asan_performance_routes(app, supabase, kst):
    cache = {}
    state = {"db_available": True, "last_sync_error": None}
    sync_enabled = _env_bool("ASAN_PERFORMANCE_SYNC_ENABLED", False)
    allow_core_sync = _env_bool("ASAN_PERFORMANCE_ALLOW_CORE_SYNC", False)
    external_sync_enabled = _env_bool("ASAN_PERFORMANCE_EXTERNAL_SYNC_ENABLED", True)
    allow_excel_fallback = _env_bool("ASAN_PERFORMANCE_ALLOW_EXCEL_FALLBACK", False)
    poll_seconds = _env_int("ASAN_PERFORMANCE_SYNC_POLL_SECONDS", 300, 60)
    quiet_seconds = _env_int("ASAN_PERFORMANCE_SYNC_QUIET_SECONDS", 10, 0)
    retry_seconds = _env_int("ASAN_PERFORMANCE_SYNC_RETRY_SECONDS", 180, 30)
    external_repo_root = Path(os.environ.get("ASAN_PERFORMANCE_REPO_ROOT", "/app/volume1/docker/els_home_v1"))
    external_node_bin = os.environ.get("ASAN_PERFORMANCE_NODE_BIN", "node")
    external_log_dir = Path(os.environ.get("ASAN_PERFORMANCE_EXTERNAL_LOG_DIR", str(external_repo_root / "logs")))
    external_chunk_size = str(_env_int("ASAN_PERFORMANCE_CHUNK_SIZE", 100, 20))
    external_nice = str(_env_int("ASAN_PERFORMANCE_NICE", 10, 0))
    external_ionice_class = str(_env_int("ASAN_PERFORMANCE_IONICE_CLASS", 2, 1))
    external_ionice_level = str(_env_int("ASAN_PERFORMANCE_IONICE_LEVEL", 7, 0))
    sync_gate = StableFileSyncGate(quiet_seconds=quiet_seconds, retry_seconds=retry_seconds)
    sync_state_lock = threading.Lock()
    sync_state = {
        "running": False,
        "started_at": None,
        "finished_at": None,
        "last_error": None,
        "last_result": None,
        "mode": None,
        "pid": None,
        "log_path": None,
    }
    monthly_sync_state_lock = threading.Lock()
    monthly_sync_state = {
        "running": False,
        "started_at": None,
        "finished_at": None,
        "last_error": None,
        "last_result": None,
        "mode": None,
        "pid": None,
        "log_path": None,
    }

    def _sync_status():
        with sync_state_lock:
            return dict(sync_state)

    def _attach_sync_status(data):
        payload = dict(data or {})
        payload["sync_status"] = _sync_status()
        return payload

    def _monthly_sync_status():
        with monthly_sync_state_lock:
            return dict(monthly_sync_state)

    def _attach_monthly_sync_status(data):
        payload = dict(data or {})
        payload["sync_status"] = _monthly_sync_status()
        return payload

    def _start_background_sync(rel_path, sheet_name, header_row, force):
        with sync_state_lock:
            if sync_state["running"]:
                return False
            sync_state.update({
                "running": True,
                "started_at": datetime.now(kst).isoformat(),
                "finished_at": None,
                "last_error": None,
                "last_result": None,
                "mode": "core" if allow_core_sync else "external",
                "pid": None,
                "log_path": None,
            })

        def runner():
            result = None
            error = None
            try:
                result = (
                    _sync(force=force, rel_path=rel_path, sheet_name=sheet_name, header_row=header_row)
                    if allow_core_sync
                    else _sync_external(force=force, rel_path=rel_path, sheet_name=sheet_name, header_row=header_row)
                )
                if not result:
                    error = state.get("last_sync_error") or "연간실적 NAS 동기화에 실패했습니다."
            except Exception as exc:
                error = str(exc)
                app.logger.error(f"[연간실적DB] 백그라운드 동기화 실패: {exc}", exc_info=True)
            finally:
                with sync_state_lock:
                    sync_state.update({
                        "running": False,
                        "finished_at": datetime.now(kst).isoformat(),
                        "last_error": error,
                        "last_result": result,
                    })

        threading.Thread(target=runner, daemon=True).start()
        return True

    def _start_monthly_background_sync(body, force):
        with monthly_sync_state_lock:
            if monthly_sync_state["running"]:
                return False
            monthly_sync_state.update({
                "running": True,
                "started_at": datetime.now(kst).isoformat(),
                "finished_at": None,
                "last_error": None,
                "last_result": None,
                "mode": "external-monthly",
                "pid": None,
                "log_path": None,
            })

        def runner():
            result = None
            error = None
            try:
                result = _sync_monthly_external(body=body, force=force)
                if not result:
                    error = state.get("last_sync_error") or "월간실적 NAS 동기화에 실패했습니다."
            except Exception as exc:
                error = str(exc)
                app.logger.error(f"[월간실적DB] 백그라운드 동기화 실패: {exc}", exc_info=True)
            finally:
                with monthly_sync_state_lock:
                    monthly_sync_state.update({
                        "running": False,
                        "finished_at": datetime.now(kst).isoformat(),
                        "last_error": error,
                        "last_result": result,
                    })

        threading.Thread(target=runner, daemon=True).start()
        return True

    def _retire_rows(normalized_path, sheet_name, indices, status, now_iso):
        if not indices:
            return 0
        count = 0
        for start in range(0, len(indices), 500):
            chunk = indices[start:start + 500]
            res = (
                supabase.from_("branch_performance_rows")
                .update({"is_current": False, "change_status": status, "replaced_at": now_iso, "last_seen_at": now_iso})
                .eq("branch_id", "asan")
                .eq("dataset_type", "annual")
                .eq("file_path", normalized_path)
                .eq("sheet_name", sheet_name)
                .eq("is_current", True)
                .in_("row_index", chunk)
                .execute()
            )
            count += len(res.data or [])
        return count

    def _read_current_meta(normalized_path, sheet_name):
        if not supabase or not state["db_available"]:
            return None
        res = (
            supabase.from_("branch_performance_files")
            .select("file_modified_at,synced_at,row_count,current_row_count,header_row,summary,headers,sheet_name")
            .eq("branch_id", "asan")
            .eq("dataset_type", "annual")
            .eq("file_path", normalized_path)
            .eq("sheet_name", sheet_name or DEFAULT_ASAN_ANNUAL_PERFORMANCE_SHEET)
            .execute()
        )
        return res.data[0] if res.data else None

    def _timestamp_close(left, right_ts):
        try:
            left_ts = datetime.fromisoformat(str(left).replace("Z", "+00:00")).timestamp()
            return abs(left_ts - right_ts) < 1
        except Exception:
            return False

    def _current_snapshot_id(meta):
        summary = (meta or {}).get("summary") or {}
        if isinstance(summary, str):
            try:
                summary = json.loads(summary)
            except Exception:
                summary = {}
        return summary.get("currentSnapshotId") or summary.get("current_snapshot_id")

    def _tail_log(log_path, limit=4000):
        try:
            text = Path(log_path).read_text(encoding="utf-8", errors="ignore")
            return text[-limit:]
        except Exception:
            return ""

    def _wrap_low_priority_command(command):
        if shutil.which("ionice"):
            return [
                "nice", "-n", external_nice,
                "ionice", "-c", external_ionice_class, "-n", external_ionice_level,
                *command,
            ]
        if shutil.which("nice"):
            return ["nice", "-n", external_nice, *command]
        return command

    def _sync_external(force=False, rel_path=None, sheet_name=DEFAULT_ASAN_ANNUAL_PERFORMANCE_SHEET, header_row=None):
        if not external_sync_enabled:
            state["last_sync_error"] = "연간실적 외부 동기화가 비활성화되어 있습니다."
            return None
        if not supabase or not state["db_available"]:
            state["last_sync_error"] = "Supabase 클라이언트가 없거나 연간실적 테이블이 비활성화되어 있습니다."
            return None

        file_path, normalized_path = _resolve_performance_file(rel_path)
        if not file_path.exists():
            state["last_sync_error"] = f"연간실적 엑셀 파일을 찾을 수 없습니다: {file_path}"
            return None

        script_path = external_repo_root / "web" / "scripts" / "import-asan-annual-performance.mjs"
        if not script_path.exists():
            state["last_sync_error"] = f"연간실적 동기화 스크립트를 찾을 수 없습니다: {script_path}"
            return None
        if not shutil.which(external_node_bin):
            state["last_sync_error"] = f"연간실적 외부 동기화에 필요한 Node.js를 찾을 수 없습니다: {external_node_bin}"
            return None

        actual_sheet = sheet_name or DEFAULT_ASAN_ANNUAL_PERFORMANCE_SHEET
        file_stat = file_path.stat()
        current_meta = _read_current_meta(normalized_path, actual_sheet)
        snapshot_id = _current_snapshot_id(current_meta)
        same_file = bool(current_meta and current_meta.get("file_modified_at") and _timestamp_close(current_meta["file_modified_at"], file_stat.st_mtime))
        run_summary_only = bool(snapshot_id and same_file)
        mode = "external-summary-only" if run_summary_only else "external-snapshot-import"

        command = [
            external_node_bin,
            str(script_path),
            "--file", str(file_path),
            "--db-path", normalized_path,
            "--sheet", actual_sheet,
            "--chunk-size", external_chunk_size,
        ]
        if header_row:
            command.extend(["--header-row", str(header_row)])
        if run_summary_only:
            command.extend(["--summary-only", "--force", "--snapshot-id", str(snapshot_id)])
        else:
            command.append("--confirm-large-import")
            if force:
                command.append("--force")

        external_log_dir.mkdir(parents=True, exist_ok=True)
        log_path = external_log_dir / f"asan-annual-performance-web-sync-{datetime.now(kst).strftime('%Y%m%d-%H%M%S')}.log"
        wrapped = _wrap_low_priority_command(command)
        env = os.environ.copy()
        env.setdefault("NODE_OPTIONS", "--max-old-space-size=1536")

        app.logger.info(f"[연간실적DB] 외부 동기화 시작 mode={mode} log={log_path}")
        with open(log_path, "w", encoding="utf-8") as log_file:
            proc = subprocess.Popen(
                wrapped,
                cwd=str(external_repo_root),
                stdout=log_file,
                stderr=subprocess.STDOUT,
                env=env,
                text=True,
            )
            with sync_state_lock:
                sync_state["pid"] = proc.pid
                sync_state["mode"] = mode
                sync_state["log_path"] = str(log_path)
            exit_code = proc.wait()

        if exit_code != 0:
            state["last_sync_error"] = f"연간실적 외부 동기화 실패(exit={exit_code}). 로그: {log_path}\n{_tail_log(log_path)}"
            app.logger.error(state["last_sync_error"])
            return None

        state["last_sync_error"] = None
        cache.pop(normalized_path, None)
        gc.collect()
        return {
            "mode": mode,
            "external": True,
            "exit_code": exit_code,
            "log_path": str(log_path),
            "file_modified_at": datetime.fromtimestamp(file_stat.st_mtime, tz=kst).isoformat(),
            "synced_at": datetime.now(kst).isoformat(),
            "summary_only": run_summary_only,
        }

    def _sync_monthly_external(body=None, force=False):
        if not external_sync_enabled:
            state["last_sync_error"] = "월간실적 외부 동기화가 비활성화되어 있습니다."
            return None
        if not supabase or not state["db_available"]:
            state["last_sync_error"] = "Supabase 클라이언트가 없거나 월간실적 테이블이 비활성화되어 있습니다."
            return None

        script_path = external_repo_root / "web" / "scripts" / "import-asan-annual-performance.mjs"
        if not script_path.exists():
            state["last_sync_error"] = f"월간실적 동기화 스크립트를 찾을 수 없습니다: {script_path}"
            return None
        if not shutil.which(external_node_bin):
            state["last_sync_error"] = f"월간실적 외부 동기화에 필요한 Node.js를 찾을 수 없습니다: {external_node_bin}"
            return None

        slots = _monthly_files_from_payload(body or {})
        external_log_dir.mkdir(parents=True, exist_ok=True)
        log_path = external_log_dir / f"asan-monthly-performance-web-sync-{datetime.now(kst).strftime('%Y%m%d-%H%M%S')}.log"
        results = []
        synced_count = 0
        failed_count = 0
        skipped_count = 0
        env = os.environ.copy()
        env.setdefault("NODE_OPTIONS", "--max-old-space-size=1536")

        app.logger.info(f"[월간실적DB] 외부 동기화 시작 slots={len(slots)} log={log_path}")
        with open(log_path, "w", encoding="utf-8") as log_file:
            for slot in slots:
                if not slot.get("enabled", True):
                    skipped_count += 1
                    results.append({**slot, "status": "skipped", "reason": "disabled"})
                    continue

                file_path, normalized_path = _resolve_performance_file(slot.get("path"))
                if not file_path.exists():
                    skipped_count += 1
                    results.append({
                        **slot,
                        "path": normalized_path,
                        "status": "skipped",
                        "reason": "missing",
                        "checked_paths": _performance_candidate_paths(slot.get("path"))[:6],
                    })
                    continue

                command = [
                    external_node_bin,
                    str(script_path),
                    "--dataset-type", "monthly",
                    "--file", str(file_path),
                    "--db-path", normalized_path,
                    "--sheet", slot.get("sheet_name") or FIRST_SHEET_TOKEN,
                    "--diff-current",
                    "--source-year", str(slot["year"]),
                    "--source-month", str(slot["month"]),
                    "--chunk-size", external_chunk_size,
                    "--confirm-large-import",
                ]
                if slot.get("header_row"):
                    command.extend(["--header-row", str(slot["header_row"])])
                if force:
                    command.append("--force")

                log_file.write(f"\n[monthly {slot['period']}] file={file_path}\n")
                log_file.flush()
                wrapped = _wrap_low_priority_command(command)
                proc = subprocess.Popen(
                    wrapped,
                    cwd=str(external_repo_root),
                    stdout=log_file,
                    stderr=subprocess.STDOUT,
                    env=env,
                    text=True,
                )
                with monthly_sync_state_lock:
                    monthly_sync_state["pid"] = proc.pid
                    monthly_sync_state["log_path"] = str(log_path)
                exit_code = proc.wait()
                if exit_code == 0:
                    synced_count += 1
                    results.append({**slot, "path": normalized_path, "status": "synced", "exit_code": exit_code})
                else:
                    failed_count += 1
                    results.append({**slot, "path": normalized_path, "status": "failed", "exit_code": exit_code})

        cache.clear()
        gc.collect()
        if failed_count:
            state["last_sync_error"] = f"월간실적 외부 동기화 일부 실패({failed_count}건). 로그: {log_path}\n{_tail_log(log_path)}"
            app.logger.error(state["last_sync_error"])
        else:
            state["last_sync_error"] = None

        return {
            "mode": "external-monthly",
            "external": True,
            "log_path": str(log_path),
            "synced_count": synced_count,
            "skipped_count": skipped_count,
            "failed_count": failed_count,
            "files": results,
            "synced_at": datetime.now(kst).isoformat(),
        }

    def _sync(force=False, rel_path=None, sheet_name=DEFAULT_ASAN_ANNUAL_PERFORMANCE_SHEET, header_row=None):
        if not allow_core_sync:
            state["last_sync_error"] = (
                "연간실적 대용량 NAS 동기화는 core 메모리 보호를 위해 비활성화되어 있습니다. "
                "scripts/import-asan-annual-performance.sh를 사용하세요."
            )
            return None
        if not supabase or not state["db_available"]:
            state["last_sync_error"] = "Supabase 클라이언트가 없거나 연간실적 테이블이 비활성화되어 있습니다."
            return None

        file_path, normalized_path = _resolve_performance_file(rel_path)
        if not file_path.exists():
            state["last_sync_error"] = f"연간실적 엑셀 파일을 찾을 수 없습니다: {file_path}"
            app.logger.info(f"[연간실적DB] 파일 미발견: {file_path}")
            return None

        file_stat = file_path.stat()
        mtime_ts = file_stat.st_mtime
        file_signature = (mtime_ts, file_stat.st_size, str(header_row or "auto"))
        file_modified_at = datetime.fromtimestamp(mtime_ts, tz=kst).isoformat()

        try:
            meta_res = (
                supabase.from_("branch_performance_files")
                .select("file_modified_at,summary,headers,sheet_name,header_row")
                .eq("branch_id", "asan")
                .eq("dataset_type", "annual")
                .eq("file_path", normalized_path)
                .eq("sheet_name", sheet_name or DEFAULT_ASAN_ANNUAL_PERFORMANCE_SHEET)
                .execute()
            )
            current_meta = meta_res.data[0] if meta_res.data else None
            if not force and current_meta and current_meta.get("file_modified_at"):
                try:
                    db_mtime = datetime.fromisoformat(str(current_meta["file_modified_at"]).replace("Z", "+00:00")).timestamp()
                    if abs(db_mtime - mtime_ts) < 1 and int(current_meta.get("header_row") or 0) == int(header_row or current_meta.get("header_row") or 0):
                        sync_gate.mark_synced(normalized_path, file_signature)
                        return current_meta
                except Exception:
                    pass

            decision = sync_gate.check(normalized_path, file_signature, force=force)
            if not decision.ready:
                if decision.reason in ("pending", "settling"):
                    app.logger.info(f"[연간실적DB] 파일 저장 안정화 대기 중: {normalized_path} ({decision.reason})")
                return current_meta

            parsed = parse_asan_performance_excel(file_path, sheet_name=sheet_name, header_row=header_row)
            headers = parsed["headers"]
            rows = parsed["data"]
            actual_sheet = parsed["sheet_name"]
            actual_header_row = parsed["header_row"]
            summary = _build_performance_summary(headers, rows)
            snapshot_id = str(uuid.uuid4())
            now_iso = datetime.now(kst).isoformat()

            current_rows_res = (
                supabase.from_("branch_performance_rows")
                .select("row_index,source_row_hash")
                .eq("branch_id", "asan")
                .eq("dataset_type", "annual")
                .eq("file_path", normalized_path)
                .eq("sheet_name", actual_sheet)
                .eq("is_current", True)
                .execute()
            )
            current_by_index = {int(item["row_index"]): item.get("source_row_hash") for item in (current_rows_res.data or [])}
            new_hash_by_index = {}
            insert_payload = []

            for row_index, row in enumerate(rows):
                row_hash = _row_hash(headers, row)
                new_hash_by_index[row_index] = row_hash
                if current_by_index.get(row_index) == row_hash:
                    continue

                row_data = {headers[i]: (row[i] if i < len(row) else "") for i in range(len(headers))}
                year, month = _infer_year_month(headers, row)
                search_text = " ".join(str(v) for v in row if v)
                insert_payload.append({
                    "branch_id": "asan",
                    "dataset_type": "annual",
                    "file_path": normalized_path,
                    "sheet_name": actual_sheet,
                    "snapshot_id": snapshot_id,
                    "row_index": row_index,
                    "row_values": row,
                    "row_data": row_data,
                    "search_text": search_text[:8000],
                    "source_row_hash": row_hash,
                    "year_value": year,
                    "month_value": month,
                    "revenue_amount": 0,
                    "purchase_amount": 0,
                    "profit_amount": 0,
                    "is_current": True,
                    "change_status": "current",
                    "file_modified_at": file_modified_at,
                    "first_seen_at": now_iso,
                    "last_seen_at": now_iso,
                })

            changed_indices = [idx for idx, old_hash in current_by_index.items() if idx in new_hash_by_index and new_hash_by_index[idx] != old_hash]
            removed_indices = [idx for idx in current_by_index if idx not in new_hash_by_index]
            superseded_count = _retire_rows(normalized_path, actual_sheet, changed_indices, "superseded_by_excel", now_iso)
            removed_count = _retire_rows(normalized_path, actual_sheet, removed_indices, "removed_from_excel", now_iso)

            for start in range(0, len(insert_payload), 500):
                supabase.from_("branch_performance_rows").insert(insert_payload[start:start + 500]).execute()

            unchanged_count = len(rows) - len(insert_payload)
            supabase.from_("branch_performance_files").upsert({
                "branch_id": "asan",
                "dataset_type": "annual",
                "file_path": normalized_path,
                "sheet_name": actual_sheet,
                "header_row": actual_header_row,
                "headers": headers,
                "row_count": len(rows),
                "current_row_count": len(rows),
                "summary": summary,
                "file_modified_at": file_modified_at,
                "synced_at": now_iso,
            }, on_conflict="branch_id,dataset_type,file_path,sheet_name").execute()

            sync_gate.mark_synced(normalized_path, file_signature)
            state["last_sync_error"] = None
            cache.pop(normalized_path, None)
            app.logger.info(
                f"[연간실적DB] 동기화 완료: {normalized_path} "
                f"({len(rows)}행, 신규/변경 {len(insert_payload)}행, 유지 {unchanged_count}행, 종료 {superseded_count + removed_count}행)"
            )
            result = {
                "file_modified_at": file_modified_at,
                "synced_at": now_iso,
                "inserted_count": len(insert_payload),
                "unchanged_count": unchanged_count,
                "superseded_count": superseded_count,
                "removed_count": removed_count,
                "summary": summary,
                "headers": headers,
                "sheet_name": actual_sheet,
                "header_row": actual_header_row,
            }
            del rows, parsed, insert_payload, current_by_index, new_hash_by_index
            gc.collect()
            return result
        except Exception as exc:
            if "branch_performance_" in str(exc) or "relation" in str(exc).lower():
                state["db_available"] = False
                state["last_sync_error"] = "Supabase branch_performance 테이블을 찾을 수 없습니다. migration 적용 후 컨테이너를 재시작하세요."
                app.logger.warning("[연간실적DB] Supabase 테이블이 없어 동기화를 비활성화합니다. migration 적용 후 컨테이너를 재시작하세요.")
            else:
                state["last_sync_error"] = str(exc)
                app.logger.error(f"[연간실적DB] 동기화 실패: {exc}", exc_info=True)
            return None

    def _query(rel_path=None, sheet_name=DEFAULT_ASAN_ANNUAL_PERFORMANCE_SHEET, page=1, page_size=500, search="", search_mode="or", sort_key="", sort_dir="asc"):
        if not supabase or not state["db_available"]:
            return None

        normalized_path = _normalize_performance_path(rel_path)
        meta_res = (
            supabase.from_("branch_performance_files")
            .select("*")
            .eq("branch_id", "asan")
            .eq("dataset_type", "annual")
            .eq("file_path", normalized_path)
            .eq("sheet_name", sheet_name or DEFAULT_ASAN_ANNUAL_PERFORMANCE_SHEET)
            .execute()
        )
        meta = meta_res.data[0] if meta_res.data else None
        if not meta:
            return None

        headers = meta.get("headers") or []
        page = max(1, int(page or 1))
        page_size = max(1, min(5000, int(page_size or 500)))
        start = (page - 1) * page_size
        end = start + page_size - 1
        sort_key = str(sort_key or "").strip()
        sort_desc = str(sort_dir or "asc").lower() == "desc"
        sort_idx = headers.index(sort_key) if sort_key in headers else -1

        q = (
            supabase.from_("branch_performance_rows")
            .select("row_values,row_index", count="exact")
            .eq("branch_id", "asan")
            .eq("dataset_type", "annual")
            .eq("file_path", normalized_path)
            .eq("sheet_name", meta.get("sheet_name") or sheet_name)
            .eq("is_current", True)
        )
        terms = _search_terms(search)
        search_mode = str(search_mode or "or").lower()
        if len(terms) == 1:
            q = q.ilike("search_text", f"%{_search_filter_value(terms[0])}%")
        elif terms:
            if search_mode == "and":
                for term in terms:
                    q = q.ilike("search_text", f"%{_search_filter_value(term)}%")
            else:
                filters = ",".join(f"search_text.ilike.%{_search_filter_value(term)}%" for term in terms)
                q = q.or_(filters)

        if sort_idx >= 0:
            rows_res = q.order("row_index", desc=False).range(0, 19999).execute()
            sortable = []
            blanks = []
            for item in rows_res.data or []:
                row = item.get("row_values") or []
                value = _sort_value(row[sort_idx] if sort_idx < len(row) else "")
                if value is None:
                    blanks.append(item)
                else:
                    sortable.append((value, item))
            sortable.sort(key=lambda pair: pair[0], reverse=sort_desc)
            ordered_rows = ([item for _, item in sortable] + blanks) if sort_desc else (blanks + [item for _, item in sortable])
            page_rows = ordered_rows[start:end + 1]
        else:
            rows_res = q.order("row_index", desc=False).range(start, end).execute()
            page_rows = rows_res.data or []

        return {
            "headers": headers,
            "data": [row.get("row_values") for row in page_rows],
            "summary": meta.get("summary") or {},
            "file_path": meta.get("file_path"),
            "sheet_name": meta.get("sheet_name"),
            "header_row": meta.get("header_row"),
            "file_modified_at": meta.get("file_modified_at"),
            "synced_at": meta.get("synced_at"),
            "total": rows_res.count if rows_res.count is not None else meta.get("current_row_count", 0),
            "page": page,
            "page_size": page_size,
            "sort_key": sort_key if sort_idx >= 0 else "",
            "sort_dir": "desc" if sort_desc else "asc",
            "source": "supabase",
        }

    def _scheduler():
        app.logger.info(f"[스케줄러] 아산 연간실적 DB 동기화 스케줄러 시작 (poll={poll_seconds}s, quiet={quiet_seconds}s)")
        while True:
            try:
                now = datetime.now(kst)
                if 6 <= now.hour <= 23:
                    _start_background_sync(
                        DEFAULT_ASAN_ANNUAL_PERFORMANCE_PATH,
                        DEFAULT_ASAN_ANNUAL_PERFORMANCE_SHEET,
                        None,
                        False,
                    )
                time.sleep(poll_seconds)
            except Exception as exc:
                app.logger.error(f"[연간실적DB 스케줄러] 에러: {exc}")
                time.sleep(poll_seconds)

    if sync_enabled:
        threading.Thread(target=_scheduler, daemon=True).start()
    else:
        app.logger.info("[스케줄러] 아산 연간실적 core 자동 동기화 비활성화 (NAS 스크립트 전용)")

    @app.route("/api/branches/asan/performance/monthly", methods=["GET", "POST"])
    def asan_monthly_performance():
        try:
            if request.method == "GET":
                return jsonify({
                    "data": _attach_monthly_sync_status({
                        "source": "core-status",
                        "monthlyFileSlots": _monthly_files_from_payload({
                            "base_year": request.args.get("year") or request.args.get("base_year"),
                            "extra_months": request.args.get("extra_months", DEFAULT_ASAN_MONTHLY_PERFORMANCE_EXTRA_MONTHS),
                        }),
                    })
                })

            body = request.get_json(silent=True) or {}
            force = body.get("force", False)
            if isinstance(force, str):
                force = force.lower() in ("1", "true", "yes", "y")
            run_async = body.get("async", True)
            if isinstance(run_async, str):
                run_async = run_async.lower() in ("1", "true", "yes", "y")

            if not external_sync_enabled:
                return jsonify({
                    "ok": False,
                    "error": "월간실적 NAS 동기화는 외부 Node importer가 필요합니다.",
                    "data": _attach_monthly_sync_status({"monthlyFileSlots": _monthly_files_from_payload(body)}),
                }), 409

            if run_async:
                started = _start_monthly_background_sync(body, bool(force))
                status = _monthly_sync_status()
                return jsonify({
                    "ok": True,
                    "status": "syncing" if status.get("running") else "idle",
                    "message": "월간실적 NAS 동기화를 시작했습니다." if started else "월간실적 NAS 동기화가 이미 진행 중입니다.",
                    "data": _attach_monthly_sync_status({"monthlyFileSlots": _monthly_files_from_payload(body)}),
                }), 202 if status.get("running") else 200

            result = _sync_monthly_external(body=body, force=bool(force))
            if not result:
                return jsonify({"ok": False, "error": state.get("last_sync_error") or "월간실적 NAS 동기화에 실패했습니다."}), 500
            status_code = 207 if result.get("failed_count") else 200
            return jsonify({"ok": result.get("failed_count", 0) == 0, "data": _attach_monthly_sync_status(result)}), status_code
        except Exception as exc:
            app.logger.error(f"월간실적 처리 오류: {exc}", exc_info=True)
            return jsonify({"error": str(exc)}), 500

    @app.route("/api/branches/asan/performance/annual", methods=["GET", "POST"])
    def asan_annual_performance():
        try:
            if request.method == "POST":
                body = request.get_json(silent=True) or {}
                rel_path = body.get("path") or request.args.get("path") or DEFAULT_ASAN_ANNUAL_PERFORMANCE_PATH
                sheet_name = body.get("sheet_name") or request.args.get("sheet_name") or DEFAULT_ASAN_ANNUAL_PERFORMANCE_SHEET
                header_row = body.get("header_row") or request.args.get("header_row")
                force = body.get("force", True)
                if isinstance(force, str):
                    force = force.lower() in ("1", "true", "yes", "y")
                run_async = body.get("async", False)
                if isinstance(run_async, str):
                    run_async = run_async.lower() in ("1", "true", "yes", "y")

                if not allow_core_sync and not external_sync_enabled:
                    db_data = _query(
                        rel_path=rel_path,
                        sheet_name=sheet_name,
                        page=body.get("page") or request.args.get("page", 1),
                        page_size=body.get("page_size") or request.args.get("page_size", 500),
                        search=(body.get("search") or request.args.get("search") or "").strip(),
                        search_mode=(body.get("search_mode") or request.args.get("search_mode") or "or").strip(),
                        sort_key=(body.get("sort_key") or request.args.get("sort_key") or "").strip(),
                        sort_dir=body.get("sort_dir") or request.args.get("sort_dir") or "asc",
                    )
                    return jsonify({
                        "ok": False,
                        "error": "연간실적 NAS 동기화는 core 메모리 보호를 위해 비활성화되어 있습니다. NAS에서 scripts/import-asan-annual-performance.sh를 실행하세요.",
                        "data": _attach_sync_status(db_data or _empty_supabase_data(
                            rel_path=rel_path,
                            sheet_name=sheet_name,
                            page=body.get("page") or request.args.get("page", 1),
                            page_size=body.get("page_size") or request.args.get("page_size", 500),
                        )),
                    }), 409
                if not allow_core_sync:
                    run_async = True

                if run_async:
                    started = _start_background_sync(rel_path, sheet_name, header_row, bool(force))
                    db_data = _query(
                        rel_path=rel_path,
                        sheet_name=sheet_name,
                        page=body.get("page") or request.args.get("page", 1),
                        page_size=body.get("page_size") or request.args.get("page_size", 500),
                        search=(body.get("search") or request.args.get("search") or "").strip(),
                        search_mode=(body.get("search_mode") or request.args.get("search_mode") or "or").strip(),
                        sort_key=(body.get("sort_key") or request.args.get("sort_key") or "").strip(),
                        sort_dir=body.get("sort_dir") or request.args.get("sort_dir") or "asc",
                    )
                    data = db_data or _empty_supabase_data(
                        rel_path=rel_path,
                        sheet_name=sheet_name,
                        page=body.get("page") or request.args.get("page", 1),
                        page_size=body.get("page_size") or request.args.get("page_size", 500),
                    )
                    status = _sync_status()
                    return jsonify({
                        "ok": True,
                        "status": "syncing" if status.get("running") else "idle",
                        "message": "연간실적 NAS 동기화를 시작했습니다." if started else "연간실적 NAS 동기화가 이미 진행 중입니다.",
                        "data": _attach_sync_status(data),
                    }), 202 if status.get("running") else 200

                sync_result = _sync(force=bool(force), rel_path=rel_path, sheet_name=sheet_name, header_row=header_row)
                if not sync_result:
                    return jsonify({"ok": False, "error": state.get("last_sync_error") or "연간실적 NAS 동기화에 실패했습니다."}), 500

                db_data = _query(
                    rel_path=rel_path,
                    sheet_name=sync_result.get("sheet_name") or sheet_name,
                    page=body.get("page") or request.args.get("page", 1),
                    page_size=body.get("page_size") or request.args.get("page_size", 500),
                    search=(body.get("search") or request.args.get("search") or "").strip(),
                    search_mode=(body.get("search_mode") or request.args.get("search_mode") or "or").strip(),
                    sort_key=(body.get("sort_key") or request.args.get("sort_key") or "").strip(),
                    sort_dir=body.get("sort_dir") or request.args.get("sort_dir") or "asc",
                )
                return jsonify({"ok": True, "data": _attach_sync_status(db_data or sync_result)})

            rel_path = request.args.get("path") or DEFAULT_ASAN_ANNUAL_PERFORMANCE_PATH
            sheet_name = request.args.get("sheet_name") or DEFAULT_ASAN_ANNUAL_PERFORMANCE_SHEET
            source = (request.args.get("source", "supabase") or "supabase").lower()
            if source != "excel":
                db_data = _query(
                    rel_path=rel_path,
                    sheet_name=sheet_name,
                    page=request.args.get("page", 1),
                    page_size=request.args.get("page_size", 500),
                    search=(request.args.get("search") or "").strip(),
                    search_mode=(request.args.get("search_mode") or "or").strip(),
                    sort_key=(request.args.get("sort_key") or "").strip(),
                    sort_dir=request.args.get("sort_dir") or "asc",
                )
                if db_data:
                    return jsonify({"data": _attach_sync_status(db_data)})
                if not supabase or not state["db_available"]:
                    return jsonify({
                        "error": "연간실적 Supabase 연결 또는 테이블 상태를 확인할 수 없습니다.",
                        "source": "supabase-unavailable",
                    }), 503
                return jsonify({
                    "data": _attach_sync_status(_empty_supabase_data(
                        rel_path=rel_path,
                        sheet_name=sheet_name,
                        page=request.args.get("page", 1),
                        page_size=request.args.get("page_size", 500),
                    ))
                })

            if not allow_excel_fallback:
                return jsonify({
                    "error": "연간실적 대용량 엑셀 직접 조회는 core 메모리 보호를 위해 비활성화되어 있습니다.",
                    "source": "excel-disabled",
                }), 409

            file_path, normalized_path = _resolve_performance_file(rel_path)
            if not file_path.exists():
                return jsonify({
                    "error": "연간실적 엑셀 파일을 찾을 수 없습니다.",
                    "path": normalized_path,
                    "checked_paths": _performance_candidate_paths(rel_path),
                }), 404

            mtime = file_path.stat().st_mtime
            cached = cache.get(normalized_path)
            if cached and cached["mtime"] == mtime and cached["data"]:
                return jsonify({"data": _attach_sync_status({**cached["data"], "source": "excel-cache"})})

            parsed = parse_asan_performance_excel(
                file_path,
                sheet_name=sheet_name,
                header_row=request.args.get("header_row"),
            )
            page = max(1, int(request.args.get("page", 1) or 1))
            page_size = max(1, min(500, int(request.args.get("page_size", 100) or 100)))
            start = (page - 1) * page_size
            end = start + page_size
            total_rows = len(parsed["data"])
            summary = _build_performance_summary(parsed["headers"], parsed["data"])
            data = {
                **parsed,
                "data": parsed["data"][start:end],
                "summary": summary,
                "file_modified_at": datetime.fromtimestamp(mtime, tz=kst).isoformat(),
                "source": "excel-cache",
                "total": total_rows,
                "page": page,
                "page_size": page_size,
            }
            cache.pop(normalized_path, None)
            del parsed
            gc.collect()
            return jsonify({"data": _attach_sync_status(data)})
        except Exception as exc:
            app.logger.error(f"연간실적 처리 오류: {exc}", exc_info=True)
            return jsonify({"error": str(exc)}), 500
