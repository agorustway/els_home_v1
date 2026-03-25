# ELS MISSION CONTROL v4.0.9
> 마지막 업데이트: 2026-03-26 01:20

## 📦 최신 배포 정보 (Release)
- **최신 버전**: `v4.0.9` (Build 11 — UI/UX 안정화)
- **APK 다운로드**: [els_driver.apk](https://www.nollae.com/apk/els_driver.apk)
- **설정 파일**: `web/public/apk/version.json` (빌드 후 동기화 필요)

## 🎯 현재 목표
드라이버 앱 v4.0.9 UI/UX 및 공지사항/운송 시작 기능 안정성 최종 검토

## 📋 최근 변경 (v4.0.9 — 2026-03-26)
- **설정 화면 레이아웃**: 세로 배치로 변경하여 모든 화면에서 조회 버튼 노출 보장
- **공지사항 로딩 보강**: API 응답 데이터(posts/notices) 유동적 파싱 적용
- **권한 설정 실시간 동기화**: 시스템 권한 상태와 앱 UI 동기화 로직 전면 수정
- **안드로이드 네비바 시인성**: 하단 탭 바 Safe-area 대응 및 배경색 조정
- **운송 시작 방어 로직**: CapHttp 응답 문자열 파싱 예외 처리 강화

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
