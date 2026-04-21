-- AI 전용 지식베이스 및 커스텀 규칙 테이블 생성
CREATE TABLE IF NOT EXISTS ai_custom_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category VARCHAR(50) NOT NULL, -- 'rule', 'fact', 'feedback'
    content TEXT NOT NULL,
    author_email TEXT, -- 지식을 가르쳐준 사람의 자취
    tags TEXT[], -- ['nas', 'container', 'weather']
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 초기 규칙 및 형의 첫 가르침 삽입
INSERT INTO ai_custom_rules (category, content, author_email, tags) VALUES 
('rule', '컨테이너 조회 시 데몬 작동으로 인해 최대 30초 이상 소요될 수 있음을 항상 고지할 것.', 'hoon@elssolution.net', ARRAY['container', 'timing']),
('fact', '아산 날씨가 영하권이거나 추울 경우, 새벽 운행 차량에게 차량 예열 및 도로 결빙 주의보를 함께 안내할 것.', 'hoon@elssolution.net', ARRAY['weather', 'safety']),
('feedback', '2026년 4월 일일보고는 현재 1건(글로비스 KD 담당자 안내)만 존재하므로 데이터가 방대하다고 오답하지 말 것.', 'hoon@elssolution.net', ARRAY['report', 'error_fix']);
