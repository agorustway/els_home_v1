# ELS MISSION CONTROL v4.1.5
> 마지막 업데이트: 2026-03-26 19:20

## 📦 최신 배포 정보 (Release)
- **최신 버전**: `v4.1.5` (Build 51 — 통신 및 데이터 무결성 확보)
- **APK 다운로드**: [els_driver.apk](https://www.nollae.com/apk/els_driver.apk)
- **설정 파일**: `web/public/apk/version.json` (v4.1.5 동기화 완료)

## 🎯 현재 목표
드라이버 앱 v4.1.5 안정화 버전 배포 및 컨테이너 이력조회 데이터 오염 방지 검증

## 📋 최근 변경 (v4.1.2 ~ v4.1.5 — 2026-03-26)
- **통신 경로 수정 (BASE_URL)**: `nollae.com` → `www.nollae.com` 으로 변경. (Vercel 307 리다이렉트를 CapacitorHttp가 처리 못해 발생하는 "ID 누락" 현상 원천 차단)
- **공지사항 테이블 동기화**: 앱이 일반 게시판(`posts`) 대신 관제 전용 공지(`notices`) 테이블을 바라보도록 API 및 로직 수정.
- **사진 업로드 규격 최적화**: 서버 기대 규격(`{photos:[]}`)에 맞춰 앱 페이로드 구조 변경 및 성공/실패 토스트 안내 추가.
- **오버레이/배터리 권한 유도**: 네이티브 플러그인 오류 시 앱 설정 화면으로 직접 연결하는 폴백 로직 강화.
- **컨테이너 이력조회(Bot)**: 입력창 강제 초기화(JS Event) 및 결과 데이터 필터링 로직 추가로 타 컨테이너 데이터 섞임 현상 해결.

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
