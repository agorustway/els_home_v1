# 🚩 ELS MISSION CONTROL (v5.5.9)

> **"지능은 최신으로, 안정은 극한으로 (v5.5.9 지능형 동기화 패치)"**
> - **최근 업데이트**: 아산 배차판 **±7일 지능형 동기화** 및 **새벽 4시 전수 조사** 시스템 가동.
> - **주요 상태**: NAS 메모리 최적화(Read-Only) 완료, 포트 충돌(2930/2931) 완전 해결.

## 🕒 실시간 가동 지표 (Automation)
| 타겟 | 주기 | 상세 로직 | 상태 |
| :--- | :--- | :--- | :--- |
| **아산 배차 (최근)** | 1분 (변경 시) | 엑셀 저장 시 **오늘 기준 ±7일** 시트 즉시 동기화 | ✅ 가동 중 |
| **아산 배차 (전체)** | 매일 04:00 | 2.2~현재~미래 전체 시트 정합성 일괄 점검 | ✅ 가동 중 |
| **NAS 문서 벡터화** | 매일 04:30 | NAS 신규/변경분 인덱싱 및 벡터 DB 반영 | ✅ 가동 중 |
| **안전운임/차량관제** | 실시간 | ETRANS 및 위치 데이터 연동 | ✅ 가동 중 |

### 🚀 마일스톤 (Milestones)
- [✅] **Phase 1-5**: AI 에이전트 및 RAG 엔진 구축 완료
- [✅] **Phase 6**: AI 지능 고도화 및 영구 학습 체계 구축
- [✅] **v5.1**: K-SKILL 구조조정 + AI 가이드 재설계
- [✅] **v5.2**: NAS 크롤러 고도화 (PDF/OCR/Fallback)
- [✅] **v5.5**: 아산 배차판 완전 자동화 및 지능형 동기화 ✅
- [ ] **Next**: 사용자별 접근 권한 분리 및 최종 인트라넷 이관

- **[STABILITY] 아산 배차판 메모리 최적화**: `read_only=True` 및 `gc.collect()` 도입으로 수십 개 시트 처리 시 OOM 해결 (v5.5.8).
- **[FEAT] 지능형 2단계 동기화**: 실시간(±7일)과 야간(전체) 분리 처리로 NAS 부하 및 속도 최적화 (v5.5.9).
- **[STABILITY] NAS 벡터화 파이프라인 안정화 패치**: Supabase 429 Rate Limit 대응 재시도 로직, 좀비 락 방지(2시간 초과 시 해제) 및 쉘 스크립트 타임아웃 보강 완료.
- **[FEAT] 모바일 대화 목록(History Drawer) 추가**: 모바일 환경에서 헤더 아이콘 클릭 시 과거 대화 목록 접근 가능하도록 드로어 UI 구현.
- **[UI/UX] AI 가이드 UI 정제 및 공식 호칭 적용**: 가이드 패널 내 이모지 제거, 카드 디자인 통일 및 호칭 변경("형" -> "사용자"). v5.3.3 반영.
- **[FEAT] AI 채팅 이미지 인식 및 멀티모달 활성화**: 채팅창 이미지 업로드(최대 10장) 및 브라우저 단 가성비 압축(Canvas) 적용 완료.
- **[SOLVED] 안전운임 최단경로 법규 로직 적용**: 제3조(거리계산 및 운임적용) 규정에 따라 '최적경로'와 '큰길우선' 중 짧은 거리 자동 선택 구현.
- **[UI/UX] 안전운임 엑셀 다운로드 개선**: 엑셀 출력 시 각 운임 섹션별 기점/행선지 명시적 표기 및 스타일 개선으로 가독성 향상.

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
*최종 갱신일: 2026-04-23 (by Antigravity/Gemini | v5.5.9 Asan Intelligent Sync)*
