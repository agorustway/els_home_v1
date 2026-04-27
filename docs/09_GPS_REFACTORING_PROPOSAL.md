# 🚀 차량위치관제 (GPS) 리팩토링 완료 보고서

## 1. 문제 원인 분석

1. **백그라운드 위치 수집 중단**: `navigator.geolocation.watchPosition` 사용으로 인해 Android OS 배터리 절감 정책에 의해 WebView 백그라운드 전환 시 GPS 강제 중단.
2. **커브길 누락/부정확한 궤적**: 수집 간격 30~60초로 너무 길어 포인트 부족. 자이로센서 우회 로직이 간격 제한에 걸려 미작동.

## 2. 적용된 변경사항 (v5.10.0)

### ✅ Step 1: 네이티브 BackgroundGeolocation 전환
- **`web/driver-src/modules/gps.js`**: 전면 재작성
  - `navigator.geolocation.watchPosition` → `@capacitor-community/background-geolocation` (`addWatcher`) 교체
  - 네이티브 포그라운드 서비스 레벨에서 GPS 수집 → **백그라운드에서도 절대 안 죽음**
  - 브라우저 개발 환경을 위한 `navigator.geolocation` 폴백은 유지
- **`web/capacitor.config.ts`**: `android.useLegacyBridge: true` 추가 (플러그인 공식 권장, 5분 백그라운드 중단 방지)

### ✅ Step 2: 수집 빈도 대폭 상향
| 구분 | 변경 전 | 변경 후 |
|------|---------|---------|
| **수집 트리거** | 시간 기반만 | 시간 + **거리(10m) 기반** |
| **고속(80+kph)** | 30초 | **5초** |
| **중속(40-80kph)** | 45초 | **8초** |
| **저속/정지** | 60초 | **10초** |
| **실시간 모드** | 3초 | 3초 (유지) |
| **정확도 필터** | 200m 초과 스킵 | **500m** 초과만 스킵 |
| **기지국 위치 차단** | speed null 시 스킵 | **제거** (네이티브는 GPS만 사용) |

### ✅ Step 3: 코드 찌꺼기 제거
- **제거 항목**:
  - `handleGyro()`, `handleMotion()` — 자이로/모션 이벤트 핸들러
  - `gyroData` 객체 및 관련 판단 로직
  - `_lastGpsRetry` 심폐소생 타이머
  - `resumeGracePeriod` 플래그 (init.js)
  - 포그라운드 복귀 시 `navigator.geolocation.getCurrentPosition` 강제 수신 로직 (init.js)
- **강건화**:
  - 오프라인 큐 순차 전송(`flushOfflineQueue`) — 동시 전송 방지, 실패건 별도 보관
  - GPS source 태그를 `webview` → `native_bg` / `native_forced`로 변경

### 수정된 파일 목록
| 파일 | 변경 내용 |
|------|----------|
| `web/driver-src/modules/gps.js` | **전면 재작성** — 네이티브 플러그인 전환 |
| `web/driver-src/modules/init.js` | 포그라운드 복귀 로직 축소 (32줄 → 6줄) |
| `web/capacitor.config.ts` | `android.useLegacyBridge: true` 추가 |

## 3. AndroidManifest 확인
- `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION` ✅ 이미 선언됨
- `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` ✅ 이미 선언됨
- `POST_NOTIFICATIONS` ✅ 이미 선언됨

## 4. 배포 시 주의사항
- **APK 재빌드 필수**: `capacitor.config.ts` 변경 및 gps.js 변경 반영을 위해 APK 빌드 스크립트 실행 필요
- `powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1`
- 배포 후 드라이버 앱에서 운행 시작 → 백그라운드 전환 → 위치 수집 지속 여부 필드 테스트 필요

---
*작성: 2026-04-27 (by Opus | v5.10.0 GPS Refactoring)*
