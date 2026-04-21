# 🛰️ MISSION CONTROL (2026-04-22)

## 📌 현재 상태 및 핵심 지표
- **현재 버전**: `v5.3.1` (NAS Scale-up & Embedding API Fix)
- **핵심 목표**: 사용자와의 교정/피드백 사내 DB 영구 저장 + 지식 연결 모델(Weather-Safety 등) 도입
- **최근 승전보**: AI 커스텀 규칙 테이블(`ai_custom_rules`) 신설 및 NAS 실시간 업데이트 알림 로직 적용 (2026-04-22)

### 🚀 마일스톤 (Milestones)
- [✅] **Phase 1-5**: AI 에이전트 및 RAG 엔진 구축 완료
- [✅] **Phase 6**: AI 지능 고도화 및 영구 학습 체계 구축
- [✅] **v5.1**: K-SKILL 구조조정 + AI 가이드 재설계
- [✅] **v5.2**: NAS 크롤러 고도화 (PDF/OCR/Fallback)
- [✅] **v5.3**: AI "경험 학습" 사내 DB 이관 + Knowledge Link Model + NAS 실시간 알림 ✅
- [ ] **Next**: 사용자별 접근 권한 분리 및 최종 인트라넷 이관

## 🚧 최근 이슈 및 조치 (2026-04-22)
- **[SOLVED] AI 학습 귀속 이슈**: Gemini 내부 상태가 아닌 사내 DB(`ai_custom_rules`)에 피드백을 저장하여 영구 보존.
- **[FEAT] NAS 업데이트 알림**: 대화 시작 시 최근 24시간 내 변경된 문서를 AI가 먼저 인지하도록 개선.
- **[FEAT] 컨테이너 조회 고지**: 30초 대기 고지 로직을 AI 행동 강령으로 강제화.
  3) **안전운임 복구**: 유실되었던 웹용 운임 데이터를 수동 빌드 후 배포 완료. 향후 자동화를 위해 `scripts/update-safe-freight.sh` 제작.

## 🎯 현재 목표: Omni-Agent 완성 및 마이그레이션 착수
1.  **[DONE]** K-SKILL 403 차단 회피를 위한 NAS 백엔드 프록시 구축 완료
2.  **[DONE]** RAG 시맨틱 검색(`match_documents`) 유실 복구 및 대기료 할루시네이션 해결
11. **[DONE]** 안전운임 할증 엔진 하드코딩 제거 (ID 기반 동적 매핑 완료)
12. **[DONE]** 한강 수위 API 스키마 변경 대응 및 K-LAW 법망 연동 개편
13. **[DONE]** NAS 문서 크롤러 및 벡터화 (Phase 5) 완료 — **AI 에이전트 개발 100% 종료**
14. **[TODO]** 법인/계정 이관 밎 최종 마이그레이션 (Phase 6: Rollback/Cleanup - 08_MIGRATION_PLAN 기준)
15. **[DONE]** 드라이버 앱 "ID 누락" 현상 근본 원인 해결 완료 (NextResponse 직렬화 적용)
16. **[DONE]** AI 안전운임 조회 부산 이외 항구 응답 누락 버그 수정 (PORT_ALIAS_MAP + 스코어링 개선)

## 📦 최신 배포 정보
- Current Build: `v4.9.33` (APK, Driver App)
- Active Agent Profile: Omnipotent AI Assistant (ELS Solution Dedicated)
- Core Tasks:
  - [x] Driver App PWA Address Bar Hidden Fix
  - [x] Dispatch Board Memo Read Fix (Asan) 
  - [x] Driver App ID Null Patch (Empty body 400 return)
  - [x] **Native Bridge Recovery** (CapacitorHttp 재복구 — 번호조회/ID누락 최종 해결 시도) (필독)

## ⚠️ APK 빌드 절차 (필독)
```
# ✅ 올바른 APK 빌드
powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1
# ❌ 절대 금지
npx cap sync   ← 단독 실행 금지
```
드라이버 앱 소스 = `web/driver-src/` | 버전 소스 = `build.gradle` 단일 진실

---

## 🤖 Omni-Agent 구축 현황

### ✅ Phase 1 — 안전운임 Deep Knowledge (v4.9.60)
- **이력 비교 엔진**: 6개 고시 기간(21.09~26.02) 기간별 금액/변동률 비교표
- **할증 서버계산 엔진**: 냉동(+30%), 공휴일(+20%) 등 서버가 미리 계산 → AI에 주입
- **시스템 프롬프트 전면 재설계**: 읽기 최고권한, 거절 금지, 서비스 연계 강제

### ✅ Phase 2 — pgvector 기반 벡터 DB (v4.9.61)
- **Supabase 테이블**: `document_chunks` + `nas_file_index` + `ai_chat_memory`
- **벡터화 완료**: 3,868/3,868 청크 (구간 3,770 + 고시전문 98)
- **임베딩 모델**: gemini-embedding-2-preview (768차원)
- **시맨틱 검색 RPC**: `match_documents()` 함수 생성 완료

### ✅ Phase 3 — K-SKILL Resilience + OPINET (v4.9.62)
- **OPINET 경유가 연동**: AI가 "경유", "유가" 질문 시 실시간 전국 가격 안내
- **분기별 개정 사이클**: 1Q→5월, 2Q→7월, 3Q→10월, 4Q→다음해 1월
- **K-SKILL 래퍼**: `callExternalAPI()` 레질리언스 계층 + 실패 시 폴백 메시지

### 🔧 Phase 4 — 안정화 (v4.9.63~64, 진행 중)
- **문제**: Vercel standalone 빌드에서 `safe-freight.json`(35MB) 미번들
- **시도 1**: `outputFileTracingIncludes` 추가 → 미해결
- **시도 2**: `require()` 기반 로드로 전환 → 해결 완료
- **성공 항목**: 경유가 연동 ✅, 개정 사이클 ✅, 미세먼지 연동 ✅

### ✅ Phase 5.1 — AI 구조조정 (v5.1)
- **K-SKILL 불안정 기능 제거**: KTX/SRT, 지하철, 한강수위, 주식, 스포츠 비활성화
- **유연 답변 원칙**: 업무 외 일반 질문 거절 폐지 → Gemini 일반지식으로 대응
- **가이드 패널 재설계**: 기술 용어 → 사용자 실용 가이드 전면 교체
- **안정 기능 유지**: 안전운임(자체), 경유가(OPINET), 미세먼지(K-SKILL), 법령(K-Law)

### ❌ 잔여 과제
- [x] **안전운임 요율 미표시** — Webpack `require()` 번들링으로 100% 로딩 보장 ✅
- [x] **pgvector 시맨틱 검색 route.js 연동** — `match_documents()` RPC 연동 완료 ✅
- [✅] **NAS 문서 크롤러** — 이미지(OCR), .doc, .xlsm 확장 및 04:30 스케줄 가동 ✅
- [ ] **사용자별 접근 권한 분리** — 차기 마이그레이션 단계에서 진행 예정 (계정 이치)

---

## 📋 안전운임 개정 사이클 (AI 학습 완료)
```
1Q 유가산정(1~3월) → ±50원/L 변동 시 → 5~6월 적용
2Q 유가산정(4~6월) → ±50원/L 변동 시 → 7~9월 적용  
3Q 유가산정(7~9월) → ±50원/L 변동 시 → 10~12월 적용
4Q 유가산정(10~12월) → ±50원/L 변동 시 → 다음해 1~3월 적용
※ 50원 미만 변동 시 기존 운임 동결
```

## 🗺️ 주요 상세 문서
- **[02. DEVELOPMENT LOG](./02_DEVELOPMENT_LOG.md)**
- **[04. MASTER ARCHITECTURE](./04_MASTER_ARCHITECTURE.md)**
- **[05. NAS API SPEC](./05_NAS_API_SPEC.md)**
- **[07. RUNBOOK](./07_RUNBOOK.md)**

---
*최종 갱신: 2026-04-21 v5.2 (by Antigravity/Gemini — NAS 클로러 확장 및 UI 개선)*
