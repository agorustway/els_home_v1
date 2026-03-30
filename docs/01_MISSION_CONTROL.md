# ELS MISSION CONTROL v4.2.48
> 마지막 업데이트: 2026-03-30 13:42 (KST)

## 📦 최신 배포 정보 (Release)
- **현재 버전**: `v4.2.48` (Build 192)
- **최근 업데이트**: 2026-03-30
- **상태**: 🟡 소스 수정 완료 — Android Studio 빌드 & APK 배포 대기
- **APK 다운로드**: [els_driver.apk](https://www.nollae.com/apk/els_driver.apk)
- **설정 파일**: `web/public/apk/version.json` (v4.2.48)

### 🎯 주요 마일스톤
- [x] **v4.2.48**: [FIX] 앱↔오버레이 실시간 동기화 엇박자 해결 — GPS 수신 즉시 네이티브 gpsText/Color 자체 갱신 (JS throttle 우회)
- [x] **v4.2.48**: [FIX] 화면 복귀 시 GPS 미수신 빨간색 오탐 완전 제거 (lastGpsTimestamp 사전 세팅 제거)
- [x] **v4.2.48**: [NEW] GPS 5초 watchdog — 엘리베이터/터널 5초 이내 즉각 빨간색 표시 (30초→5초)
- [x] **v4.2.48**: [NEW] 실시간 모드 전환 시 네이티브 LocationManager 주기 3초 즉시 동기화
- [x] **v4.2.48**: [NEW] 시작/종료/일시정지/재개 이벤트 포인트 마킹 (TRIP_START/END/PAUSE/RESUME)
- [x] **v4.2.48**: [NEW] 자이로 없는 기기 가속도계 fallback, GPS 좌표 소수점 8자리 정밀도
- [x] **v4.2.47**: [HOTFIX] 오버레이 자립 모드 도입 - 네이티브 서비스에서 자체적으로 GPS 끊짐(30초) 판단
- [x] **v4.2.47**: [HOTFIX] 실시간 추적 중지(REALTIME_OFF) 명령 체계 구축

## 📋 최근 변경 (v4.2.48 — 2026-03-30)
- **앱↔오버레이 동기화 엇박자 해소**: `onLocationChanged` 수신 즉시 네이티브에서 gpsText/Color 갱신 → JS 백그라운드 throttle과 완전 독립
- **포그라운드 복귀 오탐 제거**: `lastGpsTimestamp = now` 사전 세팅 로직 제거, `getCurrentPosition` 성공 후에만 갱신
- **GPS 5초 watchdog**: 타이머 내 5초마다 체크 → 실시간 모드 15초, 일반 모드 30초 dead 기준
- **이벤트 마킹**: TRIP_START/PAUSE/RESUME/END 마커를 `vehicle_locations` DB에 저장 및 지도 표시 가능

## ⏳ 다음 할 일
1. 실기기(갤럭시 S25) 필드 테스트 (장거리 주행 및 음영지역 재수신 딜레이 측정)
2. 오프라인 데이터 큐잉 (네트워크 완전 단절 시 로컬 SQLite 저장 후 일괄 전송) 설계

## 🐛 남은 이슈
- 없음 (알려진 모든 치명적 버그 해결됨)
