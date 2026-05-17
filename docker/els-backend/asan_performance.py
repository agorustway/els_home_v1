import gc
import hashlib
import json
import math
import os
import re
import shutil
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
ASAN_VOLUME_BRANCH_ROOTS = ("아산지점",)


def _env_int(name, default, minimum=0):
    try:
        return max(minimum, int(os.environ.get(name, default)))
    except (TypeError, ValueError):
        return default


def _normalize_performance_path(rel_path=None):
    raw = str(rel_path or DEFAULT_ASAN_ANNUAL_PERFORMANCE_PATH).strip()
    raw = raw.replace("\\", "/")
    raw = re.sub(r"^[A-Za-z]:", "", raw)
    while raw.startswith("//"):
        raw = raw[1:]
    if not raw.startswith("/"):
        raw = f"/{raw}"
    if raw.startswith("/B_총무/"):
        raw = f"/아산지점{raw}"
    return raw


def _resolve_performance_file(rel_path=None):
    normalized = _normalize_performance_path(rel_path)
    raw = str(rel_path or DEFAULT_ASAN_ANNUAL_PERFORMANCE_PATH).strip()

    candidates = []
    if raw:
        candidates.append(Path(raw))

    root_env = os.environ.get("ASAN_PERFORMANCE_ROOTS", "")
    for root in [p.strip() for p in root_env.split(";") if p.strip()]:
        candidates.append(Path(root) / normalized.lstrip("/"))

    for root in (Path("/app/data"), Path("/app/volume2"), Path("/app/volume1")):
        candidates.append(root / normalized.lstrip("/"))
        if not normalized.startswith("/아산지점/"):
            for branch_root in ASAN_VOLUME_BRANCH_ROOTS:
                candidates.append(root / branch_root / normalized.lstrip("/"))

    if os.name == "nt":
        for root in (Path("A:/"), Path("N:/"), Path("C:/Els")):
            candidates.append(root / normalized.lstrip("/"))
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
        if not normalized.startswith("/아산지점/"):
            for branch_root in ASAN_VOLUME_BRANCH_ROOTS:
                add(root / branch_root / normalized.lstrip("/"))
    if os.name == "nt":
        for root in (Path("A:/"), Path("N:/"), Path("C:/Els")):
            add(root / normalized.lstrip("/"))
            if not normalized.startswith("/아산지점/"):
                for branch_root in ASAN_VOLUME_BRANCH_ROOTS:
                    add(root / branch_root / normalized.lstrip("/"))
    return paths


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
    total = max(1, len(rows))
    result = []
    excluded = ["년", "연도", "월", "일자", "날짜", "번호", "코드", "사업자", "전화", "차량"]
    for idx, header in enumerate(headers):
        if _has_keyword(header, excluded):
            continue
        parsed = 0
        amount_sum = 0.0
        for row in rows[:2000]:
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
        if year is None and _has_keyword(header, year_keywords):
            match = re.search(r"(20\d{2}|19\d{2})", text)
            if match:
                year = int(match.group(1))
        if month is None and _has_keyword(header, month_keywords):
            match = re.search(r"\b(1[0-2]|0?[1-9])\b", text)
            if match:
                month = int(match.group(1))
        if _has_keyword(header, date_keywords):
            match = re.search(r"(20\d{2}|19\d{2})[-./년\s]?(0?[1-9]|1[0-2])?", text)
            if match:
                year = year or int(match.group(1))
                if match.group(2):
                    month = month or int(match.group(2))

    return year, month


def _year_from_header(header):
    match = re.search(r"(20\d{2}|19\d{2})", str(header or ""))
    return int(match.group(1)) if match else None


def _build_performance_summary(headers, rows):
    analysis_rows = [row for row in rows if not _is_total_row(row)]
    numeric_cols = _numeric_column_indices(headers, analysis_rows)
    sales_words = ["매출", "청구", "수입", "운송수입", "공급가", "운임"]
    purchase_words = ["매입", "원가", "비용", "지급", "외주", "운송비", "정산"]
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
    poll_seconds = _env_int("ASAN_PERFORMANCE_SYNC_POLL_SECONDS", 300, 60)
    quiet_seconds = _env_int("ASAN_PERFORMANCE_SYNC_QUIET_SECONDS", 10, 0)
    retry_seconds = _env_int("ASAN_PERFORMANCE_SYNC_RETRY_SECONDS", 180, 30)
    sync_gate = StableFileSyncGate(quiet_seconds=quiet_seconds, retry_seconds=retry_seconds)
    sync_state_lock = threading.Lock()
    sync_state = {
        "running": False,
        "started_at": None,
        "finished_at": None,
        "last_error": None,
        "last_result": None,
    }

    def _sync_status():
        with sync_state_lock:
            return dict(sync_state)

    def _attach_sync_status(data):
        payload = dict(data or {})
        payload["sync_status"] = _sync_status()
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
            })

        def runner():
            result = None
            error = None
            try:
                result = _sync(force=force, rel_path=rel_path, sheet_name=sheet_name, header_row=header_row)
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

    def _sync(force=False, rel_path=None, sheet_name=DEFAULT_ASAN_ANNUAL_PERFORMANCE_SHEET, header_row=None):
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

            cache[normalized_path] = {"mtime": mtime_ts, "data": {**parsed, "summary": summary, "file_modified_at": file_modified_at}}
            sync_gate.mark_synced(normalized_path, file_signature)
            state["last_sync_error"] = None
            gc.collect()
            app.logger.info(
                f"[연간실적DB] 동기화 완료: {normalized_path} "
                f"({len(rows)}행, 신규/변경 {len(insert_payload)}행, 유지 {unchanged_count}행, 종료 {superseded_count + removed_count}행)"
            )
            return {
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
        except Exception as exc:
            if "branch_performance_" in str(exc) or "relation" in str(exc).lower():
                state["db_available"] = False
                state["last_sync_error"] = "Supabase branch_performance 테이블을 찾을 수 없습니다. migration 적용 후 컨테이너를 재시작하세요."
                app.logger.warning("[연간실적DB] Supabase 테이블이 없어 동기화를 비활성화합니다. migration 적용 후 컨테이너를 재시작하세요.")
            else:
                state["last_sync_error"] = str(exc)
                app.logger.error(f"[연간실적DB] 동기화 실패: {exc}", exc_info=True)
            return None

    def _query(rel_path=None, sheet_name=DEFAULT_ASAN_ANNUAL_PERFORMANCE_SHEET, page=1, page_size=500, search="", sort_key="", sort_dir="asc"):
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
        if len(terms) == 1:
            q = q.ilike("search_text", f"%{_search_filter_value(terms[0])}%")
        elif terms:
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

    threading.Thread(target=_scheduler, daemon=True).start()

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

                if run_async:
                    started = _start_background_sync(rel_path, sheet_name, header_row, bool(force))
                    db_data = _query(
                        rel_path=rel_path,
                        sheet_name=sheet_name,
                        page=body.get("page") or request.args.get("page", 1),
                        page_size=body.get("page_size") or request.args.get("page_size", 500),
                        search=(body.get("search") or request.args.get("search") or "").strip(),
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
            summary = _build_performance_summary(parsed["headers"], parsed["data"])
            data = {
                **parsed,
                "summary": summary,
                "file_modified_at": datetime.fromtimestamp(mtime, tz=kst).isoformat(),
                "source": "excel-cache",
                "total": len(parsed["data"]),
                "page": 1,
                "page_size": len(parsed["data"]),
            }
            cache[normalized_path] = {"mtime": mtime, "data": data}
            return jsonify({"data": _attach_sync_status(data)})
        except Exception as exc:
            app.logger.error(f"연간실적 처리 오류: {exc}", exc_info=True)
            return jsonify({"error": str(exc)}), 500
