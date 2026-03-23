# ELS MISSION CONTROL v3.7.2
> 마지막 업데이트: 2026-03-23 21:15

## 🎯 현재 목표
드라이버 앱 GPS 가시성 개선 및 백그라운드 센서 연동 (v3.7.1)

## 📋 최근 변경 (v3.7.2)
- **프리미엄 권한 센터 개편**: DB손해보험 스타일의 직관적이고 미려한 온보딩 UI 전면 적용.
- **오버레이 해결 가이드**: 갤럭시 등 최신 기기에서 발생하는 '제한된 설정 허용' 해결법을 앱 내부에 직접 배치.
- **APK 최신 배포 (v3.7.2)**: 권한 UI 및 실시간 가이드가 포함된 `els_driver.apk` 빌드 및 `web/public/apk/` 배포 완료.
- **권한 상태 실시간 연동**: 각 항목 허용 시 초록색 불(dot-green)이 즉시 들어오도록 UX 강화.

## 📋 최근 변경 (v3.6.2)
- **차량 정보 조회 매핑 복구**: `business_number` ↔ `vehicle_number` 혼용 지원 및 `maybeSingle`로 안정적 조회. 
- **데이터 필드 보정**: API에서 `business_number`로 강제 통일하여 리턴 (기존 app.js 호환성 유지).
- **운송 시작 페이로드 수정**: `startTrip` 시 `vehicle_id`가 누락되던 현상 해결 (ID 수기로 쳐도 서버에 안 들어가던 문제).
- **오버레이 브릿지 대기**: `waitForBridge()` 도입으로 앱 구동 시 Capacitor 브릿지 로딩 전 권한 체크 실패 방지.
- **index.html 정리**: 404를 유발하던 `capacitor.js` 호출 제거 (브릿지가 자동 주입됨).

## 📋 최근 변경 (v3.6.1)
- **전화번호 조회 RLS 우회**: 미인증 상태에서 차량 ID를 가져오지 못하는 문제 해결을 위해 `adminClient`로 우회.
- **Capacitor 동적 바인딩**: `app.js`에서 Capacitor 객체를 동적으로 참조하여 플러그인 누락에 의한 "앱에서만 사용가능" 메시지 방지.
- **사진 업로드 원복 (Base64)**: Capacitor Fetch 환경에서 FormData(Blob)이 깨지는 현상이 재발하여 `Base64` 변환 후 JSON 데이터로 재수정.

## 📋 최근 변경 (v3.6.0)
- **사진 업로드 방식 변경**: Base64(JSON) 방식에서 **FormData(Multipart)** 방식으로 전환. 1MB 용량 제한 및 Vercel/Next.js 업로드 Drop 현상 해결.
- **데이터 매핑 수정**: 기사 정보 조회 시 `driver_id` -> `vehicle_id` 누락 문제 해결 (DB 컬럼명 불일치 대응).
- **하단 탭 레이아웃 수정**: `grid-template-columns` 4분할(`repeat(4, 1fr)`) 적용으로 **종료** 버튼 찌그러짐 현상 해결.
- **앱 종료 기능 활성화**: `window.exitApp` 전역 바인딩으로 클릭 이벤트 정상 연결.
- **Capacitor 로드 안정화**: `index.html`에 `capacitor.js` 명시적 로드 추가로 오버레이 플러그인 초기화 누락 방지.

## ⏳ 다음 할 일
1. `npx cap sync android` 실행하여 안드로이드 프로젝트 동기화 (필수)
2. Android Studio에서 APK 빌드 & 실기기 테스트 (제일 중요)
3. 실기기에서 전화번호 조회 -> 차량코드 자동 입력 확인
4. 구글 정책(Android 16)에 맞게 사진, 오버레이 정상 동작 확인

## 🐛 남은 이슈
- 없음
