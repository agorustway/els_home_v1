# ELS MISSION CONTROL
> 마지막 업데이트: 2026-04-12 (KST) - [v4.9.30] AI 채팅 제목 자동 생성(Auto-Title) 기능 및 RAG 데이터 싱크 완료

## 📦 최신 배포 정보
- **Current Build**: `v4.9.26` (배포 오류 해결, AI 어시스턴트 초기페이지 설정, 기상 대시보드 UI 프리미엄화)
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
    - [x] 인트라넷 초기 페이지를 'AI 어시스턴트'로 변경 (v4.9.26 배포 완료)
    - [x] 사이드바 'AI 어시스턴트' 최상단 배치
    - [x] 기상청 API 업데이트 주기 1시간(revalidate: 3600)으로 연장 (부하 감소)
    - [x] **K-SKILL 연동**: AirKorea 미세먼지 공식 API 연동 (`fine-dust-location` proxy 도입) 🚀
    - [x] **K-LAW MCP 연동**: 법망 API 직접 연동으로 할루시네이션 방지 및 정확한 법률 안내
    - [x] **AI 어시스턴트 UI/UX 개편**: 데스크탑 가이드 패널 및 모바일 모달 분리 적용, 멀티-세션 채팅 목록 시스템 도입 (Gemini 스타일 UI 반영)
    - [x] **AI 맞춤형 메모리/지식 축적**: Supabase `ai_chat_memory` 기반 사용자별 대화록 영구 저장 및 RAG 문맥 주입
    - [x] **안전운임제 투-트랙 데이터 처리**: 요금제 계산용 엑셀 유지 및 AI 규정 안내용 원본 PDF JSON 파싱/RAG 주입 구조 확립 (`10_SAFE_FREIGHT_DATA_POLICY.md`)
    - [x] **AI route.js 전면 복원** (2026-04-12): 직전 에이전트가 body/messages/supabase 변수 정의를 삭제하고 RAG 블록을 중복 삽입하여 코드 파괴됨 → 전면 재작성으로 정상화
    - [x] **인트라넷 전체 메뉴맵 시스템 프롬프트 주입**: 6개 메뉴 → 20+개 전체 인트라넷 페이지 경로를 AI가 인지하도록 확장
    - [x] **작업지(work_sites) DB 연동**: Omni-RAG 병렬 스캔에 작업지 테이블 추가
    - [x] **AI 채팅 제목 자동 생성(Auto-Title)**: 첫 질문 시 Gemini 1.5 Pro를 통해 대화 맥락에 맞는 3~5단어 제목 자동 생성 및 저장
    - [x] **RAG 데이터 파일 정합성 수정**: `safe-freight.json` (35MB) 파일명 참조 오류 해결 및 대용량 데이터 로딩 하향 조정 안내 로직 보완

## 🗺️ 주요 상세 문서
- **[02. DEVELOPMENT LOG](./02_DEVELOPMENT_LOG.md)**
- **[04. MASTER ARCHITECTURE](./04_MASTER_ARCHITECTURE.md)**
- **[05. NAS API SPEC](./05_NAS_API_SPEC.md)**
- **[07. RUNBOOK](./07_RUNBOOK.md)**

---
*최종 갱신: 2026-04-12 (by Antigravity/Claude Opus)*
