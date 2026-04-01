# 🧠 ELS Solution 개발 환경 구축 가이드 (Environment Setup)

이 문서는 ELS Solution 프로젝트를 새로운 환경에서 시작하거나 유지보수할 때 필요한 도구와 설정 과정을 담고 있습니다.

---

## 🚀 1. 기본 도구 설치 (Windows/Scoop 기반)

Windows 환경에서 개발 생산성을 극대화하기 위해 `Scoop` 패키지 매니저를 활용한 설치를 권장합니다.

### 1-1. Scoop 설치 (PowerShell)
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
iwr -useb get.scoop.sh | iex
```

### 1-2. 필수 전문 개발 도구 설치
AI 에이전트(Antigravity)의 정밀한 탐색과 빠른 빌드 확인을 위해 다음 도구들을 반드시 설치하십시오.
```powershell
# 고속 전체 텍스트 검색 (findstr 대신 사용)
scoop install ripgrep (rg)

# 고속 파일 검색 (find 대신 사용)
scoop install fd

# 자동화 스크립트 실행 (nas-deploy 시 활용)
scoop install make

# Git 및 패키지 관리
scoop install git nodejs-lts python
```

---

## 📂 2. 프론트엔드 (Next.js) 설정

- **위치**: `web/`
- **프로세스**: 
  1. `npm install` (의존성 설치)
  2. `.env.local` 파일 생성 (Supabase, NAS API URL 설정)
- **주요 환경 변수**:
  - `NEXT_PUBLIC_SUPABASE_URL`: Supabase 프로젝트 URL
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase 익명 키
  - `NEXT_PUBLIC_ELS_BACKEND_URL`: NAS Docker 서버 주소 (예: `http://192.168.0.4:2929`)

---

## 🐋 3. 나스 백엔드 (NAS Docker) 설정

- **위치**: `docker/els-backend/` (NAS SSH 접속 후 `~/els_home_v1` 폴더)
- **배포 명령**: `sh scripts/nas-deploy.sh`
- **백엔드 구성**:
  - `Dockerfile`: Python 3.11-slim 기반, Chrome 131 포함
  - `requirements.txt`: Supabase, DrissionPage, Flask 등 포함
- **환경 변수 (`docker-compose.yml`)**:
  - `SUPABASE_URL`: DB 주소
  - `SUPABASE_SERVICE_ROLE_KEY`: 관리자 권한 키 (유출 주의)
  - `CHROME_BIN`: `/usr/bin/google-chrome`
  - `CHROME_DRIVER_BIN`: `/usr/local/bin/chromedriver`

---

## 🤖 4. ELS Bot 엔진

- **위치**: `elsbot/`
- **방식**: `DrissionPage` (Chromium 기반)
- **주의사항**:
  - 메뉴 진입은 **텍스트 기반 순차 클릭** 방식이 가장 안정적입니다.
  - 헤드리스 모드(`headless=True`)와 `--no-sandbox` 용 옵션은 나스 환경에서 필수입니다.

---

## 🔑 5. 서비스 계정 관리

- **Supabase**: 데이터베이스, 인증, 실시간 로그 저장소
- **Vercel**: 고성능 프론트엔드 호스팅 및 정적 리소스 (고가용성)
- **NAS (Synology)**: 고중량 API 처리, 엑셀/파일 서버, 봇 데몬 상시 구동

---
*최종 갱신일: 2026-04-01 (by Antigravity)*
