import os
import hashlib
import logging
import tempfile
from datetime import datetime, timezone
import time
import requests
from supabase import create_client, Client
from pathlib import Path

# Import parsing tools from existing nas_vectorizer
from nas_vectorizer import (
    extract_text_pypdf,
    extract_text_docx,
    extract_text_hwpx,
    extract_sheets_xlsx,
    chunk_text,
    supabase_retry_execute,
    MAX_CHUNK_SIZE,
    CHUNK_OVERLAP,
    SUPPORTED_EXTS
)
import pytesseract
from PIL import Image
import textract

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

def get_buffer_hash(buffer):
    hash_md5 = hashlib.md5()
    hash_md5.update(buffer)
    return hash_md5.hexdigest()

def process_table(table_name):
    logger.info(f"🔍 [{table_name}] 게시판 첨부파일 검색 중...")
    try:
        # attachments 필드가 비어있지 않은 항목 조회
        res = supabase.table(table_name).select("id, title, attachments").not_.is_("attachments", "null").execute()
        records = res.data
        if not records:
            logger.info(f"✅ [{table_name}] 처리할 게시물이 없습니다.")
            return

        logger.info(f"✅ [{table_name}] 총 {len(records)}개의 게시물을 확인합니다.")
    except Exception as e:
        logger.error(f"❌ DB 조회 실패: {e}")
        return

    for rec in records:
        post_id = rec.get("id")
        post_title = rec.get("title", "Unknown")
        attachments = rec.get("attachments", [])

        if not attachments:
            continue

        for att in attachments:
            key = att.get("key")
            filename = att.get("name", "")
            if not key or not filename:
                continue

            ext = os.path.splitext(filename)[1].lower()
            if ext not in SUPPORTED_EXTS:
                continue

            # 중복 체크
            source_id = f"web::{table_name}::{key}"
            existing = supabase.table("document_chunks").select("id").eq("source_id", source_id).limit(1).execute()
            if existing.data:
                # 이미 벡터화됨 (단순 처리를 위해 해시가 변경되었는지는 여기서는 패스. 게시물 첨부파일은 보통 수정되지 않고 새로 올라감)
                continue

            logger.info(f"⚙️ 다운로드 및 파싱 시작: {filename} (게시물: {post_title})")
            
            # S3 API를 통해 파일 다운로드
            download_url = f"{SITE_URL}/api/s3/files?key={key}"
            try:
                resp = requests.get(download_url, timeout=30)
                if resp.status_code != 200:
                    logger.error(f"❌ 다운로드 실패: HTTP {resp.status_code} ({download_url})")
                    continue
                file_buffer = resp.content
            except Exception as e:
                logger.error(f"❌ 다운로드 에러: {e}")
                continue

            current_hash = get_buffer_hash(file_buffer)

            # 임시 파일로 저장 후 파싱 (라이브러리 호환성)
            with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as temp_file:
                temp_file.write(file_buffer)
                temp_filepath = temp_file.name

            try:
                total_new_chunks = 0
                if ext in [".xlsx", ".xlsm"]:
                    sheets = extract_sheets_xlsx(temp_filepath)
                    if not sheets: continue
                    
                    for s in sheets:
                        s_name = s["name"]
                        s_hash = s["hash"]
                        s_text = s["text"]

                        chunks = chunk_text(s_text)
                        chunk_batch = []
                        for idx, chunk in enumerate(chunks):
                            if not chunk.strip(): continue
                            
                            time.sleep(0.4)
                            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key={GEMINI_API_KEY}"
                            payload = {
                                "model": "models/gemini-embedding-001",
                                "content": {"parts": [{"text": chunk}]},
                                "outputDimensionality": 768
                            }
                            
                            r = requests.post(url, json=payload, timeout=10)
                            if r.status_code == 200:
                                embedding = r.json()['embedding']['values']
                                chunk_batch.append({
                                    "source_type": "web_attachment",
                                    "source_id": source_id,
                                    "source_version": current_hash,
                                    "chunk_index": idx,
                                    "content": chunk,
                                    "metadata": {
                                        "filename": filename, 
                                        "branch": f"웹자료실({table_name})", 
                                        "extension": ext,
                                        "sheet_name": s_name,
                                        "sheet_hash": s_hash,
                                        "post_title": post_title
                                    },
                                    "embedding": embedding
                                })
                            
                            if len(chunk_batch) >= 10:
                                supabase_retry_execute(lambda: supabase.table("document_chunks").insert(chunk_batch))
                                total_new_chunks += len(chunk_batch)
                                chunk_batch = []
                        
                        if chunk_batch:
                            supabase_retry_execute(lambda: supabase.table("document_chunks").insert(chunk_batch))
                            total_new_chunks += len(chunk_batch)

                else:
                    text = ""
                    if ext == ".pdf":
                        text = extract_text_pypdf(temp_filepath)
                    elif ext == ".docx":
                        text = extract_text_docx(temp_filepath)
                    elif ext == ".txt":
                        try:
                            with open(temp_filepath, "r", encoding="utf-8") as f: text = f.read()
                        except:
                            with open(temp_filepath, "r", encoding="euc-kr") as f: text = f.read()
                    elif ext in [".png", ".jpg", ".jpeg", ".gif"]:
                        image = None
                        try:
                            image = Image.open(temp_filepath)
                            text = pytesseract.image_to_string(image, lang='kor+eng')
                        finally:
                            if image: image.close()
                    elif ext == ".doc":
                        try:
                            text = textract.process(temp_filepath).decode('utf-8', errors='ignore')
                        except:
                            pass
                    elif ext == ".hwpx":
                        text = extract_text_hwpx(temp_filepath)

                    if text.strip():
                        chunks = chunk_text(text)
                        chunk_batch = []
                        for idx, chunk in enumerate(chunks):
                            if not chunk.strip(): continue
                            
                            time.sleep(0.4)
                            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key={GEMINI_API_KEY}"
                            payload = {
                                "model": "models/gemini-embedding-001",
                                "content": {"parts": [{"text": chunk}]},
                                "outputDimensionality": 768
                            }
                            
                            r = requests.post(url, json=payload, timeout=10)
                            if r.status_code == 200:
                                embedding = r.json()['embedding']['values']
                                chunk_batch.append({
                                    "source_type": "web_attachment",
                                    "source_id": source_id,
                                    "source_version": current_hash,
                                    "chunk_index": idx,
                                    "content": chunk,
                                    "metadata": {
                                        "filename": filename, 
                                        "branch": f"웹자료실({table_name})", 
                                        "extension": ext,
                                        "post_title": post_title
                                    },
                                    "embedding": embedding
                                })
                            
                            if len(chunk_batch) >= 10:
                                supabase_retry_execute(lambda: supabase.table("document_chunks").insert(chunk_batch))
                                total_new_chunks += len(chunk_batch)
                                chunk_batch = []
                        
                        if chunk_batch:
                            supabase_retry_execute(lambda: supabase.table("document_chunks").insert(chunk_batch))
                            total_new_chunks += len(chunk_batch)
                
                logger.info(f"✅ {filename} 처리 완료 (새로운 청크: {total_new_chunks}개)")

            except Exception as e:
                logger.error(f"❌ 파싱/벡터화 에러 ({filename}): {e}")
            finally:
                # 임시 파일 삭제
                if os.path.exists(temp_filepath):
                    os.remove(temp_filepath)


def process_web_attachments():
    if not supabase:
        logger.error("❌ Supabase 클라이언트가 초기화되지 않았습니다.")
        return False
    logger.info("🚀 웹 게시판 첨부파일 벡터화 시작...")
    process_table("posts")
    process_table("work_docs")
    logger.info("🎉 모든 작업이 완료되었습니다.")
    return True

if __name__ == "__main__":
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("❌ Supabase 환경변수가 없습니다.")
        exit(1)
    init_supabase(create_client(SUPABASE_URL, SUPABASE_KEY))
    process_web_attachments()
