# ELS MISSION CONTROL v4.0.0
> 마지막 업데이트: 2026-03-25 22:10

## 📦 최신 배포 정보 (Release)
- **최신 버전**: `v4.0.0` (Build 1 — 완전 재구축)
- **APK 다운로드**: [els_driver.apk](https://www.nollae.com/apk/els_driver.apk)
- **설정 파일**: `web/public/apk/version.json` (빌드 후 동기화 필요)

## 🎯 현재 목표
드라이버 앱 v4.0.0 APK 빌드 및 삼성 갤럭시S25 실기기 검증

## 📋 최근 변경 (v4.0.0 — 2026-03-25 완전 재구축)

### 핵심 변경
- **앱 에셋 Git 추적 시작**: `web/.gitignore`의 `/out/` 제외 해제 → Git 롤백 가능
- **안드로이드 에셋 Git 추적 시작**: `web/android/.gitignore`의 `assets/public` 제외 해제
- **PIP 완전 제거**: 화면 꺼짐 시 GPS 초기화 문제의 근본 원인 제거
- **오버레이 위젯 재설계**: 표시 전용(운송상태/운행시간/GPS간격) + 클릭시 앱 복귀, 버튼 없음
- **GPS 유동적 수신**: 속도 기반(30초~300초) + 자이로스코프 급회전 즉시 전송
- **긴급알림 시스템**: 관리자(웹) 발송 → 앱 30초 폴링 → 네이티브 고우선 알림 + 진동

### 탭 구조 변경
- **4탭**: 공지 / 운행 / 일지 / 종료
- **설정 인라인**: 운행 탭 하단 (별도 탭 없음)

### 신규 파일
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
