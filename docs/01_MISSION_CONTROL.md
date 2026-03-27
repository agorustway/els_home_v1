# ELS MISSION CONTROL v4.1.23
> 마지막 업데이트: 2026-03-27 13:55

## 📦 최신 배포 정보 (Release)
- **최신 버전**: `v4.1.23` (Build 69 — 권한 UI 개선 및 자동 업데이트 팝업)
- **APK 다운로드**: [els_driver.apk](https://www.nollae.com/apk/els_driver.apk)
- **설정 파일**: `web/public/apk/version.json` (v4.1.23 동기화 완료)

## 🎯 현재 목표
사용자 초기 진입 경험 최적화 및 앱 버전 관리 자동화

## 📋 최근 변경 (v4.1.23 — 2026-03-27)
- **자동 업데이트 팝업**: 앱 시작 시 서버의 `versionCode`를 체크하여 상위 버전이 있을 경우 즉시 설치 권유 팝업 표시.
- **권한 설정 UI 보완**: 
  - 브라우저 API 대신 Capacitor 네이티브 플러그인(`checkPermissions`)을 사용하여 권한 상태 판정 속도와 정확도 향상.
  - 권한 상태 값 동기화 버그 수정 (허용됨/미설정 실시간 반영).
  - 버튼 클릭 시 `btn-active` 시각 효과 및 토스트 알림 추가.
- **초기 진입 로직 수정**: `permSetupDone`을 통해 첫 설치 시 무조건 권한 설정 페이지를 먼저 거치도록 안정화.

## 📋 최근 변경 (v4.1.20 — 2026-03-27 오전)
- **운송 시작(Start Trip) 로직 보정**: 서버가 기존 기록을 반환할 때와 신규 기록을 반환할 때 모두 트립 ID를 정확히 획득하도록 수정.
- **사진 업로드 동기화 보강**: `startTrip` 이후 `uploadPendingPhotos` 호출 시 `await`를 적용하여 업로드 완료를 보장.

### 탭 구조 변경
- **4탭**: 공지 / 운행 / 일지 / 종료
- **설정 인라인**: 운행 탭 하단 (별도 탭 없음)

- `web/out/index.html` (완전 재작성)
- `web/out/style.css` (완전 재작성 — 화이트/각진/댄디)
- `web/out/app.js` (완전 재작성 — IIFE 번들)
- `web/android/.../EmergencyPlugin.java` (신규)
- `web/app/api/vehicle-tracking/emergency/route.js` (신규)
- `web/supabase_sql/emergency_notices.sql` (신규)

## ⏳ 다음 할 일
1. Supabase에서 `emergency_notices.sql` 실행
2. `npx cap sync android` 실행 (web 폴더에서)
3. Android Studio에서 APK 빌드 (디버그 or 릴리즈)
4. 실기기(갤럭시 S25) 설치 후 기능 검증

## 🐛 남은 이슈
- 긴급알림 발송 UI는 웹 차량관제 페이지에 추가 예정 (별도 작업)
- Supabase `emergency_notices` 테이블 생성 전까지 긴급알림 폴링은 404 무시됨
