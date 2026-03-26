# ELS MISSION CONTROL v4.1.7
> 마지막 업데이트: 2026-03-26 19:53

## 📦 최신 배포 정보 (Release)
- **최신 버전**: `v4.1.7` (Build 53 — 데이터 초기화 및 권한 접근성 개선)
- **APK 다운로드**: [els_driver.apk](https://www.nollae.com/apk/els_driver.apk)
- **설정 파일**: `web/public/apk/version.json` (v4.1.7 동기화 완료)

## 🎯 현재 목표
드라이버 앱 v4.1.7 안정화 버전 배포 및 권한 설정 진입 최종 검증

## 📋 최근 변경 (v4.1.7 — 2026-03-26 밤)
- **운행 데이터 초기화 (Reset)**: 운행 탭 상단에 **🗑️ 초기화** 버튼 추가. 클릭 시 컨테이너 정보, 사진, 메모 등 모든 입력값 즉시 소거.
- **운행 종료 시 자동 초기화**: `endTrip()` 호출 시 서버 응답 완료 후 자동으로 기기 내 트립 데이터를 초기화하여 다음 배차 준비 상태로 전환.
- **권한 설정 접근성 개선**: 설정(Settings) 화면에 **⚙️ 권한 설정** 버튼을 추가해 언제든 권한 화면(`permission-screen`)으로 진입하거나 시스템 설정으로 바로 이동 가능하게 처리.
- **권한 상태 UI 폴백**: 수동으로 설정해도 빨간색으로 표시되던 이슈를 해결하기 위해 `updatePermStatuses` 호출 주기를 단축(500ms)하고 접근 경로를 다각화.
- **Capacitor Sync**: `npx cap sync android` 실행 후 빌드 대기 중.

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
