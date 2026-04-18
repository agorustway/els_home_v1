import os
import hashlib
import logging
from pathlib import Path
from datetime import datetime, timezone
import openpyxl
import fitz  # PyMuPDF
from docx import Document
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

# chunking params
MAX_CHUNK_SIZE = 800
CHUNK_OVERLAP = 150

def get_file_hash(filepath):
    hash_md5 = hashlib.md5()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()

def extract_text_pypdf(filepath):
    text = ""
    try:
        doc = fitz.open(filepath)
        for page in doc:
            text += page.get_text("text") + "\n\n"
    except Exception as e:
        logger.error(f"PDF extraction failed for {filepath}: {e}")
    return text

def extract_text_docx(filepath):
    text = ""
    try:
        doc = Document(filepath)
        for para in doc.paragraphs:
            if para.text.strip():
                text += para.text + "\n"
    except Exception as e:
        logger.error(f"DOCX extraction failed for {filepath}: {e}")
    return text

def extract_text_xlsx(filepath):
    text = ""
    try:
        wb = openpyxl.load_workbook(filepath, data_only=True)
        for sheet in wb.worksheets:
            text += f"--- 시트명: {sheet.title} ---\n"
            for row in sheet.iter_rows(values_only=True):
                row_vals = [str(v).strip() for v in row if v is not None and str(v).strip()]
                if row_vals:
                    text += " | ".join(row_vals) + "\n"
    except Exception as e:
        logger.error(f"XLSX extraction failed for {filepath}: {e}")
    return text

def chunk_text(text, max_len=MAX_CHUNK_SIZE, overlap=CHUNK_OVERLAP):
    chunks = []
    start = 0
    while start < len(text):
        end = start + max_len
        chunk = text[start:end]
        chunks.append(chunk)
        start += (max_len - overlap)
    return chunks

async def process_nas_directory(supabase, raw_dir, branch_name="본사"):
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        logger.error("GEMINI_API_KEY is not set.")
        return {"error": "GEMINI_API_KEY is missing"}

    client = genai.Client(api_key=api_key)
    target_dir = Path(raw_dir)
    
    if not target_dir.exists() or not target_dir.is_dir():
        logger.error(f"Target directory {target_dir} does not exist.")
        return {"error": f"Dir {target_dir} not found"}

    processed = 0
    skipped = 0
    error_cnt = 0

    for filepath in target_dir.rglob("*"):
        if not filepath.is_file():
            continue
        
        ext = filepath.suffix.lower()
        if ext not in [".pdf", ".docx", ".xlsx", ".txt"]:
            continue
            
        file_path_str = str(filepath.resolve())
        filename = filepath.name
        size_bytes = filepath.stat().st_size
        modified_ts = datetime.fromtimestamp(filepath.stat().st_mtime, tz=timezone.utc)
        current_hash = get_file_hash(file_path_str)

        # DB 확인 (nas_file_index)
        try:
            res = supabase.table("nas_file_index").select("*").eq("path", file_path_str).execute()
            if res.data and len(res.data) > 0:
                row = res.data[0]
                if row.get("content_hash") == current_hash and row.get("is_indexed"):
                    logger.info(f"Skipping unmodified file: {filename}")
                    skipped += 1
                    continue
        except Exception as e:
            logger.error(f"DB Error checking file {filename}: {e}")

        # 추출
        logger.info(f"Extracting {filename} ...")
        text = ""
        if ext == ".pdf":
            text = extract_text_pypdf(file_path_str)
        elif ext == ".docx":
            text = extract_text_docx(file_path_str)
        elif ext == ".xlsx":
            text = extract_text_xlsx(file_path_str)
        elif ext == ".txt":
            try:
                with open(file_path_str, "r", encoding="utf-8") as f:
                    text = f.read()
            except UnicodeDecodeError:
                with open(file_path_str, "r", encoding="euc-kr") as f:
                    text = f.read()
        
        if not text.strip():
            logger.warning(f"Empty text for {filename}")
            error_cnt += 1
            continue

        # 청킹
        chunks = chunk_text(text)
        
        # 이전 청크 삭제
        try:
            supabase.table("document_chunks").delete().eq("source_id", file_path_str).execute()
        except:
            pass

        # 임베딩 & Upsert
        chunk_count = 0
        for i, chunk in enumerate(chunks):
            if not chunk.strip():
                continue
            
            try:
                emb_res = client.models.embed_content(
                    model='text-embedding-004',
                    contents=chunk,
                )
                embedding = emb_res.embeddings[0].values
                
                chunk_data = {
                    "source_type": "nas_file",
                    "source_id": file_path_str,
                    "source_version": modified_ts.strftime('%Y-%m-%d'),
                    "chunk_index": i,
                    "content": chunk,
                    "metadata": {
                        "filename": filename,
                        "branch": branch_name,
                        "extension": ext
                    },
                    "embedding": embedding
                }
                supabase.table("document_chunks").insert(chunk_data).execute()
                chunk_count += 1
            except Exception as e:
                logger.error(f"Embedding failed for chunk {i} of {filename}: {e}")

        # index 업데이트
        index_data = {
            "path": file_path_str,
            "filename": filename,
            "extension": ext,
            "size_bytes": size_bytes,
            "branch": branch_name,
            "last_modified": modified_ts.isoformat(),
            "content_hash": current_hash,
            "is_indexed": True,
            "chunk_count": chunk_count,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        try:
            # upsert manually if eq gives none? Just delete and insert
            res = supabase.table("nas_file_index").select("id").eq("path", file_path_str).execute()
            if res.data and len(res.data) > 0:
                supabase.table("nas_file_index").update(index_data).eq("path", file_path_str).execute()
            else:
                supabase.table("nas_file_index").insert(index_data).execute()
            processed += 1
        except Exception as e:
            logger.error(f"Index update failed for {filename}: {e}")
            error_cnt += 1

    return {"processed": processed, "skipped": skipped, "errors": error_cnt}
