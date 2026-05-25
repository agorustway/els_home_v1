export const AI_ASSISTANT_VERSION = 'v5.14.211';
export const AI_ASSISTANT_NAME = 'ELS AI 엘스';

export function getAiAssistantVersion() {
  return AI_ASSISTANT_VERSION;
}

export function getAiAssistantSubtitle() {
  return 'DB-Centered RAG · Web Knowledge Link';
}

export function getAiAssistantIntroMessage() {
  return [
    `안녕하세요! ${AI_ASSISTANT_NAME}(${AI_ASSISTANT_VERSION})입니다.`,
    '',
    '현재는 Supabase에 누적된 사내 DB와 웹사이트 등록 자료를 기준으로 답변합니다.',
    '아산 배차판·상세배차·변동내역·GLAPS코드·선적관리·실적관리는 Supabase 운영 DB와 화면 도출항목을 읽어 답변합니다.',
    '',
    '안전운임, 컨테이너 이력, 차량 관제, 사내 게시글, 업무자료실, 연락처, 작업지, 날씨, 유가, 법령까지 연결해서 확인합니다.',
    '이미지나 NAS 원본 파일을 직접 파싱한다고 말하지 않고, DB에 저장되거나 색인된 자료 기준으로 답합니다.',
  ].join('\n');
}

export function getAiQuickPrompts() {
  return [
    { label: '오늘 아산 배차 총 몇 대야?', icon: null },
    { label: '내일 13시 부산 배차 어느 업체 몇 대야?', icon: null },
    { label: 'CMAU7631738 이력 조회', icon: null },
    { label: '부산 신항 40ft 안전운임', icon: null },
    { label: '업무자료실 최근 자료 요약해줘', icon: null },
  ];
}

export function getAiAssistantGuideSections() {
  return [
    {
      title: '아산 배차판 DB 조회',
      description: 'Supabase 운영 DB를 기준으로 배차판, 상세배차, 변동내역, GLAPS코드를 함께 읽습니다.',
      examples: [
        '오늘 아산 배차 총 몇 대야?',
        '내일 13시 부산 배차 어느 업체 몇 대야?',
        '모비스 아산 상차지별 배차 수량 알려줘',
        '내일 GLAPS 경로확인 안되는 작업지 어디야?',
        '내일 상세배차 GLAPS 코드 누락 뭐야?',
        '내일 배차변동내역 알려줘',
      ],
    },
    {
      title: '아산 선적관리 DB 조회',
      description: 'branch_shipping_files/rows에 누적된 선적관리 행과 컨테이너 이력 조회 결과를 검색합니다.',
      examples: [
        'CMAU7631738 선적관리에서 찾아줘',
        '아산 선적관리 미선적 컨테이너 알려줘',
      ],
    },
    {
      title: '아산 실적관리 DB 조회',
      description: '종합실적, 월간실적, 연간실적 화면의 도출항목과 요약 스냅샷으로 마감 금액과 이익을 확인합니다.',
      examples: [
        '이번달 마감 이익 어때?',
        '아산 실적관리 이익률 점검 항목 알려줘',
        '연간실적 매출 이익 흐름 요약해줘',
      ],
    },
    {
      title: '사내 웹/DB 자료 검색',
      description: '게시판, 업무자료실, 연락처, 작업지, 웹 첨부문서 색인에서 확인된 내용을 찾아 요약합니다.',
      examples: [
        '업무자료실 최근 자료 요약해줘',
        '사내 게시판에서 안전 관련 공지 찾아줘',
        '작업지 주소와 메모 찾아줘',
      ],
    },
    {
      title: '안전운임 및 물류 관제',
      description: '안전운임 공식 데이터, 컨테이너 이력, 차량 운행 DB를 연결합니다.',
      examples: [
        '아산 부산 40ft 안전운임 얼마야?',
        'CMAU7631738 컨테이너 이력 조회',
        '오늘 0140 차량 종료 위치 어디야?',
      ],
    },
    {
      title: '외부 실시간 연결',
      description: '날씨, 미세먼지, 유가, 법령 검색을 물류 판단에 필요한 맥락으로 붙입니다.',
      examples: [
        '내일 아산 날씨와 배차 주의사항 알려줘',
        '최근 경유가 기준으로 운임 영향 정리해줘',
        '과태료 감경 규정 찾아줘',
      ],
    },
  ];
}

export function getAiSystemCapabilitySummary() {
  return [
    '## 현재 ELS AI 실제 연결 범위',
    '- 사내 DB: 연락처, 게시글/업무보고, 작업지, 업무자료실, 차량 운행/위치, 아산 배차판/상세배차/변동내역/GLAPS/선적관리/실적관리.',
    '- 사내 웹 문서: document_chunks 중 source_type=web_attachment로 색인된 웹 게시판/업무자료실 첨부문서.',
    '- 물류 외부 연동: 안전운임 공식 JSON/고시 원문, 컨테이너 이력 봇, OPINET 유가, K-SKILL 미세먼지, K-Law 법령.',
    '- 아산 운영 DB: 날짜/시간/상차지역/업체명 질문을 동적으로 해석하고, 상세배차/변동내역/GLAPS코드/선적관리/실적관리도 DB 기준으로 검색한다.',
    '- 실적관리: 원장 전체를 프롬프트에 넣지 않고 종합실적·월간실적·연간실적 화면의 도출항목/요약 스냅샷을 재사용한다.',
    '- 현재 제외: 이미지 파일 자체 분석, 색인되지 않은 NAS 원본 파일 직접 파싱, DB로 주입되지 않은 선적/실적 원본 추정.',
  ].join('\n');
}
