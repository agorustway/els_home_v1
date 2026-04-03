import os
import sys
import json
import threading
import logging
import pandas as pd
import io
import re
from pathlib import Path
from datetime import datetime, timedelta, timezone
from flask import Flask, request, jsonify, Response, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename
from supabase import create_client, Client
from urllib.request import urlopen

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

# --- [v4.5.1] 아산지점 배차판 자동 동기화 로직 ---
def sync_asan_dispatch_python():
    if not supabase: return
    try:
        app.logger.info("[자동동기화] 아산 배차판 동기화 시작...")
        res = supabase.from_("branch_dispatch_settings").select("*").eq("branch_id", "asan").single().execute()
        settings = res.data
        if not settings:
            app.logger.error("[자동동기화] 설정을 찾을 수 없습니다.")
            return

        for dtype in ['glovis', 'mobis']:
            rel_path = settings.get(f"{dtype}_path")
            if not rel_path: continue
            
            full_path = Path("/app/data") / rel_path.lstrip("/")
            app.logger.info(f"[자동동기화] 대상 파일 체크: {full_path}")
            if not full_path.exists():
                app.logger.warning(f"[자동동기화] 파일을 찾을 수 없음: {full_path}")
                continue
            
            mtime = datetime.fromtimestamp(full_path.stat().st_mtime, tz=KST).isoformat()
            xl = pd.ExcelFile(full_path)
            sync_count = 0
            supabase.from_("branch_dispatch").delete().eq("branch_id", "asan").eq("type", dtype).execute()

            for sheet_name in xl.sheet_names:
                match = re.search(r'(\d+)\.(\d+)', sheet_name)
                if not match: continue
                m, d = int(match.group(1)), int(match.group(2))
                now = datetime.now(KST)
                year = now.year
                target_date = f"{year}-{m:02d}-{d:02d}"
                
                df = pd.read_excel(xl, sheet_name=sheet_name, header=None)
                header_idx = -1
                for i, row in df.head(10).iterrows():
                    if row.astype(str).str.contains('구분').any():
                        header_idx = i
                        break
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
                    "headers": headers, "data": rows, "comments": {},
                    "file_modified_at": mtime, "updated_at": now.isoformat()
                }).execute()
                sync_count += 1
            app.logger.info(f"[자동동기화] {dtype} 동기화 완료 ({sync_count} 시트)")
    except Exception as e:
        app.logger.error(f"[자동동기화] 오류: {e}")

def asan_sync_scheduler():
    app.logger.info("[스케줄러] 아산 동기화 스케줄러 시작 (06-23시, 30분 간격)")
    last_run_min = -1
    while True:
        try:
            now = datetime.now(KST)
            if now.weekday() < 5 and 6 <= now.hour <= 23:
                if now.minute in [0, 30] and now.minute != last_run_min:
                    app.logger.info(f"[스케줄러] 정기 동기화 시점 ({now.hour:02d}:{now.minute:02d})")
                    sync_asan_dispatch_python()
                    last_run_min = now.minute
            time.sleep(60)
        except Exception as e:
            app.logger.error(f"[스케줄러] 루프 오류: {e}")
            time.sleep(60)

threading.Thread(target=asan_sync_scheduler, daemon=True).start()

# --- API 엔드포인트 ---
@app.route("/health", methods=["GET"])
def health(): return jsonify({"status": "ok", "service": "els-core"})

@app.route("/api/logs", methods=["POST"])
def post_log():
    if not supabase: return jsonify({"error": "No Supabase"}), 500
    try:
        data = request.json or {}
        meta = data.get("metadata", {})
        supabase.from_("user_activity_logs").insert({
            "user_id": meta.get("user_id"),
            "user_email": data.get("user_email") or data.get("email", "anonymous"),
            "action_type": data.get("action_type") or data.get("type", "PAGE_VIEW"),
            "path": data.get("path", "/"),
            "metadata": meta
        }).execute()
        return jsonify({"ok": True})
    except Exception as e: return jsonify({"error": str(e)}), 500

@app.route("/api/vehicle-tracking/photos/view", methods=["GET"])
def view_photo():
    key = request.args.get("key")
    if not key: return "Key missing", 400
    try:
        photo_url = f"{SUPABASE_URL}/storage/v1/object/public/vehicle-photos/{key}"
        return Response(urlopen(photo_url).read(), mimetype="image/jpeg")
    except Exception as e: return str(e), 500

@app.route("/api/nas/files", methods=["POST"])
def upload_nas_file():
    if "file" not in request.files: return jsonify({"error": "No file"}), 400
    f = request.files["file"]
    rel_path = request.form.get("path", "/uploads")
    save_dir = Path("/app/data") / rel_path.strip("/")
    save_dir.mkdir(parents=True, exist_ok=True)
    fname = secure_filename(f.filename)
    save_path = save_dir / fname
    f.save(str(save_path))
    return jsonify({"success": True, "path": str(rel_path.strip("/") + "/" + fname)})

@app.route("/api/nas/files", methods=["GET"])
def download_nas_file():
    rel_path = request.args.get("path")
    if not rel_path: return "Path missing", 400
    full_path = Path("/app/data") / rel_path.strip("/")
    if not full_path.exists(): return "Not found", 404
    return send_file(str(full_path), as_attachment=True)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=2930, threaded=True)
