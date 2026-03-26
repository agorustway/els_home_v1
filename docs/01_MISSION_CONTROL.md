# ELS MISSION CONTROL v4.1.6
> 마지막 업데이트: 2026-03-26 19:40

## 📦 최신 배포 정보 (Release)
- **최신 버전**: `v4.1.6` (Build 52 — UI 본문 및 사진 연동 완료)
- **APK 다운로드**: [els_driver.apk](https://www.nollae.com/apk/els_driver.apk)
- **설정 파일**: `web/public/apk/version.json` (v4.1.6 동기화 완료)

## 🎯 현재 목표
드라이버 앱 v4.1.6 안정화 버전 배포 및 본문/사진 연동 기능 최종 검증

## 📋 최근 변경 (v4.1.6 — 2026-03-26 밤)
- **공지사항 본문 렌더링**: `innerHTML`과 `<br>` 태그를 활용하여 긴 본문의 줄바꿈을 보존하고, `overflow-y: auto`로 스크롤 가능하게 수정.
- **일지(History) 사진 연동**: `openLog()` 호출 시 서버에서 사진 목록을 가져와 하단에 가로 스크롤 썸네일로 표시하고, 클릭 시 뷰어로 연동.
- **공통 사진 뷰어 모드 분기**: 운행 중 찍은 사진(삭제 가능)과 일지에서 불러온 사진(읽기 전용)을 구분하여 뷰어 처리.
- **Capacitor Sync**: `npx cap sync android` 실행을 통해 웹 에셋 최종 동기화 완료.
- **Bot/통신 이슈 해결**: 앞선 v4.1.5의 www 리다이렉트 해결 및 봇 데이터 오염 차단 로직 그대로 계승.

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
