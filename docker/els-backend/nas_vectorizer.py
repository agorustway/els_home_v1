import os
import hashlib
import logging
from pathlib import Path
from datetime import datetime, timezone
import time
import openpyxl
import fitz  # PyMuPDF
from docx import Document
import pytesseract
from PIL import Image
import textract
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

# chunking params
MAX_CHUNK_SIZE = 800
CHUNK_OVERLAP = 150

# Supported extensions mapping to type
SUPPORTED_EXTS = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".doc": "doc",
    ".xlsx": "xlsx",
    ".xlsm": "xlsx",
    ".txt": "txt",
    ".hwp": "hwp",
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
    ".gif": "image",
}

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

def process_nas_directory(supabase, raw_dir, branch_name="NAS자료"):
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
    
    # 먼저 전체 파일 목록을 확보해서 개수를 파악 (형에게 알려주기 위함)
    all_target_files = []
    print(f"[VECTORIZE] {branch_name} ({target_dir}) 탐색 중...")
    for root, dirs, files in os.walk(str(target_dir)):
        # 파싱 로직과 일관된 스킵 적용
        skip_words = ["#recycle", "@eaDir", "보안", "RESTRICTED", "PRIVATE", "자료실"]
        is_skip_dir = any(word in root for word in skip_words)
        if not is_skip_dir and "아산지점" in root:
            asan_skips = ["E_임직원캐비넷", "G_Downloads", "F_Backup"]
            if any(sub in root for sub in asan_skips):
                is_skip_dir = True
        
        if is_skip_dir: continue

        for file in files:
            filepath = Path(root) / file
            # 확장자 및 사이즈 체크 동일 적용
            if filepath.suffix.lower() in SUPPORTED_EXTS:
                try:
                    if filepath.stat().st_size <= 50 * 1024 * 1024:
                        all_target_files.append(filepath)
                except:
                    all_target_files.append(filepath)
        # 디렉터리 목록 로깅 (디버그용)
        if not dirs and root == str(target_dir):
            print(f"[DEBUG] {root} 에 하위 디렉토리가 없습니다.")
        elif root == str(target_dir):
            print(f"[DEBUG] {root} 내부 디렉토리: {dirs}")
    
    total_to_process = len(all_target_files)
    print(f"[VECTORIZE] {branch_name}: 총 {total_to_process}개의 대상 파일을 찾았습니다. 인덱싱 시작...")

    # walk를 사용하여 더 안정적으로 탐색
    for root, dirs, files in os.walk(str(target_dir)):
        # 불필요한 폴더 스킵 (#recycle, 보안, @eaDir, 자료실 등)
        # 아산지점 내 특정 하위폴더 제외: E_임직원캐비넷, G_Downloads, F_Backup
        skip_words = ["#recycle", "@eaDir", "보안", "RESTRICTED", "PRIVATE", "자료실"]
        
        # root 경로에 skip_words가 포함되거나, 아산지점 내 특정 폴더인 경우 스킵
        is_skip_dir = any(word in root for word in skip_words)
        if not is_skip_dir and "아산지점" in root:
            asan_skips = ["E_임직원캐비넷", "G_Downloads", "F_Backup"]
            if any(sub in root for sub in asan_skips):
                is_skip_dir = True
        
        if is_skip_dir:
            skipped += len(files)
            continue

        for file in files:
            filepath = Path(root) / file
            
            ext = filepath.suffix.lower()
            # .eml, .msg 등 이메일 파일은 SUPPORTED_EXTS에 없어 자동 제외됨
            if ext not in SUPPORTED_EXTS:
                continue
            
            # 대용량 파일 스킵 (20MB 초과) - 토큰 및 메모리 보호
            try:
                if filepath.stat().st_size > 50 * 1024 * 1024:
                    logger.warning(f"⏩ [SKIP] 대용량 파일(50MB 초과) 제외: {file}")
                    skipped += 1
                    continue
            except: pass
                
            file_path_str = str(filepath.resolve())
            filename = filepath.name
            
            try:
                size_bytes = filepath.stat().st_size
                modified_ts = datetime.fromtimestamp(filepath.stat().st_mtime, tz=timezone.utc)
                current_hash = get_file_hash(file_path_str)

                # DB 확인 (nas_file_index)
                res = supabase.table("nas_file_index").select("content_hash, is_indexed").eq("path", file_path_str).execute()
                if res.data and len(res.data) > 0:
                    row = res.data[0]
                    if row.get("content_hash") == current_hash and row.get("is_indexed"):
                        skipped += 1
                        continue
            except Exception as e:
                logger.error(f"File access error {filename}: {e}")
                error_cnt += 1
                continue

            # 추출
            text = ""
            try:
                if ext == ".pdf":
                    text = extract_text_pypdf(file_path_str)
                elif ext == ".docx":
                    text = extract_text_docx(file_path_str)
                elif ext == ".xlsx" or ext == ".xlsm":
                    text = extract_text_xlsx(file_path_str)
                elif ext == ".txt":
                    try:
                        with open(file_path_str, "r", encoding="utf-8") as f:
                            text = f.read()
                    except UnicodeDecodeError:
                        with open(file_path_str, "r", encoding="euc-kr") as f:
                            text = f.read()
                elif ext in [".png", ".jpg", ".jpeg", ".gif"]:
                    # 이미지 OCR
                    try:
                        image = Image.open(file_path_str)
                        text = pytesseract.image_to_string(image, lang='kor+eng')
                    except Exception as e:
                        logger.error(f"Image OCR failed for {filename}: {e}")
                        text = ""
                elif ext == ".doc":
                    # .doc 파일 처리 (textract)
                    try:
                        text = textract.process(file_path_str).decode('utf-8', errors='ignore')
                    except Exception as e:
                        logger.error(f"DOC extraction failed for {filename}: {e}")
                        text = ""
                elif ext == ".hwp":
                    logger.info(f"⏩ [{branch_name}] .hwp 파일은 현재 텍스트 추출을 지원하지 않아 스킵합니다: {filename}")
                    skipped += 1
                    # 인덱스에는 기록하여 다음 스캔 시 반복 로깅 방지 (Supabase upsert)
                    try:
                        supabase.table("nas_file_index").upsert({
                            "path": file_path_str, "filename": filename, "extension": ext,
                            "branch": branch_name, "is_indexed": True, "chunk_count": 0,
                            "content_hash": current_hash,
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        }, on_conflict="path").execute()
                    except: pass
                    continue
            except Exception as e:
                logger.error(f"Extraction failed for {filename}: {e}")
                error_cnt += 1
                continue
            
            if not text.strip():
                logger.warning(f"⚠️ [{branch_name}] {filename}에서 추출된 텍스트가 비어있습니다. (스킵 처리)")
                # 텍스트가 없는 파일도 일단 '인덱싱 시도함'으로 기록 (무한루프 방지)
                try:
                    supabase.table("nas_file_index").upsert({
                        "path": file_path_str, "filename": filename, "extension": ext,
                        "branch": branch_name, "is_indexed": True, "chunk_count": 0,
                        "content_hash": current_hash,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }, on_conflict="path").execute()
                except: pass
                continue

            # 청킹
            chunks = chunk_text(text)
            
            # 이전 청크 삭제
            try:
                supabase.table("document_chunks").delete().eq("source_id", file_path_str).execute()
            except:
                pass

            # 임베딩 & 배치 Insert
            chunk_batch = []
            valid_chunk_count = 0
            
            for i, chunk in enumerate(chunks):
                if not chunk.strip():
                    continue
                
                try:
                    time.sleep(0.5)  # API Rate Limit 방어를 위한 휴식
                    # 최신 모델 시도 후 실패 시 범용 모델로 폴백
                    try:
                        emb_res = client.models.embed_content(
                            model='models/text-embedding-004',
                            contents=chunk,
                        )
                    except Exception as e:
                        logger.warning(f"text-embedding-004 failed, falling back to embedding-001: {e}")
                        emb_res = client.models.embed_content(
                            model='models/embedding-001',
                            contents=chunk,
                        )
                    
                    embedding = emb_res.embeddings[0].values
                    
                    chunk_batch.append({
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
                    })
                    valid_chunk_count += 1
                    
                    # 10개 단위로 끊어서 인서트 (메모리 및 DB 부하 조절)
                    if len(chunk_batch) >= 10:
                        supabase.table("document_chunks").insert(chunk_batch).execute()
                        chunk_batch = []
                except Exception as e:
                    logger.error(f"Embedding/Insert failed for chunk {i} of {filename}: {e}")
                    time.sleep(5)  # 에러 발생 시(Quota 등) 5초 휴식

            # 남은 청크 마지막으로 인서트
            if chunk_batch:
                try:
                    supabase.table("document_chunks").insert(chunk_batch).execute()
                except Exception as e:
                    logger.error(f"Final batch insert failed for {filename}: {e}")
                    
            # 성공 여부 판별 (청크가 있는데 하나도 통과 못했거나 중간에 실패했다면 재시도 대상)
            is_success = True
            if len(chunks) > 0 and valid_chunk_count < len(chunks):
                is_success = False

            # index 업데이트
            index_data = {
                "path": file_path_str,
                "filename": filename,
                "extension": ext,
                "size_bytes": size_bytes,
                "branch": branch_name,
                "last_modified": modified_ts.isoformat(),
                "content_hash": current_hash,
                "is_indexed": is_success,
                "chunk_count": valid_chunk_count,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            
            try:
                res = supabase.table("nas_file_index").upsert(index_data, on_conflict="path").execute()
                processed += 1
                if processed % 10 == 0:
                    logger.info(f"▶️ [{branch_name}] {processed}개 처리 중... (Skip: {skipped}, Err: {error_cnt})")
            except Exception as e:
                logger.error(f"Index update failed for {filename}: {e}")
                error_cnt += 1

    logger.info(f"🎉 [{branch_name}] 작업 완료! (처리: {processed}, 스킵: {skipped}, 에러: {error_cnt})")
    return {"processed": processed, "skipped": skipped, "errors": error_cnt}

