# ELS MISSION CONTROL v4.1.21
> 마지막 업데이트: 2026-03-27 11:45

## 📦 최신 배포 정보 (Release)
- **최신 버전**: `v4.1.21` (Build 67 — 고용량 사진 업로드 실패 방지 및 순차 업로드)
- **APK 다운로드**: [els_driver.apk](https://www.nollae.com/apk/els_driver.apk)
- **설정 파일**: `web/public/apk/version.json` (v4.1.21 동기화 완료 예정)

## 🎯 현재 목표
사진 데이터 무결성 확보 및 모든 케이스에서의 백엔드 저장 보장

## 📋 최근 변경 (v4.1.21 — 2026-03-27)
- **사진 리사이징 도입**: 업로드 전 클라이언트 사이드에서 Max 1600px로 리사이징(JPEG 80%)하여 Vercel의 4.5MB 페이로드 제한 회피.
- **순차 업로드 전환**: 사진 여러 장 첨부 시 병렬이 아닌 순차(Sequential) 업로드로 전환하여 네트워크 안정성 및 DB 정합성 확보.
- **업로드 피드백 강화**: 업로드 성공 시마다 썸네일을 갱신하고 최종 결과를 토스트로 알림.

## 📋 최근 변경 (v4.1.20 — 2026-03-27 오전)
- **운송 시작(Start Trip) 로직 보정**: 서버가 기존 기록을 반환할 때와 신규 기록을 반환할 때 모두 트립 ID를 정확히 획득하도록 수정.
- **사진 업로드 동기화 보강**: `startTrip` 이후 `uploadPendingPhotos` 호출 시 `await`를 적용하여 업로드 완료를 보장.

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
