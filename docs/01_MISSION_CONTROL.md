# ELS MISSION CONTROL v4.5.25
> 마지막 업데이트: 2026-04-04 20:34 (KST)

## 📦 최신 배포 정보 (Release)
- **현재 버전**: `v4.3.26` (Mobile) / `v4.5.25` (Unified Web/Backend)  
- **최근 업데이트**: 2026-04-04
- **상태**: 🚀 정차 중 GPS 잔떨림(Jitter) 방지 필터 도입 완결 (v4.5.25)

## 🗺️ 주요 상세 문서 바로가기 (Documentation Map)
- **[02. DEVELOPMENT LOG](./02_DEVELOPMENT_LOG.md)** (개발 이력 관리)
- **[03. RULES](./03_RULES.md)** (에이전트 행동 지침)
- **[04. MASTER ARCHITECTURE](./04_MASTER_ARCHITECTURE.md)** (🚀 AI/IDE Blueprint)
- **[05. NAS API SPEC](./05_NAS_API_SPEC.md)** (나스 통신 규약)
- **[07. RUNBOOK](./07_RUNBOOK.md)** (운영 매뉴얼)
- **[08. ENVIRONMENT SETUP](./08_ENVIRONMENT_SETUP.md)** (환경 구축 가이드)

---

## ✅ 주요 마일스톤 (Milestones)
- [x] **2026-04-04**: [WEB/MAP] 정차 중 GPS 잔떨림(Jitter) 방지 필터 도입 - 지그재그 경로 제거 (v4.5.25)
- [x] **2026-04-04**: [WEB/FIX] 실시간 마커 관리 Ref 분리 - 상세 조회 시 마커 사라짐 버그 해결 (v4.5.21)
- [x] **2026-04-04**: [WEB/MAP] GPS Spike 필터(A-B-C 분석) 도입 및 속도 제한 하향 (v4.5.20)
- [x] **2026-04-04**: [WEB/UX] 운영 현황 리스트 클릭 시 상세 모달 연동 및 운행 시간 표시 (v4.5.20)
- [x] **2026-04-04**: [WEB/MAP] 주 지도 drawTripPath에 Haversine 이상치 필터링 통합 (v4.5.19)
- [x] **2026-04-04**: [WEB/MAP] 차량관제 GPS 이상치 필터링 및 Android 뒤로가기 최적화 (v4.5.18)
- [x] **2026-04-04**: [WEB/FIX] 컨테이너 이력조회 TDZ ReferenceError 완결 조치
- [x] **2026-04-04**: [WEB/UX] 멀티 브라우저 대기 로그 실시간 동기화 구현
- [x] **2026-04-04**: [BOT/PERF] 4-Worker 병렬 최적화 완결 - Staggered Start (2~4번째 1초 엇박자)으로 대기시간 최소화 및 NAS 부하 분산 완성 (v4.5.12)
- [x] **2026-04-04**: [WEB/UX] 멀티 브라우저 모니터링 UI 도입 (실시간 스크린샷 갱신 3s)
- [x] **2026-04-04**: [WEB/APK] ELS Driver v4.3.26 업데이트 및 배포 자동화 스크립트 고도화 (v4.1.7+)

## 📋 최근 변경 (v4.5.25 — 2026-04-04)
- **정차 중 GPS 잔떨림 제거 (v4.5.25)**:
  - **Stationary Filter 도입**: 차량 속도가 5km/h 이하일 때 GPS Spike 임계치를 50m로 대폭 낮추어 정차 중 지그재그 경로 방지.
  - 정지 상태에서의 미세한 A-B-A 튐 데이터를 자동 제거하여 지도 가시성 확보.
- **실시간 마커 안정화 (v4.5.21)**:
  - `liveMarkersRef` 도입으로 마커 보존 안정화 및 상세 조회 연동 버그 해결.
- **GPS 필터링 및 UX 고도화 (v4.5.20)**:
  - Spike(가시) 필터 도입, 120km/h 속도 제한, 리스트 상세 페이지 연동 및 운행 시간 표시.
- **주 지도 경로 정리 (v4.5.19)**:
  - `drawTripPath` Haversine 필터링 통합 및 종착지 복원 로직 추가.

## ⏳ 다음 할 일
1. 실기기(갤럭시 S25) 필드 테스트 (장거리 주행 및 음영지역 재수신 딜레이 측정)
2. 오프라인 데이터 큐잉 (네트워크 완전 단절 시 로컬 SQLite 저장 후 일괄 전송) 설계

## 🐛 남은 이슈
- 없음 (알려진 모든 치명적 버그 해결됨)

---
*최종 갱신일: 2026-04-04 (by Antigravity AI v4.5.25)*
