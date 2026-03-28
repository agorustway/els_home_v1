# ELS MISSION CONTROL v4.1.32
> 마지막 업데이트: 2026-03-28 14:26

## 📦 최신 배포 정보 (Release)
- **최신 버전**: `v4.1.32` (Build 78 — 안드로이드 16 Baklava 대응 및 네이티브 로그 강화)
- **APK 다운로드**: [els_driver.apk](https://www.nollae.com/apk/els_driver.apk)
- **설정 파일**: `web/public/apk/version.json` (v4.1.27 동기화 완료)

## 🎯 현재 목표
권한 설정 연동의 무결성 확보 및 앱 안정성 강화

## 📋 최근 변경 (v4.1.30 — 2026-03-28)
- **런타임 에러(`ReferenceError`) 해결**: 앱 실행 시 `permStatuses` 변수 참조 순서 오류로 인해 멈추는 치명적 결함을 수정.
- **권한 연동 정밀도 고도화**: 
  - 설정 창에서 복귀 시 상태가 즉시 반영되도록 **0.3초의 딜레이 동기화** 로직 도입.
  - 비동기 위치/알림 체크 폴백 로직의 타이밍을 동기화하여 UI 상태 판별의 신뢰도 향상.
- **수동 새로고침 버튼 활성화**: 권한 설정 화면의 [새로고침] 버튼이 실제 시스템 상태를 다시 읽어오도록 함수 연결 완료.

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
