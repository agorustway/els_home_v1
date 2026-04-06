# ELS MISSION CONTROL
> 마지막 업데이트: 2026-04-07 (KST)

## 📦 최신 배포 정보
- **Current Build**: `v4.9.4` (versionCode 494)
- **APK**: `web/public/apk/els_driver.apk`
- **Vercel**: `nollae.com` (main 브랜치 자동 배포)
- **Repo**: main 브랜치 up-to-date

## ⚠️ APK 빌드 절차 (필독)
```
# ✅ 올바른 APK 빌드
powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1

# ❌ 절대 금지 (흰화면/캐시 지옥 유발)
npx cap sync   ← 단독 실행 금지
web/android/app/src/main/assets/public/ ← 직접 편집 금지
```
드라이버 앱 소스 = `web/driver-src/` | 버전 소스 = `build.gradle` 단일 진실

---

## 🚧 IN-PROGRESS — v4.9.5 버그 수정 세션 (2026-04-07)

### ✅ 해결된 항목
| 항목 | 수정 내용 | 버전 |
|------|----------|------|
| 지도 탭 프로필 검사 우회 | `onclick="App.openMap()"` → `App.switchTab('map')`으로 변경 | v4.9.x |
| 사진 뷰어 핀치줌 피벗 | `transform-origin: 0 0` → `50% 50%`, JS pivot 좌표 수정 | v4.9.x |
| 개인정보 모달 미표시 | HTML `modal-terms` 추가, `style.display` 방식으로 변경 | v4.9.x |
| 권한 가이드 모달 미표시 | HTML `modal-guide-android16` 추가 | v4.9.x |
| 수동 권한 버튼 무반응 | `requestPerm()` → `executeRealRequest()` 직접 호출로 변경 | v4.9.x |
| 순차 자동설정 hang | `classList.add('active')` → `style.display='flex'` | v4.9.4 |
| 사진 뷰어 깨짐(trip) | viewer가 `serverUrl||dataUrl` → `dataUrl||serverUrl`로 변경 | v4.9.4 |
| 배터리 다이얼로그 뒤에 숨김 | 순차 자동설정에서 배터리 제외, 수동 설정 안내로 변경 | v4.9.5 |
| 사진 깨짐 시 무표시 | img onerror fallback 추가 (빨간 배경 + 콘솔 로그) | v4.9.5 |
| 일지 사진 삭제 후 잔존 | closePhotoViewer 후 openLog 재호출로 서버 동기화 강화 | v4.9.5 |

### ❌ 미해결 항목

#### 1. NAS S3 사진 프록시 500 에러 (핵심 미해결)
- **증상**: 운행 사진 업로드는 성공하나, 일지에서 사진 조회 시 깨짐(X표시)
- **진단 결과**: `GET /api/vehicle-tracking/photos/view?key=...` → Vercel → NAS S3 `GetObject` 실패 500
- **모순**: 업로드(`PutObject`)는 성공 = S3 엔드포인트 연결 정상. 그런데 `GetObject`만 실패?
- **NAS_ENDPOINT**: `https://elssolution.synology.me` (공인 DDNS, Vercel 접근 가능 확인)
- **확인 필요**:
  1. Vercel Functions 로그에서 `[NAS-VIEW-ERROR]` 메시지 확인 (실제 S3 에러 내용)
  2. 브라우저에서 실제 사진 URL 직접 접속 테스트
  3. NAS MinIO 서비스 상태 확인 (재시작 필요할 수 있음)
- **코드상 차이 없음**: 리팩토링 전후 서버 API(`photos/route.js`, `photos/view/route.js`) 코드 변경 없음

### 📋 사진 문제 근본 해결 방향
- **단기**: Vercel Functions 로그에서 실제 에러 확인 → NAS MinIO 재시작 또는 설정 확인
- **중기**: S3 `GetObject` 대신 presigned URL 방식으로 전환 (Vercel 프록시 우회)
- **장기**: Supabase Storage로 사진 저장소 이전 (CDN URL 직접 제공, 프록시 불필요)

---

## 🗺️ 주요 상세 문서
- **[02. DEVELOPMENT LOG](./02_DEVELOPMENT_LOG.md)**
- **[04. MASTER ARCHITECTURE](./04_MASTER_ARCHITECTURE.md)**
- **[05. NAS API SPEC](./05_NAS_API_SPEC.md)**
- **[07. RUNBOOK](./07_RUNBOOK.md)**

---
*최종 갱신: 2026-04-07 (by Claude Sonnet 4.6)*
