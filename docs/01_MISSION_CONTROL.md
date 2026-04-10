# ELS MISSION CONTROL
> 마지막 업데이트: 2026-04-10 (KST)

## 📦 최신 배포 정보
- **Current Build**: `v4.9.16` (사이드메뉴 ReferenceError 핫픽스)
- **APK**: `web/public/apk/els_driver.apk` (v4.9.16 유지)
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

## 🚧 IN-PROGRESS — Cloudtype 이관 후 속도 지연 & 컨테이너 조회 무한 대기 버그 해결 (v4.9.9 ~ v4.9.11)

### ✅ 해결된 항목
| 버그 현상 | 원인 분석 및 수정 내역 | 파일 위치 |
|------|----------|------|
| 컨테이너 데이터 오염 | WebSquare DOM 긁기에서 Native API(`getAllJSON`) 직접 호출로 변경 | `elsbot/els_bot.py` |
| Cloudtype 무한 조회 대기 | `proxyToBackend.js` 내부 `res.text()` 버퍼링으로 인한 스트리밍(SSE) 마비. `res.body`를 직접 라우팅하여 실시간 스트림 복구 완료 | `api/els/proxyToBackend.js` |
| 초기 페이지 & 이미지 랜더링 지연 | Cloudtype 컨테이너 CPU 보호를 위해 `output: 'standalone'` 설정 및 `images.unoptimized` 강제 적용 | `web/next.config.mjs` |
| 기상 대시보드 무한 대기 (CPU 병목) | 개별 기상청 API 10건 통신 지연으로 Next.js 응답 블로킹. `AbortController` 2초/3.5초 타임아웃 셔터(Fallback) 적용 | `api/weather/route.js` |
| 프론트 대기 시간 과다 | "다른 직원 조회 중" 최대 대기: 25분 → 6분 | `page.js` |
| stop-daemon 누락 | `app_bot.py`에 `stop-daemon` 엔드포인트 추가 | `app_bot.py` |
| 앱 사진 엑박(500) | `<img>` 태그 대신 `CapacitorHttp`로 바이너리 로딩 처리 (Safe Loader) | `modules/bridge.js`, `log.js` 등 |

### ❌ 미해결 항목

#### 1. NAS S3 사진 프록시 500 에러
- **증상**: 운행 사진 업로드는 성공하나, 일지에서 사진 조회 시 깨짐(X표시)
- **진단 결과**: `GET /api/vehicle-tracking/photos/view?key=...` → NAS S3 `GetObject` 실패 500
- **확인 필요**: Vercel Functions 로그, NAS MinIO 서비스 상태

---

## ⏳ 다음 할 일
- [x] NAS 도커 재빌드/재시작 (`app.py`, `app_bot.py` 변경 반영)
- [x] 드라이버 앱 APK 빌드 및 배포 (`scripts\build_driver_apk.ps1`)
- [ ] 컨테이너 조회 실 테스트 (잠금 해제 정상 동작 확인)
- [ ] 앱 사진 로딩 최종 확인 (Safe Loader 작동 여부)

## 🗺️ 주요 상세 문서
- **[02. DEVELOPMENT LOG](./02_DEVELOPMENT_LOG.md)**
- **[04. MASTER ARCHITECTURE](./04_MASTER_ARCHITECTURE.md)**
- **[05. NAS API SPEC](./05_NAS_API_SPEC.md)**
- **[07. RUNBOOK](./07_RUNBOOK.md)**

---
*최종 갱신: 2026-04-07 (by Antigravity/Claude Opus 4.6)*
