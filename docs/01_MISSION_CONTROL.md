# ELS MISSION CONTROL v4.9.0
> 마지막 업데이트: 2026-04-06 (KST)

## 📦 최신 배포 정보 (Release)
- **Current Build**: `v4.9.0` (배포 워크플로우를 통한 자동 빌드 및 배포)
- **Next Target**: 실기기 OTA 검증 (v4.8.6 APK)
- **Repo Status**: [main] 커밋 완료
- **상태**: 🟢 일반 빌드(`npm run build`) 정상

## ⚠️ APK 빌드 절차 변경 (v4.8.5~)
```
# ✅ 올바른 APK 빌드
powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1

# ❌ 절대 금지 (흰화면 유발)
npx cap sync   ← 단독 실행 금지
web/android/app/src/main/assets/public/ ← 직접 편집 금지
```
드라이버 앱 소스 = `web/driver-src/` | 버전 소스 = `build.gradle` 단일 진실

## 🗺️ 주요 상세 문서 바로가기 (Documentation Map)
- **[02. DEVELOPMENT LOG](./02_DEVELOPMENT_LOG.md)** (개발 이력 관리)
- **[03. RULES](./03_RULES.md)** (에이전트 행동 지침)
- **[04. MASTER ARCHITECTURE](./04_MASTER_ARCHITECTURE.md)** (🚀 AI/IDE Blueprint)
- **[05. NAS API SPEC](./05_NAS_API_SPEC.md)** (나스 통신 규약)
- **[07. RUNBOOK](./07_RUNBOOK.md)** (운영 매뉴얼)
- **[08. ENVIRONMENT SETUP](./08_ENVIRONMENT_SETUP.md)** (환경 구축 가이드)

---

## ✅ 주요 마일스톤
> **Version**: `v4.8.3` (2026-04-06)  
> **Status**: 🟢 **Production STABLE**  
> **Focus**: 사진 카메라/핀치줌 최적화 & 오프라인 GPS 무결성 보장

### 🎯 핵심 마일스톤 (v4.8.5)
- [x] **2026-04-06**: [APP/VERSION] v4.8.5 - ES 모듈 분리 후 안드로이드 WebView가 예전 캐시(`?v=4.8.1`)만 바라보던 캐시 지옥 원인 규명 및 `index.html`, `app.js` 캐시버스터 최신화 패치.
- [x] **2026-04-06**: [APP/VERSION] v4.8.4 - ES 모듈 분리 후 안드로이드 WebView가 예전 캐시(`?v=4.8.1`)만 바라보던 캐시 지옥 원인 규명 및 `index.html`, `app.js` 캐시버스터 동기화 및 `/deploy` 워크플로우 룰 추가.
- [x] **2026-04-06**: [APP/UX] v4.8.3 - 카메라/갤러리 촬영 모드 다중 지원 확보 (`multiple` 속성 제거) 및 사진 핀치줌 뷰어 이식.
- [x] **2026-04-06**: [APP/UI] v4.8.3 - 설정화면 운행 상태바 이식 및 글로벌 탭바 유비쿼터스(항시 표시) 최적화로 동선 이탈 방지.
- [x] **2026-04-06**: [APP/GPS] v4.8.2 - 네트워크 음영 지역 대비 오프라인 캐시 큐(`_gpsOfflineQueue`) 도입 - 복구 시 통신 재전송.
- [x] **2026-04-06**: [WEB/MAP] v4.8.2 - 속도가 0으로 표출되는 GPS 오차 보정 - Haversine 기반 가상 주행 역산 적용.
- [x] **2026-04-06**: [APP/MAP] v4.8.2 - 지도 마커 라벨 식별성을 위해 전체 번호판을 '뒤 4자리'로 간소화 규격 적용.
- [x] **GPS 데이터 스파이크 필터 전면 도입**:
  - `page.js` (Web) 및 `map.js` (Android) 모두에 `Haversine` 필터 적용.
  - 시속 150km 이상 && 500m 이상 이동하는 '가위치(스파이크)' 제거 로직 최적화.
  - Web에서 종착점을 필터 무시하고 강제 삽입하던 버그 박멸.
- [x] **지도 UI/UX 고도화**:
  - `index.html`에서 `<div class="map-header">` 완전 제거 -> 지도 풀스크린 모드 제공 (상단 흰바 제거).
- [x] **안드로이드 네이티브 뒤로가기(<) 핸들러 강화**:
  - `registerBackHandler()` 로직 개편: (1) 상세경로 닫기 -> (2) 차량목록 닫기 -> (3) 지도 닫고 운행탭 복귀 -> (4) 운행탭에서 < 누르면 앱 종료 네이티브 훅 연결.
- [x] **2026-04-06**: [APP/MAP] v4.8.0 - **네이버 지도 Dynamic SDK v3 전면 도입**. Static Maps(raster-cors) 방식 완전 폐기. `naver.maps.Marker`/`Polyline`이 좌표를 직접 추적하여 마커 드리프트 원천 봉쇄. 하단 패널 `position:absolute` 전환으로 고무줄 현상 구조적 해결.
- [x] **2026-04-06**: [APP/MAP] v4.7.0 - smOverlay 분리 아키텍처 도입으로 마커 드리프트를 원천 해결하고 핀치줌, 하단 패널 리사이즈 유기적 대응 구현.
- [x] **2026-04-06**: [NAS/FIX] 아산지점 배차판 자동 동기화 고도화. Docker 마운트 지연을 해결하기 위해 WebDAV API 직접 통신 방식으로 개편하여 실시간 파일 변경 감지 및 데이터 자동 갱신 구현 (app_core.py)
- [x] **2026-04-05**: [WEB/FIX] 웹 어드민 관리자 패널의 운행 상세정보 내 전체 경로 지도 로딩 오류(ncpClientId) 및 NAS 연동 첨부 사진 URL 출력 렌더링 오류 수정 (v4.6.2)
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

## ✅ 주요 업데이트 (v4.6.1)
- **[APP/MAP] Static Map 엔진으로 안전 복위**:
  - Naver JS SDK의 'API 인증 실패(Referer)' 문제를 우회하기 위해 안정적인 Static Map 방식으로 복귀.
  - 3.1 Pro의 Panner 아키텍처를 Static Map에 이식하여 '마커 따라옴' 현상 완벽 해결.
  - `fitBounds`와 유사한 'Static Auto-Zoom' 로직을 자체 구현하여 경로 뷰 가독성 확보.
- **[APP] 전역 캐시 무효화 (v4.6.1)**:
  - 461 빌드로 즉시 업데이트 및 캐시 갱신 유도.

## ✅ 주요 업데이트 (v4.6.0) - 인증 이슈로 롤백됨

## ✅ 핫픽스 (v4.5.54)
- **[APP/MAP] 지도 엔진 panner 아키텍처 도입**:
  - `img`, `canvas`, `overlay`를 하나의 `smPanner` 레이어로 묶어 단일 `transform`으로 제어. 레이어 간 어긋남 원천 차단.
- **[APP/MAP] 가시적 버전 표시 (Version HUD)**:
  - 지도 우측 상단에 `v4.5.54-MAPFIX-R1` 레이블을 추가하여 실제 최신 코드 로드 여부 육안 확인 가능.
- **[APP/MAP] 터치 좌표 추적 보강**:
  - `lastX/lastY` 백업을 통해 안드로이드 터치 종료 시 좌표 누락 대응 강화.

## ✅ 핫픽스 (v4.5.53)
- **[APP/MAP] 지도 마커 동기화 엔진 리팩토링**:
  - 개별 마커 수동 이동(`left/top`) 방식에서 `smOverlay` 전체 `transform` 제어 방식으로 전환하여 레이턴시 및 오차 원천 차단.
- **[APP/MAP] 탭(Tap) 시 마커 소멸 방지 및 클릭 이벤트 보존**:
  - `didDrag` 판정 실패 시(미세 떨림 등)에도 마커 DOM이 재생성되지 않도록 하여 안드로이드 `click` 이벤트 유실 문제 해결.
- **[APP/VERSION] 캐시 무효화 v2 대응**:
  - `v4.5.53`으로 버전 범프 및 모든 `import` 경로 쿼리스트링 갱신으로 WebView 캐시 지옥 탈출 확인.
  - `showTripRouteOnMap` 시작/종료 시점 `remoteLog` 추가하여 동작 추적 기능 강화.

## ✅ 핫픽스 (v4.5.51/52)
- **[APP/MAP] 지도 마커 드래그 고정 버그 1차 시도**:
  - `!smState.isDragging` 가드 추가.
- **[APP/MAP] 마커 클릭 시 경로 조회 무반응 버그 1차 시도**:
  - `didDrag` 플래그로 탭/드래그 구분.

## ✅ 주요 리팩토링 (v4.5.50+)
- **[APP] 드라이버 앱 모듈 분리 리팩토링 완료**:
  - 단일 IIFE `app.js` (3,119줄) → ES Module 방식, 15개 모듈 + 엔트리 135줄으로 분리
  - `modules/` 디렉토리: store, bridge, nav, permissions, profile, trip, gps, notice, log, photos, emergency, update, map, init, utils
  - `index.html`: `<script type="module" src="app.js">` 적용
  - 원본 백업: `app.js.bak`
  - [x] JS 모듈 분리(v4.5.50) 후 Android 안드로이드 앱에서 버전이 v4.3.46으로 나오고, 구 버전으로 돌아가는(마커 이슈 등) WebView 캐시 문제 해결. (`index.html` 캐시버스터 주입)
  - [x] 버전을 Native 영역 (App.getInfo())에서 동적으로 가져오게 변경하여 더이상 `app.js` 등에 하드코딩하지 않게 개선.
  - [x] 앱 종료(Swipe) 시 네이티브 GPS 유지 알림이 없어지지 않는 버그 해결. (`FloatingWidgetService.java` 내 `onTaskRemoved` 시 서비스/알림 파괴하도록 수정 완료)
  - [x] [v4.7.3] 마커 드리프트 핫픽스 (오버레이 분리 적용)
- [ ] [v4.8.1] 실기기(갤럭시 S25) Dynamic SDK v3 마커/경로 동작 검증
- [ ] [UI/UX] 지도 하단 패널 오버레이화 (완료 — v4.8.0)

## ⏳ 현 시즌(v4.8.x) 잔여 작업 확인 (TODO)
차기 세션에서 형님 확인 후 진행할 내역:
1. **[TEST] 실기기 동작 검증**:
   - 새로 배포한 v4.8.5 (APK `t=485`) 버전이 OTA로 즉시 캐시 업데이트 및 다운로드되는지 폰에서 확인.
   - 앱 내 사진 등록 창에서 "카메라" 및 "갤러리" 둘 다 원활하게 팝업되는지 테스트.
   - 사진 클릭 시 화면 확대(손가락 핀치줌) 및 삭제 UX 정상 작동 확인.
   - 설정 버튼 클릭 시 바뀐 상하단 UI 정상 작동 확인.
2. **[DATA] 웹 관제 속도 모듈 확인**:
   - `page.js`에 주입한 Haversine 보정 속력 값이 너무 튀지 않고 스무스하게 0km/h 에러를 보정해주는지 실데이터 관제 비교.
3. **[WIP] 추가 기능 구현**: 오프라인 큐가 `smartFetch` 과정에서 실제 500에러를 마주했을 때 `gps.js`가 얼마나 강건하게 큐를 비워주는지 로그 검토.

## 🐛 남은 이슈
- NCP 콘솔 Dynamic Map V3(JS SDK)의 캐시/메모리 부하 관련 장기적 누수 여부 모니터링 필요.

---
*최종 갱신일: 2026-04-06 (by Antigravity v4.8.0)*
