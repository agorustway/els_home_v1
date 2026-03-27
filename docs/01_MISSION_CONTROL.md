# ELS MISSION CONTROL v4.1.18
> 마지막 업데이트: 2026-03-27 10:16

## 📦 최신 배포 정보 (Release)
- **최신 버전**: `v4.1.18` (Build 64 — 헤더 로고 및 화이트 테마 적용)
- **APK 다운로드**: [els_driver.apk](https://www.nollae.com/apk/els_driver.apk)
- **설정 파일**: `web/public/apk/version.json` (v4.1.18 동기화 완료)

## 🎯 현재 목표
브랜드 아이덴티티가 적용된 최신 UI 배포 및 안정화

## 📋 최근 변경 (v4.1.18 — 2026-03-27 오전)
- **상단 헤더 개편**: "ELS SOLUTION" 텍스트를 공식 로고 GIF로 교체하고 배경을 화이트로 전환.
- **폰트/컬러 최적화**: 헤더 배경색 변경에 따른 뒤로가기 버튼, 차량번호 폰트 색상을 블랙/그레이로 조정.
- **에셋 동기화**: `els_logo_full.gif` 파일을 `out/images`로 복사하여 독립 앱에서도 로고 정상 노출 확인.

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
