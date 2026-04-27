"""
웹 게시판 첨부파일 벡터화 모듈 (v5.9.3)

게시판(posts) 및 자료실(work_docs) 테이블의 첨부파일을 
S3(MinIO)에서 다운로드하여 벡터화하고 document_chunks에 저장한다.
nas_vectorizer의 공용 함수(extract_text_by_ext, embed_and_store_chunks)를 재사용한다.
"""
import os
import hashlib
import logging
import tempfile
from datetime import datetime
import requests
from supabase import create_client, Client

from nas_vectorizer import (
    extract_text_by_ext,
    extract_sheets_xlsx,
    chunk_text,
    embed_and_store_chunks,
    supabase_retry_execute,
    SUPPORTED_EXTS,
)

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

# --- 설정 ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
SITE_URL = os.environ.get("NEXT_PUBLIC_SITE_URL", "https://nollae.com")

supabase: Client = None


def init_supabase(client: Client):
    global supabase
    supabase = client


def _download_file(key):
    """S3 프록시 API를 통해 첨부파일을 다운로드하여 바이트 버퍼를 반환한다."""
    download_url = f"{SITE_URL}/api/s3/files?key={key}"
    resp = requests.get(download_url, timeout=30)
    if resp.status_code != 200:
        raise RuntimeError(f"HTTP {resp.status_code}")
    return resp.content


def _process_attachment(table_name, post_title, key, filename):
    """단일 첨부파일을 다운로드 → 파싱 → 벡터화하는 파이프라인."""
    ext = os.path.splitext(filename)[1].lower()
    if ext not in SUPPORTED_EXTS:
        return

    source_id = f"web::{table_name}::{key}"

    # 이미 벡터화된 파일은 스킵 (게시판 첨부파일은 수정보다 신규 업로드가 대부분)
    existing = supabase.table("document_chunks").select("id").eq("source_id", source_id).limit(1).execute()
    if existing.data:
        return

    logger.info(f"⚙️ 다운로드 시작: {filename} (게시물: {post_title})")

    try:
        file_buffer = _download_file(key)
    except Exception as e:
        logger.error(f"❌ 다운로드 실패 ({filename}): {e}")
        return

    content_hash = hashlib.md5(file_buffer).hexdigest()
    base_metadata = {
        "filename": filename,
        "branch": f"웹자료실({table_name})",
        "extension": ext,
        "post_title": post_title,
    }

    # 임시 파일로 저장 (파싱 라이브러리가 파일 경로를 요구)
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(file_buffer)
        tmp_path = tmp.name

    try:
        total_stored = 0

        if ext in [".xlsx", ".xlsm"]:
            sheets = extract_sheets_xlsx(tmp_path)
            for s in (sheets or []):
                chunks = chunk_text(s["text"])
                meta = {**base_metadata, "sheet_name": s["name"], "sheet_hash": s["hash"]}
                total_stored += embed_and_store_chunks(
                    supabase, chunks,
                    source_type="web_attachment",
                    source_id=source_id,
                    source_version=content_hash,
                    metadata=meta,
                    api_key=GEMINI_API_KEY,
                )
        else:
            text = extract_text_by_ext(tmp_path, ext)
            if text and text.strip():
                chunks = chunk_text(text)
                total_stored += embed_and_store_chunks(
                    supabase, chunks,
                    source_type="web_attachment",
                    source_id=source_id,
                    source_version=content_hash,
                    metadata=base_metadata,
                    api_key=GEMINI_API_KEY,
                )

        logger.info(f"✅ {filename} 처리 완료 (청크: {total_stored}개)")
    except Exception as e:
        logger.error(f"❌ 파싱/벡터화 에러 ({filename}): {e}")
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def process_table(table_name):
    """특정 테이블의 모든 게시물에서 첨부파일을 스캔하여 벡터화."""
    logger.info(f"🔍 [{table_name}] 게시판 첨부파일 검색 중...")
    try:
        res = supabase.table(table_name).select("id, title, attachments").not_.is_("attachments", "null").execute()
        records = res.data or []
    except Exception as e:
        logger.error(f"❌ [{table_name}] DB 조회 실패: {e}")
        return

    att_count = sum(len(r.get("attachments") or []) for r in records)
    logger.info(f"✅ [{table_name}] {len(records)}개 게시물, {att_count}개 첨부파일 확인")

    for rec in records:
        for att in (rec.get("attachments") or []):
            key = att.get("key")
            filename = att.get("name", "")
            if key and filename:
                _process_attachment(table_name, rec.get("title", "Unknown"), key, filename)


def process_web_attachments():
    """메인 진입점: posts와 work_docs 테이블의 첨부파일을 모두 벡터화."""
    if not supabase:
        logger.error("❌ Supabase 클라이언트가 초기화되지 않았습니다.")
        return False
    logger.info("🚀 웹 게시판 첨부파일 벡터화 시작...")
    process_table("posts")
    process_table("work_docs")
    logger.info("🎉 웹 첨부파일 벡터화 완료!")
    return True


if __name__ == "__main__":
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("❌ Supabase 환경변수가 없습니다.")
        exit(1)
    init_supabase(create_client(SUPABASE_URL, SUPABASE_KEY))
    process_web_attachments()
