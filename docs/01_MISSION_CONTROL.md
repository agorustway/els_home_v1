# ELS MISSION CONTROL v4.1.25
> 마지막 업데이트: 2026-03-27 14:10

## 📦 최신 배포 정보 (Release)
- **최신 버전**: `v4.1.25` (Build 71 — 권한 체크 보완 및 로고 표시 정상화)
- **APK 다운로드**: [els_driver.apk](https://www.nollae.com/apk/els_driver.apk)
- **설정 파일**: `web/public/apk/version.json` (v4.1.25 동기화 완료)

## 🎯 현재 목표
권한 획득 여부를 100% 신뢰할 수 있는 상태로 보정하고 UI 표시 무결성 확보

## 📋 최근 변경 (v4.1.25 — 2026-03-27)
- **로고 표시 정상화**: `web/out/` 빌드 결과물에 `els_driver_logo.png` 파일을 명시적으로 복사하여 앱 내 로고 미출력 문제 해결.
- **권한 체크 폴백(Fallback) 도입**: 
  - Capacitor 플러그인 응답이 늦거나 없는 경우 브라우저 표준 API(`navigator.geolocation` 등)를 순차적으로 사용하여 상태를 판정.
  - `prompt`나 `denied` 상황에서도 UI 텍스트(`미허용`)가 정확히 반영되도록 로직 개선.
- **이벤트 핸들링 개선**: 권한 '설정' 버튼 클릭 시 `event` 객체를 명확히 전달하여 버튼 활성화 상태 피드백 기능을 정상화.
- **캐시 방지 적용**: `index.html` 내 `app.js` 호출 시 버전 쿼리 파라미터를 업데이트하여 코드 변경 사항이 즉시 적용되도록 조치.

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
