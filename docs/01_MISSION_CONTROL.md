# ELS MISSION CONTROL v4.1.8
> 마지막 업데이트: 2026-03-26 20:05

## 📦 최신 배포 정보 (Release)
- **최신 버전**: `v4.1.8` (Build 54 — AI 자동 배포 워크플로우 도입)
- **APK 다운로드**: [els_driver.apk](https://www.nollae.com/apk/els_driver.apk)
- **설정 파일**: `web/public/apk/version.json` (v4.1.8 동기화 완료)

## 🎯 현재 목표
드라이버 앱 v4.1.8 안정화 버전 배포 및 신규 `/deploy` 워크플로우 검증

## 📋 최근 변경 (v4.1.8 — 2026-03-26 밤)
- **AI 자동 배포 워크플로우 (/deploy)**: 안드로이드 SDK(Gradle) 빌드부터 버전 업데이트, 문서 기록, 커밋 및 푸시까지 한 번에 수행하는 워크플로우 정의 및 `docs/07_RUNBOOK.md` 반영.
- **운행 데이터 초기화 고도화**: 운행 종료 및 수동 '초기화' 버튼을 통해 기기 내 잔상 데이터를 완벽히 제거하는 v4.1.7 기능 탑재.
- **권한 설정 접근성**: 설정 화면 내 권한 버튼 추가 및 시스템 설정 페이지 다이렉트 연결 로직 최적화.

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
