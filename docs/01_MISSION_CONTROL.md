# 🛰️ MISSION CONTROL (2026-04-19)

| 항목 | 내용 | 비고 |
| :--- | :--- | :--- |
| **현재 버전** | `v4.9.90` | **Driver App Recovery & Persistent Issues** |
| **상태** | 🟡 배포 진행 (v4.9.23) | 드라이버 앱 ID 누락 오류 미결 (원인 추적 중) |

## 🎯 현재 목표: Omni-Agent 완성 및 마이그레이션 착수
1.  **[DONE]** K-SKILL 403 차단 회피를 위한 NAS 백엔드 프록시 구축 완료
2.  **[DONE]** RAG 시맨틱 검색(`match_documents`) 유실 복구 및 대기료 할루시네이션 해결
3.  **[DONE]** 안전운임 할증 엔진 하드코딩 제거 (ID 기반 동적 매핑 완료)
4.  **[DONE]** 한강 수위 API 스키마 변경 대응 및 K-LAW 법망 연동 개편
5.  **[DONE]** NAS 문서 크롤러 및 벡터화 (Phase 5) 완료 — **AI 에이전트 개발 100% 종료**
6.  **[TODO]** 법인/계정 이관 밎 최종 마이그레이션 (Phase 6: Rollback/Cleanup - 08_MIGRATION_PLAN 기준)
7.  **[CRITICAL]** 드라이버 앱 "ID 누락" 현상 근본 원인 파악 및 해결 (v4.9.23 이후 재발 시 통신 다이어그램 전면 재검토)

## 📦 최신 배포 정보
- **Current Build**: `v4.9.89` (드라이버 앱 v4.9.22 포함)
- **APK URL**: `https://nollae.com/apk/els_driver_v4922.apk` (캐시 방지용) / `els_driver.apk` (홈페이지용)
- **Repo**: main 브랜치 배포 완료

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
- **시도 2**: `require()` 기반 로드로 전환 → 배포 확인 대기 중
- **성공 항목**: 경유가 연동 ✅, 개정 사이클 ✅, SRT/KTX 안내 ✅

### ❌ 잔여 과제
- [x] **안전운임 요율 미표시** — Webpack `require()` 번들링으로 100% 로딩 보장 ✅
- [x] **pgvector 시맨틱 검색 route.js 연동** — `match_documents()` RPC 연동 완료 ✅
- [x] **NAS 문서 크롤러** — Docker volume1/2 마운트 및 `/api/vectorize/nas` 가동 ✅
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
*최종 갱신: 2026-04-19 (by Antigravity/Claude)*
