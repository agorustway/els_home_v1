# ELS MISSION CONTROL v4.1.24
> 마지막 업데이트: 2026-03-27 14:05

## 📦 최신 배포 정보 (Release)
- **최신 버전**: `v4.1.24` (Build 70 — 초기 설정 강제 및 권한 체크 최종 보강)
- **APK 다운로드**: [els_driver.apk](https://www.nollae.com/apk/els_driver.apk)
- **설정 파일**: `web/public/apk/version.json` (v4.1.24 동기화 완료)

## 🎯 현재 목표
필수 권한 획득 보장 및 브랜드 아이덴티티 강화 (로고 반영)

## 📋 최근 변경 (v4.1.24 — 2026-03-27)
- **초기 로직 강화**: 
  - `permSetupDone` 여부와 관계없이 필수 권한(위치, 오버레이, 배터리) 중 하나라도 미설정 상태면 앱 시작 시 권한 페이지 강제 노출.
  - 권한 상태 판정 및 UI 텍스트 업데이트 로직 전면 보강.
- **UI/UX 개선**:
  - 앱 로고를 `els_driver_logo.png`로 교체.
  - 설정 페이지 내 중복된 권한 버튼 제거.
  - 앱 초기화 버튼 문구를 `앱 초기화 (설정 초기화)`로 변경.

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
