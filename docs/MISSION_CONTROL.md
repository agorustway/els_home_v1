# 🧠 ELS 프로젝트 현황판 (MISSION CONTROL)
#
# ╔══════════════════════════════════════════════════════════════════╗
# ║  이 파일은 프로젝트의 "작업 기억(Working Memory)"이다.          ║
# ║  모든 AI 에이전트(Antigravity, Gemini, Cursor 등)는            ║
# ║  대화 시작 시 이 파일을 반드시 먼저 읽어야 한다.                ║
# ║                                                                ║
# ║  📏 규칙: 이 파일은 100줄 이내로 유지한다.                      ║
# ║  상세 내용은 DEV_LOG.md, ARCHITECTURE.md 등에 기록한다.          ║
# ╚══════════════════════════════════════════════════════════════════╝
#
# 마지막 업데이트: 2026-02-23
# 업데이트한 사람: Antigravity Agent (메모리 체계 통합 작업)

---

## 1. 프로젝트 정체성

| 항목 | 내용 |
|------|------|
| **프로젝트명** | ELS Solution - 임직원 포털 & 인트라넷 |
| **도메인** | nollae.com (Vercel 배포) |
| **소유자** | 형 (hoon) — AI-인간 협업 방식으로 개발 |
| **목적** | 물류 회사 임직원의 업무 효율화 (컨테이너 조회, 업무보고, 자료실 등) |

---

## 2. 기술 스택 요약

| 계층 | 기술 | 위치 |
|------|------|------|
| **프론트엔드** | Next.js 14 + React | `web/` → Vercel 배포 |
| **인증/DB** | Supabase (Google/Kakao/Naver OAuth) | 클라우드 |
| **파일 저장** | MinIO (S3 호환) on NAS | `elssolution.synology.me` |
| **ELS 백엔드** | Flask (Python) | `docker/els-backend/` → NAS Docker |
| **ELS 봇 엔진** | Selenium + Chrome | `elsbot/` → NAS Docker |
| **데스크탑 앱** | Electron | `desktop/` (개발 중) |

---

## 3. 핵심 서비스 포트

| 서비스 | 로컬 포트 | 배포 주소 |
|--------|-----------|-----------|
| 프론트엔드 (Next.js) | `3000` | nollae.com |
| ELS 백엔드 (Flask) | `2929` | `elssolution.synology.me:8443` |
| ELS 데몬 (Selenium) | `31999` | NAS Docker 내부 |

---

## 4. 현재 상태 (TODO)

### 🔴 진행 중
- (현재 진행 중인 작업 없음 — 메모리 체계 구축 중)

### 🟡 알려진 이슈
- NAS CPU 부하 시 Selenium 타임아웃 증가 경향
- 봇 테스트 빈도 주의 (ETRANS 측 봇 탐지 가능성)
- `.env.local`에 사용하지 않는 키 잔존 (정리 필요)

### 🟢 최근 완료 (최신 5건)
- [2026-02-23] AI 메모리 체계 통합 (docs/ 디렉토리 구축)
- [2026-02-20] 엑셀 2시트 구조 복원 (최신현황 + 전체이력)
- [2026-02-20] 봇 안정화: 팝업 돌파, 100건 조회, 세션 복구
- [2026-02-19] 실시간 컨테이너 이력 스트리밍 구현
- [2026-02-13] 사다리 게임 모바일 레이아웃 수정

---

## 5. 파일 시스템 지도

```
els_home_v1/
├── docs/                   ← 🧠 AI 통합 메모리 (이 파일이 여기 있음)
│   ├── MISSION_CONTROL.md  ← 현황판 (지금 읽고 있는 것)
│   ├── RULES.md            ← 협업 규칙
│   ├── DEV_LOG.md          ← 개발 이력 (통합본)
│   ├── ARCHITECTURE.md     ← 시스템 아키텍처 상세
│   ├── RUNBOOK.md          ← 운영/배포/트러블슈팅 가이드
│   └── _archive/           ← 통합 전 기존 파일 백업 (gitignore)
├── scripts/                ← 운영 스크립트 (ps1, bat, sh)
├── web/                    ← Next.js 프론트엔드
├── elsbot/                 ← Selenium 봇 엔진
├── docker/els-backend/     ← Flask 백엔드
├── desktop/                ← Electron 데스크탑 앱
└── work-docs/              ← 업무 참고 자료 (PDF, 엑셀 등)
```

---

## 6. 긴급 연락처 (AI가 알아야 할 것)

- **Git 커밋 메시지**: 무조건 **한글**로 작성
- **호칭**: 사용자를 **'형'**이라 부름
- **Push 정책**: 형이 명시적으로 요청할 때만 push
- **상세 규칙**: `docs/RULES.md` 참조
