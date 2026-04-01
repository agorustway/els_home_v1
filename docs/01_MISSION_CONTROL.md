# ELS MISSION CONTROL v4.4.2
> 마지막 업데이트: 2026-04-01 13:40 (KST)

## 📦 최신 배포 정보 (Release)
- **현재 버전**: `v4.3.25` (Mobile) / `v4.4.2` (ELS Bot)
- **최근 업데이트**: 2026-04-01
- **상태**: ✅ 로컬 검증 완료, NAS 최종 빌드 대기 중
- **APK 다운로드**: [els_driver.apk](https://www.nollae.com/apk/els_driver.apk)
- **설정 파일**: `web/public/apk/version.json` (v4.3.25)

### 🎯 주요 마일스톤
- [x] **2026-04-01**: [BOT/FIX] DrissionPage 4.0 API 오기 수정 (`set_argument`, `headless`) 및 로컬(Windows) 헤드리스 검증 완료
- [x] **2026-04-01**: [BOT/FIX] NAS 도커(Linux) 환경 DrissionPage 초기화 실패 및 안정화 v4.4.0 (Headless, Sandbox, 순차 초기화 적용)
- [x] **v4.3.25**: [FIX] 화면의 [종료] 버튼 클릭 시 알림바가 남는 버그 최종 해결. 네이티브 `finishAndRemoveTask()` 기반의 `exitAppForce()` 호출로 전환.
- [x] **v4.3.24**: [UX] 종료 탭 복구 완료. 종료 버튼의 동작을 하드웨어 뒤로가기와 동일하게(minimizeApp) 수정하여 알림창 문제 해결 시도.
- [x] **v4.3.23**: [UI/UX] 종료 탭 제거 및 상단 뒤로가기(<) 버튼 추가 (사용자 요청으로 원복됨)
- [x] **v4.3.14**: [UI/UX] 설정 프로필 페키지(전화/이름/차량) 높이 추가 축소(42px->38px), 공지 탭 필터 버튼 높이 상향(28px->34px) 및 중앙 정렬
- [x] **v4.3.13**: [UI/UX] 설정 페이지 상단 프로필 영역 높이 축소 (48px -> 42px), 1페이지 뷰 무스크롤 완전 확보
- [x] **v4.3.11**: [UI/UX] 설정 화면 '이름/차량번호/차량ID' 병합, 관리 버튼 축소로 스크롤 제거
- [x] **v4.3.10**: [UI/UX] 버튼/입력창 48px 통일, 헤더 크기 확대, 설정 페이지 '이름/연락처' 병합 배치 개선
- [x] **v4.3.09**: [UI+NATIVE] 운행 버튼 규격 일치 및 오버레이 실시간 서버 통신(`driver_id` 누락해결) 보완
- [x] **v4.3.08**: [UI/FIX] 설정 페이지 버튼 색상 변경(블랙) 및 UI 버전 텍스트 동기화
- [x] **v4.3.07**: [UI/FIX] 권한 설정 화면(앱 외부)에서 복귀 시 버튼 즉각 갱신 로직 수정
- [x] **v4.3.06**: [DEPLOY] 클린 빌드 배포 - 실시간 모드 및 중복 설치 알림 해결
- [x] **v4.3.05**: [NATIVE] 실시간 모드(3초) 폴링 로직 수정 (restartLocationTracking 연동)
- [x] **v4.3.04**: [NATIVE] 화면 켬(WakeUp) 감지 및 GPS 즉시 강제 갱신 로직 (시각적 지연 해소)
- [x] **v4.3.03**: [UI/UX] 가입 사진칸 상시 노출, 권한 설정 순서 최적화 (배터리→오버레이)
- [x] **v4.3.02**: [UI/FIX] 초기 설정 버튼 색상(검정/빨강) 및 권한 동기화/화면 전환 로직 버그 수정
- [x] **v4.3.01**: [FIX] 첫 설치 크래시 방어: `init()` 사전 권한 체크 및 `FloatingWidgetService` 안전 시작 로직 적용
- [x] **v4.2.59**: [FIX] 자이로 필드 제거: DB 스키마(`gyro` 컬럼 없음) 충돌로 인한 500 에러 해결, `accuracy` 필드 추가 및 `JSONObject` 도입 (v4.2.58 통합)
- [x] **v4.2.58**: [FIX] 백엔드 JSON 포맷 에러 해결: `org.json.JSONObject` 도입으로 페이로드 생성 안전성 확보
- [x] **v4.2.57**: [FEAT/FIX] 네이티브 엔진 디버깅(NATIVE_POST_OK/REJECT) 추가: 서버 입구컷 확인을 위한 응답 스트림 파싱 및 Payload 로깅, `tripId` 파싱 안전성(Type-safe) 향상
- [x] **v4.2.56**: [FEAT] 네이티브 엔진 디버깅(CCTV) 로그 전송 및 앱 종료/스와이프 시 알림 완전 제거 적용
- [x] **v4.2.51**: [ARCH] Doze 모드 관통 아키텍처 — AlarmManager Keepalive 도입 및 PASSIVE_PROVIDER 활용
- [x] **v4.2.50**: [ARCH] 화면 꺼짐 GPS 완전 독립 — HandlerThread/네이티브 역지오코딩/IMPORTANCE_DEFAULT/startForeground 즉시 선언
- [x] **v4.2.49**: [FIX] 긴급알림 목록에 웹 관제용 시스템 명령(SYSTEM_COMMAND)이 함께 표시되는 버그 수정
- [x] **v4.2.48**: [FIX] 앱↔오버레이 실시간 동기화 엇박자 해결 — GPS 수신 즉시 네이티브 gpsText/Color 자체 갱신 (JS throttle 우회)
- [x] **v4.2.48**: [FIX] 화면 복귀 시 GPS 미수신 빨간색 오탐 완전 제거 (lastGpsTimestamp 사전 세팅 제거)
- [x] **v4.2.48**: [NEW] GPS 5초 watchdog — 엘리베이터/터널 5초 이내 즉각 빨간색 표시 (30초→5초)
- [x] **v4.2.48**: [NEW] 실시간 모드 전환 시 네이티브 LocationManager 주기 3초 즉시 동기화
- [x] **v4.2.48**: [NEW] 시작/종료/일시정지/재개 이벤트 포인트 마킹 (TRIP_START/END/PAUSE/RESUME)
- [x] **v4.2.48**: [NEW] 자이로 없는 기기 가속도계 fallback, GPS 좌표 소수점 8자리 정밀도
- [x] **v4.2.47**: [HOTFIX] 오버레이 자립 모드 도입 - 네이티브 서비스에서 자체적으로 GPS 끊짐(30초) 판단
- [x] **v4.2.47**: [HOTFIX] 실시간 추적 중지(REALTIME_OFF) 명령 체계 구축

## 📋 최근 변경 (v4.2.51 — 2026-03-30)
- **Doze 모드 관통 아키텍처**: (v4.2.51)
  - `ServiceKeepaliveReceiver` 추가: `AlarmManager.setExactAndAllowWhileIdle()`을 이용해 90초마다 서비스 생존 확인 및 부활.
  - `LocationManager`에 `PASSIVE_PROVIDER` 추가 및 `minTime=0`으로 시스템 최우선 업데이트 요청.
- **화면 꺼짐 GPS 완전 독립 아키텍처**: JS(WebView) 완전 우회 보장. (v4.2.50)
  - `HandlerThread(ELS_NetworkWorker)`: 단일 Worker Thread 도입.
  - `IMPORTANCE_DEFAULT` 알림채널: One UI 절전 우회.
  - `startForeground()` onCreate 즉시 호출 및 `FOREGROUND_SERVICE_TYPE_LOCATION|DATA_SYNC` 선언.
  - `geocodeAndUpdateOverlay()`: 30초 주기 역지오코딩.
  - WakeLock 개선.
- 긴급알림 SYSTEM_COMMAND 필터링 (v4.2.49)

## ⏳ 다음 할 일
1. 실기기(갤럭시 S25) 필드 테스트 (장거리 주행 및 음영지역 재수신 딜레이 측정)
2. 오프라인 데이터 큐잉 (네트워크 완전 단절 시 로컬 SQLite 저장 후 일괄 전송) 설계

## 🐛 남은 이슈
- 없음 (알려진 모든 치명적 버그 해결됨)
