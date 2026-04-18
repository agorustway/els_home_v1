# 안전운임 고시 및 관련 데이터 업데이트 정책 (Safe Freight Data Policy)

## 1. 개요
본 문서는 ELS 솔루션 내 **안전운임 관련 고시**, **운임단가표**, 그리고 **법규 전문**이 향후 차수별(예: 2026_01차, 2026_02차 등)로 추가/업데이트될 때 시스템(UI 조회 및 AI 어시스턴트)에 어떻게 통합/반영할 것인지에 대한 표준 정책을 정의합니다.

ELS 솔루션의 안전운임 데이터는 **"투-트랙(Dual-Track)"**으로 관리됩니다.
1. **정량적 운임 단가(순수 조회용)**: `work-docs/안전운임조회.xlsx` 엑셀 기반 JSON 변환
2. **정성적 규정/고시 전문(AI 컨텍스트 및 확인용)**: `work-docs/안전운임_YYYY_XX차/` 디렉터리의 원본 PDF 기반 JSON 변환

---

## 2. 정량 데이터 업데이트 (순수 운임 조회용)
화면상의 "안전운임 조회(구간/거리별)" 계산기에 사용되는 실제 금액(단가) 데이터 처리 프로세스입니다. 이 방식은 기존 구조를 유지합니다.

1. **엑셀 수동 기입**: 관리자가 새 고시가 생길 때마다 변경된 금액/구간을 분석하여 기존 `work-docs/안전운임조회.xlsx`에 추가 기입합니다.
2. **정형화 스크립트 실행 (JSON 변환)**: 
   ```bash
   node web/scripts/build-safe-freight-data.js
   ```
   *위 스크립트를 실행하면 엑셀 파일이 파싱되어 웹 기반 계산기용 JSON(예: `web/data/safe-freight.json`)으로 덮어써집니다.*
3. **UI 적용**: 웹앱 조회기능은 해당 JSON 데이터를 바탕으로 요금을 화면에 표시합니다.

---

## 3. 정성 데이터 및 원본 업데이트 (AI 분석 및 법규 확인용)
AI(Gemini)가 규정의 변경점이나 과태료 감경 등의 맥락을 파악하고, 직원이 원문을 즉각 열람할 수 있도록 지원하는 프로세스입니다.

### 3.1. 원본 보존 및 UI 파일 교체
- **통합 보존**: `work-docs/안전운임_YYYY_XX차/` 폴더 하위에 새 고시문 전문(PDF, HWPX) 및 요율 부속서류 원본을 그대로 보관합니다. (기록/추적용)
- **UI 원본 교체**: 최신 버전 PDF 원본 1부를 `web/public/docs/safe_freight_notice_latest.pdf` 이름으로 덮어쓰기 복사합니다. 
  *(이것만으로 화면 UI의 "고시 원본(PDF)" 버튼 연결이 최신으로 자동 자동 갱신됩니다.)*

### 3.2. AI 텍스트 데이터 파싱 (JSON 변환)
AI 어시스턴트(Gemini)가 고시 내용을 정확하게 파악하고 답변/비교하기 위해서는 텍스트 추출이 필요합니다.

1. **변환 스크립트 실행**:
   ```bash
   node web/scripts/parse-pdf.js
   ```
   *이 스크립트는 `work-docs/` 하위의 모든 차수별 파일 중 **이름에 "고시"가 포함된 PDF**만 읽어서 `web/data/safe-freight-docs.json` (통합 JSON 배열)로 컴파일합니다. (토큰 최적화)*

2. **통합 JSON 구조 (`safe-freight-docs.json`)**:
   ```json
   [
     {
       "version": "2026_01차",
       "filename": "(전문)_2026년_적용_화물자동차_안전운임_고시.pdf",
       "content": "제1조(목적) 이 고시는 안전운임의 적용을 받는...",
       "updatedAt": "YYYY-MM-DD"
     }
   ]
   ```

### 3.3. AI 어시스턴트(api/chat) 데이터 주입
- **RAG 컨텍스트 주입**: `/api/chat/route.js`는 `safe-freight-docs.json`을 `public/data/`에서 self-fetch하여 시스템 프롬프트에 자동으로 합본합니다 (최신 기준 2개 차수).
- **단가표 주입**: `safe-freight.json`을 self-fetch로 로드하여 구간별 운임 단가를 실시간 주입. 이력 비교 엔진(`buildFareHistory`).
- **할증 계산 엔진**: 냉동(+30%), 공휴일(+20%) 등 할증을 서버에서 미리 계산하여 AI에 결과만 전달 (`calcSurcharge`).
- **작동 원리**: "새 고시에서 플렉시백 할증이 달라졌어?" 같이 쿼리가 인입되면, AI는 내부 RAG 메모리에 적재된 차수별 원문을 읽고 비교/가이드 합니다.

### 3.4. pgvector 벡터화 파이프라인 (Phase 2, 2026-04-18)
안전운임 구간 데이터를 Supabase pgvector에 벡터로 저장하여 시맨틱 검색을 지원합니다.

1. **SQL 스키마 생성**: `scripts/supabase_pgvector_setup.sql` 실행
   - `document_chunks`, `nas_file_index`, `ai_chat_memory` 테이블 생성
   - `match_documents()` RPC 함수 생성
2. **벡터화 실행**:
   ```bash
   node scripts/vectorize-safe-freight.js
   ```
   - 52,801개 구간 → 3,770개 청크 + 고시전문 98개 청크 = **총 3,868곏4** 벡터화
   - Gemini `gemini-embedding-2-preview` 모델, 768차원
   - 50개씩 배치 임베딩, 2분 지연 적용 (API Rate Limit 대응)

---

## 4. 안전운임 개정 사이클 (경유가 기준)
AI 에이전트가 학습한 분기별 개정 사이클입니다 (화물자동차운수사업법 시행령 근거).

| 분기 | 유가 산정 기간 | 비교 대상 | 적용 기간 |
|:---|:---|:---|:---|
| 1분기 | 1월~3월 평균 | 직전 적용 유가 | 5월~6월 |
| 2분기 | 4월~6월 평균 | 5~7월 적용 유가 | 7월~9월 |
| 3분기 | 7월~9월 평균 | 7~9월 적용 유가 | 10월~12월 |
| 4분기 | 10월~12월 평균 | 10~12월 적용 유가 | 다음해 1월~3월 |

- **개정 조건**: 3개월 평균 경유가가 직전 적용 유가 대비 **±50원/L 이상 변동** 시 개정 발동
- **50원 미만 변동 시**: 기존 운임 **동결** (개정 없음)
- **모니터링**: OPINET API를 통해 실시간 전국 평균 경유가 추적

---

## 5. 종합 요약 (새 고시 발생 시 Action Item)
1. `work-docs/안전운임조회.xlsx`에 운임 단가 반영 
2. `node web/scripts/build-safe-freight-data.js` 실행 (조회기능 업데이트)
3. `work-docs/안전운임_YYYY_NX차/` 폴더 구성 및 고시 원본파일 보존
4. 최신 고시 PDF를 `web/public/docs/safe_freight_notice_latest.pdf`로 덮어쓰기
5. `node web/scripts/parse-pdf.js` 실행 (히스토리 통합 및 AI 인지용 JSON 갱신)
6. `node scripts/vectorize-safe-freight.js` 실행 (**pgvector 벡터 DB 재갱신**)
7. 커밋 및 푸시 (배포)

---
*최종 갱신일: 2026-04-18 (by Antigravity/Claude | Omni-Agent v4.9.64)*
