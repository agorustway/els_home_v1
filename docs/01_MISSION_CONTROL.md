# ELS MISSION CONTROL v4.1.22
> 마지막 업데이트: 2026-03-27 13:20

## 📦 최신 배포 정보 (Release)
- **최신 버전**: `v4.1.22` (Build 68 — 컨테이너 정보 유효성 검사 및 저장 보강)
- **APK 다운로드**: [els_driver.apk](https://www.nollae.com/apk/els_driver.apk)
- **설정 파일**: `web/public/apk/version.json` (v4.1.22 동기화 완료)

## 🎯 현재 목표
사용자 입력 데이터의 정확성 및 서버 저장 무결성 확보

## 📋 최근 변경 (v4.1.22 — 2026-03-27)
- **컨테이너 번호 유효성 검사**: ISO 6346 BIC 규격 체크 로직 도입. 입력 시 상단에 유효성 여부 표시.
- **정보 저장 로직 강화**: 운행 시작 시 기존 트립이 있으면 해당 정보를 업데이트하도록 수정하고, 운행 종료 시에도 최신 입력값을 다시 한번 동기화하여 누락 방지.
- **자유로운 운행 시작**: 컨테이너 번호가 없어도 운행 시작이 가능한 기존 정책 유지.

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
