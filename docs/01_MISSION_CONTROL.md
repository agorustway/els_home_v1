# ELS MISSION CONTROL v4.1.16
> 마지막 업데이트: 2026-03-27 09:33

## 📦 최신 배포 정보 (Release)
- **최신 버전**: `v4.1.16` (Build 62 — 사진 뷰어 줌/이동 및 일지 시퀀스 고도화)
- **APK 다운로드**: [els_driver.apk](https://www.nollae.com/apk/els_driver.apk)
- **설정 파일**: `web/public/apk/version.json` (v4.1.16 동기화 완료)

## 🎯 현재 목표
드라이버 앱 v4.1.16 배포 및 사진 관련 UX 최적화 완료

## 📋 최근 변경 (v4.1.16 — 2026-03-27 아침)
- **사진 뷰어(Pinch-Zoom) 고도화**: 더블 탭 확대/축소, 줌 상태에서 자연스러운 Panning 및 경계 제한 구현.
- **일지 사진 첨부/삭제 통합**: 일지 내역에서 사진 첨부 즉시 반영(`await` 로직 적용) 및 일지 사진 삭제 기능 신규 탑재.
- **코드 리팩토링**: 중복된 뷰어 로직을 하나로 통합하여 유지보수성 향상.
- **APK 자동 빌드**: `/deploy` 워크플로우를 통한 v4.1.16 빌드 및 OTA 배포 준비 완료.

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
