# ELS MISSION CONTROL
> 마지막 업데이트: 2026-04-11 (KST)

## 📦 최신 배포 정보
- **Current Build**: `v4.9.18` (연락처 UI/UX 대대적 개편 및 엑셀 메타 동기화)
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
| 앱 사진 엑박(500) | `<img>` 태그 대신 `CapacitorHttp`로 바이너리 로딩 처리 (Safe Loader) 및 NAS S3 프록시 안정화 확인 | `modules/bridge.js`, `log.js` 등 |

### ❌ 미해결 항목
- 현재 없음 (모든 긴급 앱 이슈 해결됨)

---

## ⏳ 다음 할 일
- [x] 🌤️ 기상 대시보드 리팩토링 및 성능 최적화 (2026-04-10)
- [x] 📱 모바일 UI 가로 넘침 및 UX 개선 (2026-04-10 ~ 2026-04-11)
    - [x] 차량 관제 상세 패널 수정
    - [x] 사이드바 데스크탑 마우스오버 트리거 변경 (완료)
    - [x] 컨테이너 이력조회 시스템 로그 모바일 레이아웃 오버플로우 패치
- [x] 📇 인트라넷 연락처(사내/외부/협력사/운전원/작업지) 구조 개편
    - [x] 검색/구분 다중 필터(`ContactFilterBar`) 적용
    - [x] 테이블 레이아웃 자동 유동폭 적용 (폰트, 여백 최적화)
    - [x] 엑셀 대량 업로드 템플릿과 프론트엔드 UI 항목 1:1 완벽 정합성 매칭 (협력사 소재지, 작업지명 추가)
- [ ] 🤖 챗봇(Agent) UI 고도화 (Next Task)

## 🗺️ 주요 상세 문서
- **[02. DEVELOPMENT LOG](./02_DEVELOPMENT_LOG.md)**
- **[04. MASTER ARCHITECTURE](./04_MASTER_ARCHITECTURE.md)**
- **[05. NAS API SPEC](./05_NAS_API_SPEC.md)**
- **[07. RUNBOOK](./07_RUNBOOK.md)**

---
*최종 갱신: 2026-04-11 (by Antigravity/Gemini Flash)*
