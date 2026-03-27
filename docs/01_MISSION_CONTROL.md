# ELS MISSION CONTROL v4.1.19
> 마지막 업데이트: 2026-03-27 10:28

## 📦 최신 배포 정보 (Release)
- **최신 버전**: `v4.1.19` (Build 65 — 사진 저장 버그 패치 및 헤더 UI 조정)
- **APK 다운로드**: [els_driver.apk](https://www.nollae.com/apk/els_driver.apk)
- **설정 파일**: `web/public/apk/version.json` (v4.1.19 동기화 완료)

## 🎯 현재 목표
사진 저장 안정성 확보 및 헤더 UI 마감 완성

## 📋 최근 변경 (v4.1.19 — 2026-03-27 오전)
- **사진 업로드 데이터 타입 버그 수정**: `readFileAsDataURL`에서 문자열(Base64)이 들어올 경우 처리하지 못해 업로드가 중단되던 현상을 수정하여 사진 저장 무결성 확보.
- **헤더 뒤로가기 아이콘 제거**: 사용자 요청에 따라 로고 앞에 표시되던 `<` 아이콘을 숨김 처리.
- **빌드 및 배포**: v4.1.19 (Build 65) 버전으로 빌드 및 OTA 배포 준비 완료.

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
