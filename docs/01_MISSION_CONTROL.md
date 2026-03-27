# ELS MISSION CONTROL v4.1.27
> 마지막 업데이트: 2026-03-27 14:40

## 📦 최신 배포 정보 (Release)
- **최신 버전**: `v4.1.27` (Build 73 — 앱 아이콘 교체 및 시스템 설정 연동 강화)
- **APK 다운로드**: [els_driver.apk](https://www.nollae.com/apk/els_driver.apk)
- **설정 파일**: `web/public/apk/version.json` (v4.1.27 동기화 완료)

## 🎯 현재 목표
사용자가 권한 설정을 완료했을 때의 상태 감지 정확도와 앱 브랜드 아이덴티티(아이콘) 완성

## 📋 최근 변경 (v4.1.27 — 2026-03-27)
- **앱 아이콘 전면 교체**: 안드로이드 런처 아이콘(Square/Round/Adaptive)을 모두 신규 트럭 로고로 교체.
- **시스템 설정 연동 보완**: 
  - '다른 앱 위에 표시' 및 '배터리 최적화 제외' 버튼 클릭 시 바로 안드로이드의 **[앱 정보]** 화면으로 이동하도록 수정 (사용자가 직접 메뉴를 찾아 설정하기 용이하도록 안내문구 포함).
- **수동 새로고침 버튼 도입**: 권한 설정 화면 우측 상단에 **[새로고침]** 버튼을 추가하여, 설정 완료 후 앱 복귀 시 사용자가 수동으로 권한 상태를 재확인할 수 있도록 함.
- **상태 체크 정밀도 향상**: 네이티브 브릿지 응답 대기 시간을 2초로 유지하며, 수동 설정 건에 대해 판정 로직이 더 정확하게 동작하도록 보강.

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
