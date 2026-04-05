# ELS MISSION CONTROL v4.5.50
> 마지막 업데이트: 2026-04-05 17:30 (KST)

## 📦 최신 배포 배포 정보 (Release)
- **현재 버전**: `v4.5.50` (Unified Mobile/Web)  
- **최근 업데이트**: 2026-04-05
- **상태**: 🟢 전역 시스템 안정화 및 버전 통합 완료 (Build 450)

## 🗺️ 주요 상세 문서 바로가기 (Documentation Map)
- **[02. DEVELOPMENT LOG](./02_DEVELOPMENT_LOG.md)** (개발 이력 관리)
- **[03. RULES](./03_RULES.md)** (에이전트 행동 지침)
- **[04. MASTER ARCHITECTURE](./04_MASTER_ARCHITECTURE.md)** (🚀 AI/IDE Blueprint)
- **[05. NAS API SPEC](./05_NAS_API_SPEC.md)** (나스 통신 규약)
- **[07. RUNBOOK](./07_RUNBOOK.md)** (운영 매뉴얼)
- **[08. ENVIRONMENT SETUP](./08_ENVIRONMENT_SETUP.md)** (환경 구축 가이드)

---

## ✅ 주요 마일스톤 (Milestones)
- [x] **2026-04-05**: [APP] v4.3.49 - 네이버 지도 Dynamic API V2(JS SDK) 전격 복구. DIY Static Map 엔진의 한계였던 마커 드리프트 현상을 원천 해결하고 부드러운 60fps 패닝/줌 구현. (Capacitor hostname fix 기반)
- [x] **2026-04-05**: [APP] v4.3.36 - 지도 UI/UX 전면 개선 (줌 슬라이더, 하단 상시 패널) 및 오버레이 마커 동기화(정수 줌 레벨) 해결
- [x] **2026-04-05**: [APP] v4.3.35 - JS SDK 완전 제거, Static Maps raster-cors 이미지 방식으로 전환 — WebView Referer 인증 문제 근본 해결
- [x] **2026-04-05**: [APP] v4.3.34 - Capacitor hostname `www.nollae.com`으로 변경하여 네이버 지도 네이티브 앱 인증 이슈 원천 해결
- [x] **2026-04-05**: [APP] v4.3.32 - 앱 버전 표시 단일화(Refactoring) 및 네이버 지도 렌더 타이밍 픽스 (깜빡임 문제 해결)
- [x] **2026-04-05**: [APP] v4.3.31 - TDD 모니터링 로그 삽입 및 4/4 16:53 외부 안내 대응 기록 반영
- [x] **2026-04-04**: [APP] v4.3.30 - UI 레이아웃 중첩 버그 긴급 해결 및 탭 하단 통합 안착 (지도 로딩은 미해결)
- [x] **2026-04-04**: [WEB/MAP] 정차 중 GPS 잔떨림(Jitter) 방지 필터 도입 - 지그재그 경로 제거 (v4.5.25)
- [x] **2026-04-04**: [WEB/FIX] 실시간 마커 관리 Ref 분리 - 상세 조회 시 마커 사라짐 버그 해결 (v4.5.21)
- [x] **2026-04-04**: [WEB/MAP] GPS Spike 필터(A-B-C 분석) 도입 및 속도 제한 하향 (v4.5.20)
- [x] **2026-04-04**: [WEB/UX] 운영 현황 리스트 클릭 시 상세 모달 연동 및 운행 시간 표시 (v4.5.20)
- [x] **2026-04-04**: [WEB/MAP] 주 지도 drawTripPath에 Haversine 이상치 필터링 통합 (v4.5.19)

## 📋 최근 변경 (v4.5.39 — 2026-04-05)
- **네이버 지도 Dynamic API V3 복구 및 클린 빌드 (v4.3.49)**:
  - **JS SDK 전격 복구**: Capacitor `hostname` 최적화를 통해 웹뷰 Referer 인증 문제를 해결하고, Static Maps 이미지 방식에서 고성능 Dynamic API 방식으로 회귀.
  - **마커 드리프트 완전 해결**: DIY 엔진의 좌표 계산 오차를 제거하고 SDK 순정 `Marker`/`Polyline`을 사용하여 지도와 마커의 물리적 고정 상태 확보.
  - **빌드 안전성 검증**: `next build` 및 `gradlew clean assembleDebug`를 통한 전체 스택 클린 빌드 및 TDD 검증 완료.
- **지도 UI 전면 개선 및 버그 수정 (v4.3.36)**:
  - **줌 슬라이더 도입**: 기존 `+/-` 물리 버튼 대신, 손가락으로 자연스럽게 조절할 수 있는 세로형 줌 슬라이더 적용 및 핀치줌 완벽 동기화.
  - **하단 상시 패널**: 답답하던 운행 목록 팝업을 제거하고, 상태 및 차량 수를 직관적으로 볼 수 있는 접기/펼치기형 하단 패널(Bottom Panel) 구축.
  - **마커 동기화 근본 해결**: SDK와 달리 Static Map은 이미지 타일이 정수형 줌 레벨을 따름을 파악. 오버레이 마커 계산 시 줌 레벨을 `Math.round()`로 강제 동기화하여 '파란 점(내 위치)'이 엉뚱한 곳으로 이동하던 좌표 드리프트 현상 영구 격리.
- **네이버 지도 JS SDK 완전 제거 (v4.3.35)**:
  - Capacitor WebView는 HTTP Referer를 `www.nollae.com`으로 전송하지 않아 NCP JS Map SDK 인증이 근본적으로 불가능하다는 원인 최종 규명.
  - NCP **Static Maps API(raster-cors)** 엔드포인트로 전환: 이미지 URL 방식이라 Referer 제약 없음.
  - 터치 드래그, 핀치 줌, Canvas 경로 렌더링, DOM 마커 오버레이를 자체 구현하여 JS SDK와 동등한 UX 제공.
- **네이버 지도 인증 이슈 완전 해결 (v4.3.33)**:
  - WebView 컨테이너의 내부 호스트명(`nollae.com`)이 NCP 콘솔의 `www.nollae.com`과 불일치하여 발생한 **권한/인증 실패(Open API 인증 실패 워터마크)** 원인 규명.
  - 안드로이드 자산 내부의 `capacitor.config.json`을 단일 루트(WWW)로 강제 정렬 완료.
- **앱 안정화 및 동기화 (v4.3.32 / v4.5.32)**:
  - **버전 하드코딩 제거**: `app.js`에서 상수로 정의된 버전 정보를 UI 및 CSS 캐시버스터로 자동 주입하도록 리팩터링하여 버전 불일치 문제 원천 차단.
  - **네이버 지도 렌더링 픽스**: `requestAnimationFrame` 2회 및 `resize` 이벤트 이중 방출을 통해 레이아웃 변경 시 지도가 사라지는 타이밍 버그 해결.
  - **TDD 로그 강화**: 네이버 지도 로드 과정에서 실제 `Origin` 및 `Href` 정보를 서버로 전송하는 추적 시스템 구축.
- **로직 통합 및 버그 수정 (v4.5.26)**:
  - **ReferenceError 해결**: `drawTripPath` 내부의 잘못된 변수 참조로 인해 주 지도 경로가 렌더링되지 않던 문제 수정.
  - **필터 동기화**: 주 지도와 상세 모달의 GPS 필터링 로직을 동일하게 동기화하여 일관된 시각화 제공.
  - **데이터 안전성**: 속도 데이터 부재(null) 시에도 정차 필터가 안정적으로 작동하도록 예외 처리.
- **정차 중 GPS 잔떨림 제거 (v4.5.25)**:
  - Stationary Filter로 정차 중 미세 튐 데이터(지그재그) 제거.
- **실시간 마커 안정화 (v4.5.21)**:
  - `liveMarkersRef` 도입으로 상세 조회 시에도 운영 마커 보존.

## ✅ 주요 리팩토링 (v4.5.50+)
- **[APP] 드라이버 앱 모듈 분리 리팩토링 완료**:
  - 단일 IIFE `app.js` (3,119줄) → ES Module 방식, 15개 모듈 + 엔트리 135줄으로 분리
  - `modules/` 디렉토리: store, bridge, nav, permissions, profile, trip, gps, notice, log, photos, emergency, update, map, init, utils
  - `index.html`: `<script type="module" src="app.js">` 적용
  - 원본 백업: `app.js.bak`
  - [x] JS 모듈 분리(v4.5.50) 후 Android 안드로이드 앱에서 버전이 v4.3.46으로 나오고, 구 버전으로 돌아가는(마커 이슈 등) WebView 캐시 문제 해결. (`index.html` 캐시버스터 주입)
  - [x] 버전을 Native 영역 (App.getInfo())에서 동적으로 가져오게 변경하여 더이상 `app.js` 등에 하드코딩하지 않게 개선.
  - [x] 앱 종료(Swipe) 시 네이티브 GPS 유지 알림이 없어지지 않는 버그 해결. (`FloatingWidgetService.java` 내 `onTaskRemoved` 시 서비스/알림 파괴하도록 수정 완료)
  - [x] **[HOTFIX]** 초기 권한 설정 화면 JS SyntaxError 복구 및 **"순차 자동 설정"** 버튼 기능 추가 완료.

## ⏳ 다음 할 일
1. Vercel 배포 후 실기기(갤럭시 S25)에서 최신 APK OTA 업데이트 테스트 및 모듈 동작 검증.
2. 오프라인 데이터 큐잉 설계 도입

## 🐛 남은 이슈
- 없음 (알려진 모든 치명적 버그 해결됨)

---
*최종 갱신일: 2026-04-05 (by Antigravity v4.5.50)*
