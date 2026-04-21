# ELS Solution 프로젝트 마스터 맵 (Architecture and Blueprint)

> **AI/IDE Quick Scan (Project Blueprint)**
> - **Core Stack**: Next.js 14 (App Router), Flask (Python 3.11), Capacitor 8.x, Selenium (DrissionPage).
> - **Primary Domains**: `nollae.com` (Vercel), `192.168.0.4:5000` (Internal NAS API), Supabase (PostgreSQL).
> - **Storage Mapping**: Cloud (Supabase Storage) + On-Premise (MinIO S3 / WebDAV).
> - **Build Requirements**: Node 18+, Python 3.11+, Android SDK (Java 17 / Gradle 8.7.3).
> - **Critical Paths**: `/web` (Front), `/elsbot` (Selenium), `/docker/els-backend` (NAS API), `/web/android` (Native).
> - **Auth Flow**: Supabase Auth (OAuth) -> Server-side Session Management.

---

## 1. 전체 아키텍처 (High-Level Structure)

우리 프로젝트는 **사내 인프라 3개 심장 + 외부 MCP 연동**으로 구성되며, 특히 **NAS(Backdoor)**가 Vercel의 네트워크 제한과 서버리스 한계를 돌파하는 핵심 전진기지 역할을 수행합니다.

**시스템 구성도:**
- **Cloud (Vercel)**: Next.js Web (사용자 접점, UI/UX)
- **Cloud (Supabase)**: PostgreSQL DB, Storage (데이터 지능, Auth)
- **NAS (Docker - The Backdoor)**: Flask API Server + ELS Bot (실질적 작업반장)
- **Mobile**: Android App (Capacitor) + Background Service (GPS)
- **External MCP**: K-SKILL Proxy (미세먼지 한정) + K-Law API (beopmang.org) + OPINET (유가)

**연결 고리:**
- **Web <--> DB**: Supabase 직결 (표준 데이터 조회)
- **App <--> DB**: Supabase 직결 (프로필, 공지사항)
- **Web --> NAS Backend**: **[Critical]** High-Traffic API 프록시 및 대용량 파일(엑셀) 처리 오프로딩
- **NAS Backend <--> Bot**: 컨테이너 조회 명령 (Selenium/DrissionPage 엔진)
- **App --> NAS Backend**: GPS 원격측정 및 실시간 위치 전송
- **Web --> OPINET/K-Law/K-SKILL**: AI RAG를 위한 외부 지식 연동 (안정 채널만 유지)
- **NAS --> Git/Vercel**: 안전운임 고시 및 정적 데이터 자동 빌드/배포 파이프라인

---

## 2. 핵심 연결 고리 및 인프라 특화 기술 (Infrastructure Engine)

### 2-1. Triple-Net DNS 방어선 (NAS 전용)
나스 도커 환경의 고질적인 외부 DNS 리졸빙 장애를 해결하기 위해 적용된 삼중 레이어 패치입니다.
1. **L1 (Static Hosts)**: `/etc/hosts` 파일 강제 업데이트 (OS 레벨)
2. **L2 (Socket Wrapper)**: 파이썬 `socket.getaddrinfo` 몽키패치 (App 레벨)
3. **L3 (HttpCore Hijacking)**: **[최종 병기]** `httpx` 내부의 `httpcore` 연결 로직을 직접 가로채서 DNS 서버를 거치지 않고 호스트네임을 IP로 강제 치환 (라이브러리 레벨)

### 2-2. 웹 ↔ 나스 (API 리다이렉션 / Backdoor)
- **목적**: Vercel CPU 서버리스 요금 절감, 504 Gateway Timeout 방지, NAS 실물 데이터(아산지점 배차판 등) 직접 접근.
- **주요 채널**: `NEXT_PUBLIC_ELS_BACKEND_URL` (나스 공인 IP/DDNS)를 통해 통신.
- **처리 항목**: 차량 실시간 관제(Polling), 활동 로그(Logging), 사진 프록시, **아산 배차판 실시간 동기화**.

### 2-3. 안전운임 자동화 빌더 (Safety Freight Automation)
- **구조**: `scripts/update-safe-freight.sh` (NAS 전용)
- **동작**: NAS 내부 `work-docs/`의 원천 엑셀 파일 탐색 -> JSON 빌드 -> Git Commit/Push -> Vercel 자동 빌드 트리거.
- **특징**: 수동 작업 없이 스크립트 한 번으로 전사 인트라넷 및 AI 단가표 동시 갱신.

### 2-2. 앱 ↔ 나스 (실시간 관제)
- **목적**: 드라이버 위치 정보를 3초(최대) 간격으로 나스 전송, 관리자 긴급 푸시(REALTIME_ON) 수신.
- **주요 채널**: HTTPS/HTTP 요청 및 Supabase 실시간 알림 테이블 활용.

### 2-3. 나스 ↔ ETrans (봇 엔진)
- **목적**: 물류사(ETrans) 사이트에서 컨테이너 이력 데이터를 자동으로 긁어옴.
- **동작**: Flask 백엔드가 봇 데몬에 명령 -> 봇이 Headless Chrome 작업 수행 -> DB 갱신.

### 2-4. 아산지점 배차판 자동화 (Asan Dispatch)
- **목적**: 전 지점 배차 현황 실시간 자동 동기화.
- **동작**: 나스 백엔드(app.py, app_core.py)가 주말 포함 24/7 1분 주기로 파일시스템 스캔 -> Supabase 갱신.

---

## 3. 환경별 필수 설치 리스트 (Tool Inventory)

### 3-1. 개발 PC (Windows)
- **패키지 매니저**: Scoop (강력 권장)
- **필수 도구**: git, nodejs-lts, python, ripgrep (rg), fd, make
- **에디터**: VS Code (Antigravity AI 연동)

### 3-2. NAS 서버 (Docker)
- **컨테이너**: els-backend (Flask + Chrome + Bot 통합 환경)
- **필수 바이너리**: Google Chrome 131, Chromedriver (경로: /usr/bin/google-chrome)
- **Python 의존성**: DrissionPage, flask, supabase, pandas, openpyxl

### 3-3. 안드로이드 빌드 환경
- **프레임워크**: Capacitor (Web to Native 릴레이)
- **필수 API**: Android 14+ (Foreground Service Type 필수 선언)
- **권한 관리**: Location(Always), Overlay(위젯), Battery Optimization(제외)

---

## 4. 주요 디렉토리 가이드 (Navigation Map)

- `/web`: Next.js 프론트엔드 코드 전반.
- `/docker/els-backend`: 나스에서 돌아가는 Flask API 서버 핵심 코드 (app.py, Dockerfile).
- `/elsbot`: 컨테이너 조회를 수행하는 봇 엔진 코드 (els_bot.py).
- `/web/android`: 안드로이드 네이티브 소스 및 Capacitor 설정.
- `/web/driver-src`: [단일 진실 소스] 드라이버 앱 소스 (app.js, index.html, style.css, modules/). 여기서만 편집.
- `/docs`: 프로젝트 역사와 설계 문서 (01_MISSION_CONTROL.md 최상위).

---

## 5. 안드로이드 드라이버 앱 — JS 모듈 구조 (2026-04-05 리팩토링)

소스: `web/driver-src/` (단일 진실 소스). Capacitor webDir 타겟.
ES Modules (type="module") 방식 적용. 빌드 도구 없음.

### 5-1. 모듈 의존성 다이어그램

```
[app.js] ← 엔트리 (window.App 조립 + init 호출)
    |
    +-- modules/store.js        <- 앱 상수(APP_VERSION, BASE_URL), Store, State
    +-- modules/bridge.js       <- Capacitor 플러그인, smartFetch, remoteLog  (<- store)
    +-- modules/utils.js        <- formatDate, escHtml, showToast              (의존성 없음)
    +-- modules/nav.js          <- showScreen (순수 DOM)                       (의존성 없음)
    |
    +-- modules/permissions.js  <- 권한 관리, Android 16 가이드               (<- store, bridge, nav)
    +-- modules/profile.js      <- 프로필 UI/저장/조회/사진                   (<- store, bridge)
    +-- modules/dispatch.js     <- 배차 정보 표시 및 동기화                  (<- store, bridge, utils)
    +-- modules/log.js          <- 운행 일지 작성 및 사진 업로드              (<- store, bridge, utils)
    +-- modules/gps.js          <- GPS 트래킹, 백그라운드 위치 전송          (<- store, bridge)
```

### 5-2. 주요 패턴 및 주의사항

| 패턴 | 내용 |
|---|---|
| **이벤트 위임** | 동적 리스트는 document에 이벤트 리스너 위임. 직접 addEventListener 금지. |
| **크로스 모듈 호출** | 모듈 간 직접 import 어려운 경우 window.App.xxx() 늦은 참조 사용. |
| **빌드 스텝 없음** | Webpack/Vite 불필요. Capacitor WebView = Chrome -> ES Module 네이티브 지원. |
| **APK 빌드 절차** | 항상 scripts/build_driver_apk.ps1 경유. npx cap sync 단독 실행 절대 금지. |

### 5-3. Android APK 버전 관리 (4곳 동시 갱신 필수)
1. web/android/app/build.gradle — versionCode, versionName [단일 진실 소스]
2. web/public/apk/version.json — 자동 업데이트 알림용
3. web/driver-src/modules/store.js — APP_VERSION, BUILD_CODE
4. web/driver-src/index.html — span id="app-version-display"

> 스크립트(build_driver_apk.ps1)가 build.gradle을 읽어 나머지 3곳에 자동 동기화.

---

## 6. AI 어시스턴트 아키텍처 (Agent RAG Pipeline)

> **최종 구현**: 2026-04-21 (v5.1 — K-SKILL 구조조정 + 영리한 AI 전환)
> **구현 파일**:
> - web/app/api/chat/route.js — 백엔드 RAG 엔진, 할증 계산, OPINET 연동, Gemini 스트리밍
> - web/app/(main)/employees/(intranet)/ask/page.js — AI 어시스턴트 UI (데스크탑/모바일 분기)
> - web/app/(main)/employees/(intranet)/ask/ask.module.css — 전용 스타일
> - scripts/supabase_pgvector_setup.sql — pgvector 벡터 DB 스키마
> - scripts/vectorize-safe-freight.js — 안전운임 벡터화 파이프라인

ELS AI 어시스턴트는 사내 DB + 안정적 외부 API를 실시간으로 결합하는
Dynamic RAG (Retrieval-Augmented Generation) 아키텍처를 따릅니다.
불안정한 외부 K-SKILL 기능(KTX/지하철/한강/주식/스포츠)은 v5.1에서 제거하고,
해당 주제는 Gemini 자체 지식으로 유연하게 답변하도록 전환했습니다.

### 6-1. 전체 데이터 흐름 (RAG Pipeline)

```
사용자 입력 (자연어 쿼리)
        |
        v
[POST /api/chat] — Next.js Server-Side API Route
        |
        +-- STEP 0: body 파싱 → messages, lastUserText, userKwd 추출
        |
        +-- STEP 1: Omni-RAG 병렬 스캔 (Promise.all, ~0.2초)
        |       +-- external_contacts   → 거래처/고객 연락처
        |       +-- internal_contacts   → 사내 직원 연락처
        |       +-- posts               → 게시판/업무일지 본문 검색
        |       +-- work_sites          → 작업지 주소/정보 검색
        |
        +-- STEP 2: 조건부 RAG (키워드 트리거)
        |       +-- '차량/위치/어디'    → Supabase vehicle_trips + vehicle_locations JOIN
        |       +-- '컨테이너번호 패턴'   → NAS Backend 실시간 이력조회 (DrissionPage 연동)
        |       +-- '안전운임 키워드'     → public/data/ 로 배치 후 self-fetch (35MB JSON)
        |       |       +-- (A) 최신 단가표 주입 (상위 8구간 스코어링)
        |       |       +-- (B) 이력 비교표 (buildFareHistory, 6개 기간)
        |       |       +-- (C) 할증 서버 계산 (calcSurcharge, 냉동/공휴일 등)
        |       +-- '날씨/미세먼지/공기' → callExternalAPI() → K-SKILL fine-dust (안정)
        |       +-- '법/규정/근로/운임'  → K-Law REST API 호출 (안정)
        |       +-- '경유/유가/기름값'   → callExternalAPI() → OPINET /api/opinet/fuel-price (안정)
        |       +-- [v5.1 제거] KTX/지하철/한강수위/주식/스포츠 → Gemini 일반지식 대응
        |
        +-- STEP 2.5: AI 메모리(AI Memory) 주입 (Persistence)
        |       +-- `ai_custom_rules` 테이블에서 사용자의 피드백/교정 내역 조회
        |       +-- 시스템 프롬프트 하단에 '최근 지침'으로 동적 병합 (영구 학습 효과)
        |
        +-- STEP 3: Context 조합
        |       BASE_SYSTEM_INSTRUCTION (분기별 개정사이클 + 20+개 메뉴맵 포함)
        |         + Omni-RAG 검색 결과
        |         + 안전운임 고시 전문 (PDF→JSON, 최대 2차수)
        |         + 데이터 신선도 Footer (고시일, DB조회 시점, API시점)
        |       = finalSystemInstruction
        |
        +-- STEP 4: Gemini 2.5 Flash 스트리밍 호출
        |       모델: gemini-2.5-flash (streamGenerateContent, SSE)
        |       Temperature: 0.7 / MaxTokens: 2048 / Timeout: 60초
        |
        +-- STEP 5: SSE 스트림 클라이언트 전달 → 실시간 렌더링
```

### 6-2. Omni-RAG 데이터 소스 상세

| 레이어 | 소스 | 트리거 | 반환 데이터 |
|---|---|---|---|
| **Omni-RAG (항상)** | Supabase PostgreSQL | 모든 질문 키워드 병렬 스캔 | 연락처(사내/외부), 게시글/업무일지 본문, 작업지 주소 |
| **차량 위치** | Supabase vehicle_trips/locations | 차량, 위치, 어디 | 실시간 GPS 위치/주소 |
| **컨테이너** | NAS Backend API | 영문4+숫자7 패턴 | 반입/반출 이력 |
| **안전운임 단가** | safe-freight.json (public/data/ 배치, self-fetch) | 지역명 키워드 스코어링 | 구간별 운임 단가 + 이력비교표 + 할증계산 |
| **안전운임 고시** | safe-freight-docs.json (PDF 변환) | 항상 주입 (최신 2차수) | 고시 전문 텍스트 |
| **K-SKILL/미세먼지** | callExternalAPI() → k-skill-proxy | 날씨, 미세먼지, 공기 | AirKorea 공식 PM10/PM2.5/KHAI | ✅ 안정 |
| **OPINET 유가** | callExternalAPI() → /api/opinet/fuel-price | 경유, 유가, 기름값 | 전국 경유/휘발유 평균가, 주간변동 | ✅ 안정 |
| **K-Law** | api.beopmang.org | 법, 규정, 근로, 운임, 판례, 과태료 | 법령 조문 전문 | ✅ 안정 |
| **pgvector 시맨틱** | Supabase document_chunks (3,868 청크) | match_documents() RPC | 코사인 유사도 기반 구간/고시 검색 | ✅ 안정 |
| ~~스포츠 결과~~ | ~~네이버 스포츠 API~~ | ~~야구, 축구 등~~ | v5.1에서 제거 → Gemini 일반지식 | ❌ 제거 |
| ~~열차/KTX/SRT~~ | ~~딥링크 생성기~~ | ~~KTX, SRT 등~~ | v5.1에서 제거 → Gemini 일반지식 | ❌ 제거 |
| ~~한강수위/지하철/주식~~ | ~~K-SKILL 프록시~~ | ~~한강, 지하철, 주식~~ | v5.1에서 제거 → Gemini 일반지식 | ❌ 제거 |

**K-SKILL 지역 측정소 매핑 (도시명 -> AirKorea 측정소 힌트)**:
- 서울: 서울 중구 / 부산: 부산 연산동 / 인천: 인천 구월동
- 대구: 대구 수창동 / 대전: 대전 둔산동 / 광주: 광주 농성동
- 울산: 울산 신정동 / 세종: 세종 아름동
- 아산: 아산 모종동 / 당진: 당진 읍내동 / 예산: 예산군 / 천안: 천안
- default fallback: 아산 모종동 (ELS 본사 소재지)

**K-Law API 기술 결정 (2026-04-11)**:
- 엔드포인트: GET https://api.beopmang.org/api/v4/law?action=search&q={검색어}
- NAS에 별도 Docker 컨테이너 운영 대신 공개 법망 프록시 서버 직결 채택
- 장점1: NAS CPU/RAM 추가 부하 제로
- 장점2: 정부 공공데이터포털 OpenAPI 키 발급 불필요
- 장점3: 법망측 서버가 정부 API -> JSON 변환 담당 (유지보수 컨테이너 없음)

### 6-3. 정확도 계층 및 유연 답변 원칙 (v5.1 개편)

**3계층 정확도 모델:**
| 계층 | 대상 | 원칙 | 예시 |
|---|---|---|---|
| 🔴 **절대 정확** | 안전운임, 사내 DB, K-Law, OPINET | 데이터 인용 필수. 할루시네이션 금지 | "아산→부산 40ft = 568,000원" |
| 🟡 **정확 우선** | 미세먼지, NAS 문서 | 데이터 있으면 인용, 없으면 일반지식 | "현재 대구 PM10 = 42㎍/㎥" |
| 🟢 **유연 답변** | 날씨, 스포츠, KTX, 주식, 상식 | Gemini 일반지식 활용. 출처 밝힘 | "일반 지식 기반 답변입니다" |

**유연 답변 원칙 (v5.1 신규):**
- 업무 외 일반 질문도 **거절하지 않는다** (기존: 잡담/상식 거절 → 폐지)
- 데이터 미주입 주제는 Gemini 보유 지식으로 성실히 답변
- 단, 사내 확인 데이터가 아닌 일반 지식 기반임을 명시
- 관련 외부 링크(네이버, 코레일 등)를 함께 안내

**유지되는 핵심 지시:**
- **인트라넷 전체 20+개 메뉴 경로를 시스템 프롬프트에 내장** (v4.9.29)
- **분기별 안전운임 개정 사이클 학습**: 1Q→5월, 2Q→7월, 3Q→10월, 4Q→다음해 1월
- **할증 계산은 서버가 수행** → AI는 결과만 인용
- **데이터 신선도**: 답변 말미에 조회 기준 시점 필수 명시
- 메뉴 안내 시 반드시 [메뉴이름](/경로) 마크다운 링크로 이동 연결

### 6-4. AI 어시스턴트 UI/UX 구조 (v5.1 재설계)

| 환경 | 레이아웃 | 특징 |
|---|---|---|
| **데스크탑** (>768px) | 2-Column 분할 | 좌측: ELS AI 사용 가이드 패널 (상설), 우측: 채팅창 |
| **모바일** (<=768px) | Full-Screen 채팅 | 채팅창 100% 점유, 헤더 [가이드] 버튼 -> 모달 팝업 |

**가이드 패널 구성 (v5.1):**
- 🚛 안전운임 조회 — 구간별 단가, 할증 계산, 이력 비교, 위탁/운수사간 운임
- 📊 실시간 데이터 — 경유가(OPINET), 법령(K-Law), 미세먼지(에어코리아), 컨테이너 이력
- 📂 사내 업무 — 연락처, 차량 위치, 배차판, 업무보고, NAS 문서 벡터검색
- 💡 그 외 무엇이든 — 날씨, 스포츠, KTX, 상식 등 자유 질문 (Gemini 일반지식)

**빠른 질문 버튼:** 아산 부산 40ft 안전운임 / 오늘 경유가 / 과태료 감경 규정 / 대구 미세먼지 / 연락처 검색

---

## 7. 운영 시 주의사항 (Operational Guardrails)

1. **봇 로그인**: ETrans 사이트는 세션 민감 -> 봇 작업 중 수동 로그인 자제.
2. **트래픽 오프로딩**: 프론트엔드(web/) 수정 시 모든 API 주소 앞에 baseUrl 정합성 반드시 체크.
3. **나스 빌드**: Dockerfile 수정 후 반드시 sh scripts/nas-deploy.sh로 전체 컨테이너 재빌드. (약 40분 소요)
4. **APK 빌드**: npx cap sync 단독 실행 절대 금지. 반드시 scripts/build_driver_apk.ps1 경유.
5. **K-SKILL/K-Law 가용성**: 외부 프록시 서버 의존. 네트워크 단절 시 AI는 fallback(사내 DB only)으로 동작.
6. **v5.1 일반 질문 대응**: 업무 외 질문(스포츠, KTX, 상식 등)은 거절하지 않고 Gemini 일반지식으로 답변. 단, 사내 데이터 아님을 밝힘.

---
*최종 갱신일: 2026-04-22 (by Antigravity/Gemini | v5.3.3 Professionalism & Emoji-Free Update)*