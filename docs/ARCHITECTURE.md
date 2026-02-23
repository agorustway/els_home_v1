# 🏗️ 시스템 아키텍처 (ARCHITECTURE)
#
# ╔══════════════════════════════════════════════════════════════════╗
# ║  이 파일은 시스템의 "설계도"이다.                               ║
# ║  전체 아키텍처, 데이터 흐름, 모듈 간 관계를 서술한다.           ║
# ║                                                                ║
# ║  🔗 통합 출처:                                                  ║
# ║  - /DESKTOP_ANDROID_APPS.md                                     ║
# ║  - /elsbot/ELSBOT_분석.md                                       ║
# ║  - /README.md                                                   ║
# ╚══════════════════════════════════════════════════════════════════╝
#
# 마지막 업데이트: 2026-02-23

---

## 1. 시스템 전체 구조도

```
┌──────────────────────────────────────────────────────────────────┐
│                        사용자 (형)                                │
│                     PC / 모바일 브라우저                           │
└──────────────┬───────────────────────────┬───────────────────────┘
               │                           │
               ▼                           ▼
┌──────────────────────┐    ┌──────────────────────────────────────┐
│   Vercel (nollae.com)│    │   Synology NAS (elssolution)        │
│                      │    │                                      │
│   Next.js 14         │    │  ┌─────────────────────────────┐    │
│   - SSR/CSR 렌더링   │    │  │ Docker: els-backend         │    │
│   - API Routes       │◄──►│  │ Flask (port 2929)           │    │
│   - Supabase 연동    │    │  │ - /api/els/login            │    │
│   - S3 Proxy         │    │  │ - /api/els/run              │    │
│                      │    │  │ - /api/els/capabilities     │    │
└──────────────────────┘    │  └──────────┬──────────────────┘    │
                            │             │                        │
                            │             ▼                        │
                            │  ┌─────────────────────────────┐    │
                            │  │ Docker: els-daemon          │    │
                            │  │ Selenium + Chrome (31999)   │    │
                            │  │ - els_bot.py (엔진)         │    │
                            │  │ - els_web_runner_daemon.py  │    │
                            │  └──────────┬──────────────────┘    │
                            │             │                        │
                            │             ▼                        │
                            │  ┌─────────────────────────────┐    │
                            │  │ MinIO (S3 호환)             │    │
                            │  │ 파일 저장소 (els-files)     │    │
                            │  └─────────────────────────────┘    │
                            └──────────────────────────────────────┘

별도 클라우드:
┌──────────────────────┐
│   Supabase           │
│   - Auth (OAuth)     │
│   - PostgreSQL       │
│   - profiles         │
│   - user_roles       │
│   - posts            │
└──────────────────────┘
```

---

## 2. 모듈별 상세

### 2-1. 프론트엔드 (web/)

| 항목 | 설명 |
|------|------|
| **프레임워크** | Next.js 14 (App Router) |
| **배포** | Vercel (nollae.com) |
| **인증** | Supabase Auth (Google, Kakao, Naver OAuth) |
| **상태관리** | React useState/useEffect (별도 상태 라이브러리 없음) |
| **폰트** | Geist (next/font 자동 최적화) |

**주요 페이지 구조:**
```
web/app/
├── page.js                        ← 메인 홈페이지 (공식 사이트)
├── employees/                     ← 임직원 전용 인트라넷
│   ├── page.js                    ← 인트라넷 대시보드
│   ├── container-history/         ← 컨테이너 이력조회 (ELS 핵심)
│   ├── safe-freight/              ← 안전운임 조회
│   ├── reports/                   ← 업무보고 (일간/월간/내 보고서)
│   ├── nas/                       ← NAS 자료실
│   ├── webzine/                   ← 사내 웹진
│   ├── contacts/                  ← 연락처 (협력사/운전원/지점)
│   └── admin/                     ← 관리자 대시보드
└── api/                           ← API Routes
    ├── employees/els-creds/       ← ELS 계정 저장/조회
    ├── news/                      ← 뉴스 수집
    ├── weather/                   ← 날씨 조회
    └── nas/                       ← NAS 프록시
```

### 2-2. ELS 봇 엔진 (elsbot/)

| 파일 | 역할 |
|------|------|
| `els_bot.py` | **핵심 엔진**: Chrome 제어, ETRANS 로그인, 메뉴 진입, 데이터 추출 |
| `els_web_runner_daemon.py` | **HTTP 데몬**: 웹에서 호출 가능한 REST API 제공 (port 31999) |
| `els_config.json` | 로컬 테스트용 계정 설정 (gitignore 대상) |

**봇 실행 흐름:**
```
1. login_and_prepare(id, pw)
   → Chrome 헤드리스 시작
   → ETRANS 로그인
   → 팝업 돌파 (비밀번호 변경, IP 통제 등)
   → "컨테이너 이동현황" 메뉴 진입

2. solve_input_and_search(driver, container_no)
   → iframe 내 입력창에 번호 입력 + 엔터

3. scrape_hyper_verify(driver, container_no)
   → 그리드에서 "수출/수입" 행 파싱
   → | 구분자로 컬럼 분리

4. 엑셀 생성 (openpyxl)
   → Sheet1: No=1 행만 (최신 현황)
   → Sheet2: 전체 이력
   → 색상: 수입(빨강), 반입(파랑), ERROR(빨강)
```

**주의사항:**
- **인코딩**: Python 호출 시 `PYTHONIOENCODING=utf-8` 필수
- **타임아웃**: 로그인 90초, 조회 120초 (NAS CPU 상황에 따라 가변)
- **세션**: 55분 주기 자동 갱신, 무활동 시 재로그인
- **봇 탐지**: 테스트 빈도를 최소화해야 함

### 2-3. ELS 백엔드 (docker/els-backend/)

| 파일 | 역할 |
|------|------|
| `app.py` | Flask 서버: 봇 호출, 엑셀 파싱, 데이터 변환, CORS 처리 |
| `Dockerfile` | Docker 이미지 설계 (Chrome + Python 환경) |
| `requirements.txt` | 의존성: flask, pandas, openpyxl, selenium, flask-cors |

### 2-4. 데스크탑 앱 (desktop/)

| 항목 | 설명 |
|------|------|
| **프레임워크** | Electron |
| **상태** | 개발 중 (기본 구조만 존재) |
| **목적** | Vercel에서 불가능한 봇 기능을 로컬 PC에서 실행 |

**데스크탑 + 안드로이드 연동 구조:**
```
[데스크탑 앱 (Electron)]  ←→  [안드로이드 앱 (WebView)]
     PC에서 서버 역할              같은 Wi-Fi로 접속
     port 2929                     PC IP:2929 입력
```

---

## 3. 데이터 흐름

### 3-1. 컨테이너 이력 조회 (핵심 기능)
```
브라우저 → Vercel API → NAS Flask API → NAS Selenium 데몬 → ETRANS 사이트
                                    ↓
                              데이터 추출
                                    ↓
                         JSON 스트리밍 응답 → 브라우저 실시간 표시
                                    ↓
                         last_search_result.json 저장 (복구용)
```

### 3-2. 인증 플로우
```
브라우저 → Supabase Auth (OAuth)
        → 이메일 기준 통합 아이덴티티
        → profiles/user_roles 테이블 매핑
        → Google/Kakao/Naver 어느 것으로든 같은 권한 유지
```

---

## 4. 환경 변수 맵

| 변수명 | 용도 | 위치 |
|--------|------|------|
| `NAS_URL` | NAS WebDAV 주소 | `.env.local` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | `.env.local` + Vercel |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 공개 키 | `.env.local` + Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 서비스 키 (서버 전용) | `.env.local` + Vercel |
| `ELS_BACKEND_URL` | Flask 백엔드 주소 | `.env.local` (로컬: localhost:2929, 배포: NAS:8443) |
| `NEXT_PUBLIC_ELS_BACKEND_URL` | 클라이언트에서 접근하는 백엔드 주소 | `.env.local` + Vercel |
| `NEXT_PUBLIC_KAKAO_REST_API_KEY` | 카카오 OAuth | `.env.local` + Vercel |
| `NEXT_PUBLIC_NAVER_CLIENT_ID` | 네이버 OAuth | `.env.local` + Vercel |
| `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID` | 네이버 지도 | `.env.local` + Vercel |

---

## 5. 확장 고려사항

### 준비된 것 (인프라 있음)
- [ ] 데스크탑 앱 Windows 인스톨러 완성
- [ ] 안드로이드 WebView APK 생성

### 미래 고려 (인프라 미정)
- [ ] ETRANS 외 다른 물류 플랫폼 봇 추가
- [ ] 작업 스케줄링 (정기 자동 조회)
- [ ] 알림 시스템 (카카오톡/이메일 연동)
