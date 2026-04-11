# ELS MISSION CONTROL
> 마지막 업데이트: 2026-04-11 (KST) - [v4.9.25] AI 어시스턴트 고도화 | 아산 배차판 24/7 자동 동기화 완료

## 📦 최신 배포 정보
- **Current Build**: `v4.9.25` (AI 어시스턴트 실시간 RAG 연동 및 초기페이지 설정 완료)
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
    - [x] 차량 관제 상세 패널 수정 및 긴급알림 날짜 파싱 무한 깜빡임 오류 핫픽스
    - [x] 사이드바 데스크탑 마우스오버 트리거 변경 (완료)
    - [x] 컨테이너 이력조회 시스템 로그 모바일 레이아웃 오버플로우 패치
- [x] 📇 인트라넷 연락처/페이지 UI 톤앤매너 통일 (2026-04-11)
    - [x] 전 페이지 불필요한 이모지 제거 및 텍스트/SVG 교체\n    - [x] 모바일 연락처 페이지 엑셀 다운/정리 버튼 숨김 및 테이블 스크롤/칸 정렬 레이아웃 적용, 전화걸기(복사) 연동
    - [x] 모바일 터치 영역(44px) 보장 및 CSS 표준화 (`intranet.module.css`)
    - [x] Gemini 1.5/2.5 Flash SSE 스트리밍 연동 — `/api/chat/route.js`
    - [x] ELS 업무 컨텍스트(메뉴 경로/안전운임/컨테이너/연락처) 시스템 인스트럭션 주입
    - [x] **RAG 고도화**: 실시간 차량 위치(GPS), 최근 게시글, 업무 보고서 DB 조회 후 컨텍스트 동적 주입 완료
    - [x] **UI/UX**: 마크다운 링크 변환 기능(한글 메뉴 클릭 가능), 입력창 여백 슬림화, 고정 인사말 토큰 절감 로직 적용
- [x] 📊 아산지점 배차판 자동 동기화 버그 수정 및 UI 개선
    - [x] 백엔드 스케줄러(`app_core.py`, `app.py`) 평일 제한 해제 (주말 포함 24/7 1분 주기로 동작)
    - [x] 토요일 탭 보라색(#a855f7) 테마 적용 및 공휴일 우선 순위 로직 보완
- [x] ⚙️ 시스템 기본값 및 성능 최적화
    - [x] 인트라넷 초기 페이지를 'AI 어시스턴트'로 변경
    - [x] 사이드바 'AI 어시스턴트' 최상단 배치
    - [x] 기상청 API 업데이트 주기 1시간(revalidate: 3600)으로 연장 (부하 감소)
    - [x] **K-SKILL 연동**: AirKorea 미세먼지 공식 API 연동 (`fine-dust-location` proxy 도입) 🚀

## 🗺️ 주요 상세 문서
- **[02. DEVELOPMENT LOG](./02_DEVELOPMENT_LOG.md)**
- **[04. MASTER ARCHITECTURE](./04_MASTER_ARCHITECTURE.md)**
- **[05. NAS API SPEC](./05_NAS_API_SPEC.md)**
- **[07. RUNBOOK](./07_RUNBOOK.md)**

---
*최종 갱신: 2026-04-11 (by Antigravity/Gemini Flash)*
