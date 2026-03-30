# ELS MISSION CONTROL v4.2.52
> 마지막 업데이트: 2026-03-30 20:46 (KST)

## 📦 최신 배포 정보 (Release)
- **현재 버전**: `v4.2.52` (Build 196)
- **최근 업데이트**: 2026-03-30
- **상태**: 🔵 배포 완료 — FusedLocationProviderClient + PendingIntent 반영
- **APK 다운로드**: [els_driver.apk](https://www.nollae.com/apk/els_driver.apk)
- **설정 파일**: `web/public/apk/version.json` (v4.2.52)

### 🎯 주요 마일스톤
- [x] **v4.2.52**: [ARCH] Doze 정면돌파: FusedLocationProviderClient + PendingIntent 도입 및 Manifest 인텐트 필터 설정
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
