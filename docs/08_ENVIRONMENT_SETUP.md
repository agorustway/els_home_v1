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

## 🧰 6. AI 작업 권한/도구 요청

AI 에이전트가 작업 중 아래 항목에서 막히면 우회하지 말고 형에게 필요한 권한이나 설치를 요청한다.

### 6-1. 요청해야 하는 상황
- **네트워크 접근**: Supabase/Vercel/GitHub/NAS/패키지 레지스트리 조회가 샌드박스에 막힐 때
- **Git 쓰기 작업**: `.git/index.lock`, `git add`, `git commit`, `git push` 권한이 막힐 때
- **Android/APK 빌드**: `scripts\build_driver_apk.ps1`, Gradle, Android SDK, 네트워크 다운로드가 필요할 때
- **브라우저 검증**: Playwright/브라우저 설치 또는 로컬 dev server 실행 권한이 필요할 때
- **OS 파일 권한**: `.config`, `.pytest_cache`, 빌드 캐시 등 권한 경고가 반복될 때
- **추가 CLI 도구**: 현재 작업을 확실히 줄여주는 도구가 있을 때만 필수/선택을 나눠 제안

### 6-2. 형에게 요청할 때 포함할 것
```text
형, [필요 권한/도구]가 필요해.
이유: [현재 막힌 지점]
실행/설치 명령: [명령어]
영향 범위: [프로젝트/전역/네트워크/원격 저장소 등]
주의점/되돌리기: [있으면 기재]
```

### 6-3. 권장 선택 도구
```powershell
# GitHub 원격/PR/Actions 확인이 잦을 때
winget install --id GitHub.cli -e

# Supabase 스키마/마이그레이션 확인이 잦을 때
winget install --id Supabase.CLI -e

# 로컬 UI 자동 검증이 필요할 때
cd web
npx playwright install chromium
```

### 6-4. Windows 권한 경고 정리 예시
```powershell
$account = "$env:USERDOMAIN\$env:USERNAME"

icacls "$env:USERPROFILE\.config" /grant "${account}:(OI)(CI)F" /T
icacls ".pytest_cache" /grant "${account}:(OI)(CI)F" /T
icacls "docker\els-backend\.pytest_cache" /grant "${account}:(OI)(CI)F" /T
```

`.pytest_cache`는 테스트 캐시이므로 권한 부여 대신 삭제해도 된다.
```powershell
Remove-Item ".pytest_cache" -Recurse -Force
Remove-Item "docker\els-backend\.pytest_cache" -Recurse -Force
```

---
*최종 갱신일: 2026-05-16 (by Codex — AI 권한/도구 요청 기준 추가)*
