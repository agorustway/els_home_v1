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

## 🚧 IN-PROGRESS — v4.9.x 버그 수정 세션 (2026-04-07)

### ✅ 해결된 항목
| 항목 | 수정 내용 | 버전 |
|------|----------|------|
| 지도 탭 프로필 검사 우회 | `onclick="App.openMap()"` → `App.switchTab('map')`으로 변경 | v4.9.x |
| 사진 뷰어 핀치줌 피벗 | `transform-origin: 0 0` → `50% 50%`, JS pivot 좌표 수정 | v4.9.x |
| 개인정보 모달 미표시 | HTML `modal-terms` 추가, `style.display` 방식으로 변경 | v4.9.x |
| 권한 가이드 모달 미표시 | HTML `modal-guide-android16` 추가 | v4.9.x |
| 수동 권한 버튼 무반응 | `requestPerm()` → `executeRealRequest()` 직접 호출로 변경 | v4.9.x |
| 순차 자동설정 hang | `classList.add('active')` → `style.display='flex'` (CSS .active 룰 없었음) | v4.9.4 |
| 사진 뷰어 깨짐(trip) | viewer가 `serverUrl||dataUrl` 순서 → `dataUrl||serverUrl`로 변경 | v4.9.4 |

### ❌ 미해결 항목 (차기 세션 이어받기)

#### 1. 사진 업로드 후 일지(log) 상세 사진 깨짐
- **증상**: 운행 일지 상세에서 사진 X 표시
- **원인**: 일지 사진은 서버 URL만 있음 (`p.url = '/api/vehicle-tracking/photos/view?key=...'`). 이 URL이 Vercel → NAS S3 프록시를 거치는데, NAS 접근 실패 시 500 반환 → 이미지 X
- **구조**: `GET /api/vehicle-tracking/photos/view?key=...` → `view/route.js` → NAS S3 GetObject
- **확인 필요**: NAS_ENDPOINT 환경변수가 Vercel에서 실제 접근 가능한지 확인 (공인 IP/도메인인지, 사설 IP면 Vercel에서 못 닿음)
- **임시 우회**: trip 사진은 dataUrl 우선으로 고쳐서 세션 중에는 표시됨. 앱 재시작 후 일지 사진은 여전히 서버 URL에 의존.

#### 2. 순차 자동 권한 설정 — 실기기 동작 미검증
- **증상**: `requestAllPerms()` 실행 시 overlay/battery 모달은 이제 표시됨(v4.9.4 수정). 그러나 `waitForForeground(8000)`가 실기기에서 안정적으로 동작하는지 미검증.
- **원인 추정**: Android가 설정창을 열 때 WebView `appStateChange { isActive: false }` 이벤트가 항상 발생하지 않을 수 있음. 타임아웃 8초 후 resolve → 다음 권한으로 넘어가지만 설정창이 열려 있을 수 있음.
- **참고**: 구 바닐라 JS (commit `21f43cf`)에는 `waitForForeground` 자체가 없었음. 순차 자동설정은 신규 기능. 구 코드는 수동 버튼만 있었고 잘 동작했음.
- **검증 필요**: v4.9.4 APK 설치 후 "순차 자동 설정" 버튼 → overlay → battery 모달이 차례로 표시되는지 실기기 테스트.

### 📋 다음 작업자를 위한 가이드

**권한 문제 근본 해결 방향** (미시도):
- `waitForForeground` 제거하고 `appStateChange` 전역 리스너에서 포그라운드 복귀 시마다 `updatePermStatuses()` 후 다음 권한 진행하는 상태 머신 방식 고려

**사진 문제 근본 해결 방향**:
- NAS S3에서 Supabase Storage로 사진 저장소 이전 검토 (Vercel 프록시 불필요, 직접 CDN URL 제공)
- 또는 Vercel 대시보드에서 `NAS_ENDPOINT` 환경변수가 공인 IP/도메인인지 확인
- 앱 재시작 후에도 trip 사진 표시되려면 NAS 접근 필요 (현재 구조적 한계)

---

## 🗺️ 주요 상세 문서
- **[02. DEVELOPMENT LOG](./02_DEVELOPMENT_LOG.md)**
- **[04. MASTER ARCHITECTURE](./04_MASTER_ARCHITECTURE.md)**
- **[05. NAS API SPEC](./05_NAS_API_SPEC.md)**
- **[07. RUNBOOK](./07_RUNBOOK.md)**

---
*최종 갱신: 2026-04-07 (by Claude Sonnet 4.6)*
