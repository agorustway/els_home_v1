# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 핵심 규칙 (Core Rules)

- **Rule #0 — 토큰 효율**: 불필요한 반복 호출 금지. 콤팩트하고 정밀한 답변.
- **페르소나**: 사용자를 **'형'**이라 부르며, 똑 부러지는 남동생 페르소나 유지.
- **언어**: 모든 기술적 대화, 문서, 커밋 메시지는 **한국어** 우선.
- **Git 커밋**: 한글 깨짐 방지를 위해 반드시 `git commit -F commit_msg.txt` 형식 사용. 커밋 후 `commit_msg.txt` 삭제.
- **Push 정책**: 형이 명시적으로 요청할 때만 `git push` 실행.
- **파일 수정 금지**: `GEMINI.md`, `.cursorrules`는 사용자의 명시적 허가 없이 수정 불가.
- **임시 파일**: 모든 테스트는 `.tmp_test/`에서 수행 후 즉시 삭제. 미해결 이슈는 `docs/02_DEVELOPMENT_LOG.md` 기록 + `.tmp_issues/`에 보관 (해결 시 삭제).
- **작업 완료 후**: 코드 변경 시 `docs/01_MISSION_CONTROL.md` 및 `docs/02_DEVELOPMENT_LOG.md` 반드시 갱신. `01_MISSION_CONTROL.md`는 100줄 이내 유지.
- **AI 핸드오프**: Gemini/Antigravity와 공동 작업 시, 세션 종료 전 `docs/01_MISSION_CONTROL.md`의 **🚧 IN-PROGRESS** 섹션에 상세 진행 상태와 다음 작업자를 위한 가이드를 남길 것.
- **아카이브 금지**: `web/utils/loggerServer.js` 등 `_archive/` 폴더 내 파일은 절대 사용 금지.
- **Python 인코딩**: Python 코드 작업 시 `PYTHONIOENCODING=utf-8` 환경 고려.
- **PowerShell**: 파일 I/O 시 `-Encoding UTF8` 필수. 명령어 체인은 `&&` 대신 `;` 사용 (한글 깨짐·호환성 방지).
- **PDCA**: 코드 변경은 계획(Plan)→실행(Do)→검증(Check)→적용(Act) 단계 준수.

## 명령어 트리거

| 형의 말 | 실행할 것 |
|--------|---------|
| **"배포해줘"** / **"배포"** / **`/deploy`** | `.agent/workflows/deploy.md` 절차 그대로 실행 |
| **`/init`** | `.agent/workflows/init.md` 절차 실행 — 세션 시작 시 프로젝트 컨텍스트 즉시 동기화 |

## 세션 시작 시 필수 스캔

1. `docs/01_MISSION_CONTROL.md` — 현재 버전, 마일스톤, 실시간 이슈 (**🚧 IN-PROGRESS** 필독)
2. `docs/04_MASTER_ARCHITECTURE.md` — AI Blueprint (NAS/S3/SDK 구조 전체)
3. `GEMINI.md` — 디렉토리 구조 및 역할 확인
4. `docs/03_RULES.md` — 제9조 멀티 AI 협업 규칙 확인

## 프로젝트 개요

**ELS Solution** — 물류 회사 임직원 업무 포털 및 통합 인트라넷. 컨테이너 이력 조회(Selenium), 안전운임 조회, 차량 위치 관제(GPS), NAS 자료실 등을 제공.

- **웹**: `nollae.com` (Vercel 배포, Next.js 14)
- **백엔드**: `192.168.0.4:2929` (사내 NAS, Nginx gateway → els-core:2930 / els-bot:2931)
- **모바일**: 안드로이드 드라이버 앱 (Capacitor 8.x, `com.elssolution.driver`)

## 빌드 사전 요구사항

- **Node.js** 18+
- **Python** 3.11+
- **Android SDK**: Java 17, Gradle 8.7.3 (APK 빌드 시)

## 빌드 및 실행 명령

```bash
# 웹 개발 서버
cd web && npm run dev        # http://localhost:3000

# 웹 프로덕션 빌드
cd web && npm run build

# ESLint
cd web && npm run lint

# ── 안드로이드 APK 빌드 ──────────────────────────────────────
# ★ 반드시 이 스크립트만 사용할 것. 수동 cap sync 금지.
powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1

# 강제 업데이트 배포 (version.json forceUpdate=true)
powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1 -ForceUpdate

# cap sync만 (빌드 생략)
powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1 -SkipBuild

# ELS Bot 데몬
cd elsbot && python els_web_runner_daemon.py     # REST API 서버 기동
cd elsbot && python local_debug_test.py          # 봇 단독 테스트

# NAS 배포 (Docker, ~40분)
bash scripts/nas-deploy.sh

# NAS 백엔드 재시작만
powershell scripts/restart_backend.ps1
```

## 시스템 아키텍처

3개 서브시스템으로 구성:

```
[Vercel Cloud]
  Next.js 14 웹 (nollae.com)
    └─ 고부하 API → NAS로 오프로드 (Excel, ZIP, 파일 프록시)
    └─ 인증/DB → Supabase (PostgreSQL, OAuth)

[On-Premise NAS @ 192.168.0.4]
  Docker 3-container 구성:
    els-gateway (포트 2929) — Nginx 진입점
    els-core    (포트 2930) — Flask 경량 API
    els-bot     (포트 2931) — Selenium 봇 전용
  NAS Storage (WebDAV, MinIO S3 호환)

[Android 드라이버 앱]
  Capacitor WebView — 3초 간격 GPS 전송
  Background Geolocation → Supabase Realtime
```

**핵심 설계 원칙 (NAS-Centric):**
- 실시간 관제, 로그 수집, 파일 서비스 → 나스 백엔드 처리 (Vercel 서버리스 타임아웃 회피)
- Excel 생성, ZIP 압축 → 나스에서 비동기 처리 후 웹은 결과만 스트리밍
- 사진 데이터는 Supabase/S3 저장 but 접근/가공은 나스 API 경유

## 주요 디렉토리

| 디렉토리 | 역할 |
|---------|------|
| `web/driver-src/` | **드라이버 앱 단일 진실 소스** — `app.js`, `index.html`, `style.css`, `modules/`, `images/`. `cap sync` 타겟. 여기서만 편집할 것 |
| `web/app/(main)/` | 공개 웹사이트 + 임직원 포털. 하위 `employees/(intranet)/`은 Supabase 세션 필수 보호 구역 |
| `web/app/(standalone)/` | 드라이버 앱 WebView 전용 레이아웃 (`/driver-app`). 헤더/푸터 없는 단독 UI |
| `web/app/api/` | 서버사이드 API 라우트. **NAS 오프로드 패턴**: 라우트 최상단에 `if (process.env.ELS_BACKEND_URL) return proxyToBackend(req)` 삽입 |
| `web/app/api/els/proxyToBackend.js` | NAS 프록시 공통 유틸. 타임아웃·인증서 무시·바이너리 스트리밍 처리 포함 |
| `web/components/` | 공유 React 컴포넌트 (~40개) |
| `web/utils/` | 공통 유틸 (`logger.js`, `logger.server.js`, `roles.js`, `supabase/`) |
| `web/utils/roles.js` | RBAC 역할 목록 (admin / headquarters / asan / jungbu / dangjin / … / visitor) |
| `docker/els-backend/app.py` | Flask 메인 API (로그, 파일, 봇 연동) |
| `elsbot/els_web_runner_daemon.py` | Selenium DriverPool + REST API 데몬 |
| `elsbot/els_bot.py` | DrissionPage 기반 ETrans 스크래핑 핵심 로직 |
| `docs/` | 프로젝트 단일 진실 소스 (`01_MISSION_CONTROL.md` 핵심) |
| `scripts/` | 배포/재시작 PowerShell·Shell 스크립트 |
| `.agent/workflows/` | AI 워크플로우 정의 (`deploy.md`, `init.md`). 명령어 트리거 시 이 절차를 실행 |

## 주요 환경변수

| 변수 | 설명 |
|------|------|
| `ELS_BACKEND_URL` | NAS Flask 백엔드 URL (예: `http://192.168.0.4:2930`). 미설정 시 프록시 비활성화 |
| `ELS_BACKEND_FETCH_TIMEOUT_MS` | NAS 요청 타임아웃 (기본 120000ms) |
| `STATIC_EXPORT` | APK 빌드와 무관. 순수 Next.js static export가 필요한 경우에만 사용 |
| `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID` | 네이버 지도 NCP 클라이언트 ID (웹 관제용) |

## 모바일 앱 버전 관리 (자동화)

> **버전 올릴 때 `build.gradle` 한 곳만 수정 → 빌드 스크립트가 나머지 전부 자동 갱신**

```
단일 진실 소스: web/android/app/build.gradle
    ↓ scripts/build_driver_apk.ps1 실행
자동 갱신 대상:
  web/driver-src/modules/store.js    — APP_VERSION, BUILD_CODE
  web/driver-src/index.html          — ?v=BUILD_CODE
  web/driver-src/app.js              — ?v=BUILD_CODE (모든 import)
  web/driver-src/modules/*.js        — ?v=BUILD_CODE (내부 import 전체)
  web/public/apk/version.json        — latestVersion, versionCode, downloadUrl
```

**절대 금지**: `assets/public/`을 직접 편집하거나 `npx cap sync`를 단독 실행하는 것.  
드라이버 앱 수정 시 반드시 `web/driver-src/`를 편집하고 빌드 스크립트로만 반영.

## 안드로이드 앱 JS 모듈 구조

`web/driver-src/` 기준 (소스). `cap sync` 후 `assets/public/`에 복사됨. ES Modules (`type="module"`) — 빌드 도구 없음.

- `app.js` — 엔트리 (window.App 조립 + init 호출)
- `modules/store.js` — 앱 상수·State. `APP_VERSION`/`BUILD_CODE`는 fallback(runtime에 Native에서 덮어씀)
- `modules/bridge.js` — Capacitor 플러그인, smartFetch, remoteLog
- `modules/gps.js` — GPS 추적, 실시간 모드, 오프라인 큐
- `modules/trip.js` — 운행 시작/종료
- `modules/map.js` — 네이버 지도 Dynamic SDK V3 엔진
- `modules/nav.js` — 탭 네비게이션 (순환 참조 방지용 별도 레이어)
- `modules/permissions.js` / `modules/profile.js` / `modules/notice.js` — 권한·프로필·공지
- `modules/log.js` / `modules/photos.js` / `modules/emergency.js` — 업무 로그·사진·긴급
- `modules/update.js` / `modules/utils.js` — OTA 업데이트·공통 유틸
- `modules/init.js` — 앱 초기화 조율 (전체 모듈 진입점)

모듈 간 순환 참조 방지: `nav.js` 별도 레이어 분리, 불가피한 경우 `window.App.xxx()` 늦은 참조 사용.

**캐시버스터 규칙**: 모든 `?v=`는 숫자 BUILD_CODE 형식 통일 (`?v=485`). 빌드 스크립트가 자동 갱신하므로 수동 편집 불필요.

## 주요 문서 링크

- `docs/01_MISSION_CONTROL.md` — 실시간 현황 및 TODO
- `docs/04_MASTER_ARCHITECTURE.md` — AI/IDE Blueprint (필수)
- `docs/05_NAS_API_SPEC.md` — 나스 통신 규약
- `docs/07_RUNBOOK.md` — 운영/트러블슈팅
- `docs/08_ENVIRONMENT_SETUP.md` — 개발 환경 구축
- `docs/03_RULES.md` — 전체 협업 헌법 (상세 규칙)
