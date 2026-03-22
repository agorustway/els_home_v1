# 🧠 GEMINI.md - ELS Solution AI Context

이 파일은 ELS Solution 프로젝트의 구조, 기술 스택, 그리고 AI 에이전트가 준수해야 할 핵심 지침을 담고 있습니다. 모든 세션 시작 시 이 내용을 최우선으로 참고하십시오.

## 🚀 프로젝트 개요
ELS Solution은 물류 회사 임직원을 위한 업무 포털 및 통합 인트라넷 시스템입니다. 컨테이너 이력 조회(Selenium Scraping), 안전운임 조회, 업무 보고, 차량 위치 관제, NAS 자료실 등 다양한 업무 자동화 기능을 제공합니다.

- **핵심 목표**: 물류 업무의 디지털 전환 및 자동화 (ETRANS 데이터 연동 등)
- **주요 도메인**: nollae.com (Vercel 배포)
- **관리 대상**: Next.js 웹, Flask 백엔드, Selenium 봇, 안드로이드(Capacitor) 앱

## 🛠 기술 스택
| 구분 | 기술 | 위치 |
| :--- | :--- | :--- |
| **Frontend** | Next.js 14 (App Router), React, Vercel | `web/` |
| **Backend** | Flask (Python), Docker (NAS 구동) | `docker/els-backend/` |
| **Bot Engine** | Selenium, Chrome (Headless), Python | `elsbot/` |
| **Auth / DB** | Supabase (PostgreSQL, OAuth) | Cloud |
| **Mobile** | Capacitor 8.x, Vanilla JS/HTML (Standalone) | `web/android/` |
| **Storage** | MinIO (S3 호환), WebDAV (Synology NAS) | NAS |

## 📂 주요 디렉토리 구조
- `web/`: Next.js 프론트엔드 코드. `app/` 라우터 구조 사용.
- `elsbot/`: 컨테이너 조회를 위한 Selenium 엔진 및 REST API 데몬.
- `docker/els-backend/`: NAS에서 구동되는 Flask API 서버.
- `docs/`: 프로젝트의 "작업 기억(Working Memory)". `01_MISSION_CONTROL.md`가 최상위 현황판.
- `scripts/`: 서버 재시작 및 배포를 위한 PowerShell/Shell 스크립트.
- `work-docs/`: 법규, 안전운임 엑셀 등 업무 참고용 원천 데이터.

## 📜 AI 협업 규칙 (Mandates)
이 규칙은 `docs/03_RULES.md`에 근거하며, 수정 불가능한 원칙입니다.

1.  **호칭 및 태도**: 사용자를 **'형'**이라 부르며, 똑 부러지는 '남동생' 페르소나를 유지합니다 (FM 스타일).
2.  **언어**: 모든 기술적 분석 및 대화는 한국어로 수행합니다.
3.  **Git 커밋**: 메시지는 반드시 한국어로 작성하며, `git commit -F commit_msg.txt` 형식을 권장합니다.
4.  **Push 정책**: 형이 명시적으로 요청했을 때만 `git push`를 수행합니다.
5.  **테스트 공간**: 모든 임시 테스트는 `.tmp_test/` 디렉토리에서 수행하고, 완료 후 즉시 삭제합니다.
6.  **현황판 유지**: `docs/01_MISSION_CONTROL.md`를 100줄 이내로 유지하며 최신 상태로 관리합니다.
7.  **인코딩**: Python 코드 작업 시 `PYTHONIOENCODING=utf-8` 환경을 고려합니다.

## 💻 실행 및 빌드 명령 (TODO)
- **Web (Next.js)**:
  - `cd web; npm run dev` (개발 서버)
  - `cd web; npm run build` (빌드 테스트)
- **ELS Bot**:
  - `cd elsbot; python els_web_runner_daemon.py` (API 서버 실행)
  - `cd elsbot; python local_debug_test.py` (봇 엔진 단독 테스트)
- **Backend (Docker)**:
  - `scripts/restart_backend.ps1` (NAS 백엔드 재시작)

## 🔗 핵심 문서 링크
- [MISSION CONTROL (전체 현황)](./docs/01_MISSION_CONTROL.md)
- [ARCHITECTURE (설계도)](./docs/04_ARCHITECTURE.md)
- [RULES (에이전트 행동 지침)](./docs/03_RULES.md)
- [RUNBOOK (운영 매뉴얼)](./docs/07_RUNBOOK.md)

---
*이 파일은 Gemini CLI에 의해 자동 생성되었습니다. (2026-03-22)*
