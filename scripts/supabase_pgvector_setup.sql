-- ============================================================
-- ELS Omni-Agent Phase 2: pgvector 기반 문서 벡터 검색 시스템
-- Supabase SQL Editor에서 실행 (1회)
-- ============================================================

-- 1. pgvector 확장 활성화 (Supabase는 기본 제공)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 문서 청크 벡터 테이블
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    source_type TEXT NOT NULL,          -- 'safe_freight_doc' | 'safe_freight_fare' | 'work_doc' | 'nas_file' | 'post'
    source_id TEXT,                      -- 원본 식별자 (파일 경로, post id 등)
    source_version TEXT,                 -- 고시 버전 ('2026_01차', '2026_02차')
    chunk_index INTEGER DEFAULT 0,       -- 청크 순번
    content TEXT NOT NULL,               -- 청크 텍스트 (최대 1000자)
    metadata JSONB DEFAULT '{}'::jsonb,  -- 부가 정보 (파일명, 페이지, 시트명, 거리, 금액 등)
    embedding vector(768),               -- Gemini text-embedding-004 벡터 (768차원)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 벡터 검색을 위한 인덱스 (IVFFlat — 속도/정확도 균형)
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding 
    ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 4. 소스 타입별 빠른 필터링 인덱스
CREATE INDEX IF NOT EXISTS idx_document_chunks_source 
    ON document_chunks (source_type, source_version);

-- 5. NAS 파일 인덱스 테이블 (크롤러가 어떤 파일을 처리했는지 추적)
CREATE TABLE IF NOT EXISTS nas_file_index (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,            -- NAS 파일 전체 경로
    filename TEXT NOT NULL,               -- 파일명
    extension TEXT,                       -- 확장자 (.xlsx, .pdf 등)
    size_bytes BIGINT,                    -- 파일 크기
    branch TEXT,                          -- 소속 지점 (아산지점, 서울본사 등)
    is_security BOOLEAN DEFAULT FALSE,    -- 보안 폴더 여부
    last_modified TIMESTAMPTZ,            -- 파일 최종 수정일
    content_hash TEXT,                    -- SHA-256 해시 (변경 감지용)
    is_indexed BOOLEAN DEFAULT FALSE,     -- 벡터 변환 완료 여부
    chunk_count INTEGER DEFAULT 0,        -- 생성된 청크 수
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. AI 대화 메모리 테이블 (이전에 미생성되었던 부분)
CREATE TABLE IF NOT EXISTS ai_chat_memory (
    email TEXT PRIMARY KEY,
    messages JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. 시맨틱 검색 RPC 함수 (route.js에서 호출)
CREATE OR REPLACE FUNCTION match_documents(
    query_embedding vector(768),
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 10,
    filter_source_type TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    source_type TEXT,
    source_id TEXT,
    source_version TEXT,
    content TEXT,
    metadata JSONB,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        dc.id,
        dc.source_type,
        dc.source_id,
        dc.source_version,
        dc.content,
        dc.metadata,
        1 - (dc.embedding <=> query_embedding) AS similarity
    FROM document_chunks dc
    WHERE 1 - (dc.embedding <=> query_embedding) > match_threshold
        AND (filter_source_type IS NULL OR dc.source_type = filter_source_type)
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- 8. RLS 정책 (API에서 service_role_key로 접근하므로 간단하게)
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE nas_file_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_memory ENABLE ROW LEVEL SECURITY;

-- service_role은 RLS 무시하므로 별도 정책 불필요
-- 혹시 클라이언트 직접 접근 시를 대비한 읽기 정책
CREATE POLICY "Allow authenticated read on document_chunks" 
    ON document_chunks FOR SELECT 
    USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated read on nas_file_index" 
    ON nas_file_index FOR SELECT 
    USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all on ai_chat_memory for authenticated" 
    ON ai_chat_memory FOR ALL 
    USING (auth.role() = 'authenticated');

-- ============================================================
-- 실행 완료 후 확인: SELECT count(*) FROM document_chunks;
-- 결과가 0이면 정상 (아직 데이터 미투입)
-- ============================================================
