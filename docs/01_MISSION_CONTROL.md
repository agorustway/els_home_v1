# ELS MISSION CONTROL v4.1.17
> 마지막 업데이트: 2026-03-27 10:05

## 📦 최신 배포 정보 (Release)
- **최신 버전**: `v4.1.17` (Build 63 — 사진 동기화 버그 수정 및 일지 표시 강화)
- **APK 다운로드**: [els_driver.apk](https://www.nollae.com/apk/els_driver.apk)
- **설정 파일**: `web/public/apk/version.json` (v4.1.17 동기화 완료)

## 🎯 현재 목표
드라이버 앱 v4.1.17 긴급 패치 및 사진 저장 무결성 확보

## 📋 최근 변경 (v4.1.17 — 2026-03-27 오전)
- **사진 데이터 동기화 최적화**: `loadCurrentTrip` 시 서버 사진 목록을 강제 로드하여 앱 재시작 시 사진 소실 현상 해결.
- **업로드 로직 정밀화**: `uploadPendingPhotos` 결과 매칭 시 발생하던 인덱스 오류를 해결하고 서버 데이터 기준 동기화 적용.
- **일지 리스트 시인성 강화**: 일지 목록에 📸 아이콘과 사진 개수를 표시하여 저장 여부를 직관적으로 확인 가능.
- **운행 종료 가드 로직**: 사진 업로드 중 종료 시 경고창을 띄워 데이터 유실 방지.

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
