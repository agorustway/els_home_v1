# ELS MISSION CONTROL v4.1.26
> 마지막 업데이트: 2026-03-27 14:25

## 📦 최신 배포 정보 (Release)
- **최신 버전**: `v4.1.26` (Build 72 — 로고 시인성 및 플러그인 연동 최종 고도화)
- **APK 다운로드**: [els_driver.apk](https://www.nollae.com/apk/els_driver.apk)
- **설정 파일**: `web/public/apk/version.json` (v4.1.26 동기화 완료)

## 🎯 현재 목표
권한 판정의 100% 신뢰성 확보 및 브랜드 가시성 개선 (로고 확대)

## 📋 최근 변경 (v4.1.26 — 2026-03-27)
- **로고 시인성 개선**: 헤더 로고 크기를 28px에서 34px로 확대하고 스타일을 보정하여 트럭 로고가 명확하게 보이도록 수정.
- **플러그인 정식 설치**: 누락되었던 `@capacitor/camera`, `@capacitor/push-notifications`, `@capacitor/geolocation`, `@capacitor/local-notifications` 등을 정식 설치하고 `npx cap sync` 완료.
- **권한 상태 갱신 고도화**: 
  - 버튼 클릭 시 `event.stopPropagation()` 추가로 중복 이벤트 방지.
  - 설정 후 앱 복귀 시 상태 반영을 위해 대기 시간을 2초로 연장.
  - 예외 처리 및 로그 보강으로 판정 정확도 향상.

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
