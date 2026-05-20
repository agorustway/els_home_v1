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

### 6-5. Codex Desktop 반복 권한/배포 이슈 표준 대응
아래 항목은 Codex Desktop 샌드박스/Windows PowerShell 조합에서 반복 확인된 문제입니다. 같은 증상이 나오면 원인 분석을 길게 반복하지 말고, 표준 대응을 먼저 적용합니다.

#### Git 인덱스 권한
- 증상: `git add`, `git commit`, `git restore --staged`에서 `.git/index.lock: Permission denied` 또는 인덱스 쓰기 실패.
- 원칙: 실제 `index.lock`이 있고 살아있는 git 프로세스가 있는지 먼저 확인합니다. 확인 없이 잠금 파일을 삭제하지 않습니다.
- 표준 대응: `.git` 쓰기가 필요한 명령은 Codex에서 `require_escalated`로 재실행합니다.
- 권장 escalated prefix: `git add`, `git commit`, `git restore --staged`, `git push`.

#### GitHub/NAS/Supabase 네트워크
- 증상: `git push`가 `Failed to connect to github.com:443`, Next API가 NAS/Supabase 접속 중 `EACCES`, 빌드/브라우저 검증 중 외부 fetch 실패.
- 원칙: 코드 오류로 단정하지 않고 샌드박스 네트워크 제한 가능성을 먼저 봅니다.
- 표준 대응: 실제 원격 접근이 필요한 명령은 같은 명령을 `require_escalated`로 재실행합니다.
- 예: `git push origin main`, `npm.cmd run build`, 실제 NAS 데이터를 붙이는 로컬 dev server 실행/브라우저 검증.

#### Supabase DDL/마이그레이션 적용 권한
- 증상: `SUPABASE_SERVICE_ROLE_KEY`로 일반 REST CRUD는 가능하지만 `CREATE TABLE`, `ALTER TABLE`, RLS 정책 생성 같은 DDL은 실행할 수 없고, `pg-meta` hosted endpoint는 404를 반환합니다.
- 표준 대응: Supabase CLI 로그인 토큰(`SUPABASE_ACCESS_TOKEN`) 또는 Postgres 연결 문자열(`--db-url`)이 있어야 `npx.cmd supabase db query --file <sql>`로 적용할 수 있습니다.
- 확인 명령: `npx.cmd supabase projects list --output json`이 `Access token not provided`를 반환하면 Management API 적용 권한이 없는 상태입니다.
- 우선순위: Codex Supabase 커넥터가 정상 활성화되면 커넥터 SQL 실행 도구를 우선 사용하고, 커넥터가 막히면 형에게 `SUPABASE_ACCESS_TOKEN` 또는 percent-encoded Postgres connection string 제공을 요청합니다.

#### PowerShell `PATH/Path` 중복 키
- 증상: `Start-Process` 또는 `Get-ChildItem Env:`에서 `항목이 이미 추가되었습니다. 사전에 있는 키: 'Path' 추가되는 키: 'PATH'`.
- 표준 대응: 백그라운드 프로세스를 띄우기 전 현재 세션의 중복 환경 키를 정리합니다.
```powershell
$pathValue = $env:Path
Remove-Item Env:PATH -ErrorAction SilentlyContinue
$env:Path = $pathValue
```
- 이후 `Start-Process -WindowStyle Hidden ...` 또는 직접 `node.exe node_modules/next/dist/bin/next dev -p 3000`을 사용합니다.
- 주의: `Get-ChildItem Env:` 자체가 실패할 수 있으므로 환경변수 전체 나열로 확인하려 하지 말고 위 정리 명령을 먼저 실행합니다. 그래도 `Start-Process`가 계속 실패하면 우회 실행을 반복하지 말고 형에게 현재 셸 재시작 또는 `cd web; npm run dev -- -p 3000` 수동 실행을 요청합니다.

#### PowerShell `Start-Job`/ScheduledJobs 권한
- 증상: `Get-Job`/`Receive-Job`에서 `ScheduledJobs` 경로 접근 거부.
- 표준 대응: dev server 로그 확인용으로 `Start-Job`을 쓰지 않습니다. `Start-Process` 로그 리다이렉트 또는 Codex Browser의 Node REPL 지속 프로세스를 사용합니다.

#### 한글 커밋 메시지 BOM/깨짐
- 증상: `Set-Content -Encoding UTF8 commit_msg.txt` 후 커밋 제목 앞에 보이지 않는 BOM 문자가 붙음.
- 표준 대응: 커밋 메시지 파일은 UTF-8 without BOM으로 씁니다.
```powershell
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) 'commit_msg.txt'),
  '커밋 메시지',
  [System.Text.UTF8Encoding]::new($false)
)
git commit -F commit_msg.txt
Remove-Item -LiteralPath commit_msg.txt -Force
```

#### 한글 포함 부분 스테이징
- 증상: PowerShell heredoc/pipe로 `git apply --cached`를 호출하면 한글이 `??`로 깨질 수 있음.
- 표준 대응: 한글 패치는 `apply_patch`로 `.tmp_test/*.patch` 파일을 만든 뒤 `git apply --cached --unidiff-zero .tmp_test/*.patch`를 사용합니다. 가능하면 파일 전체 스테이징을 우선하고, 다른 작업자의 변경이 섞인 파일만 부분 스테이징합니다.
- 작업 후 `.tmp_test/`는 즉시 삭제합니다.

#### NAS 배포 sudo/PATH
- NAS 배포 스크립트는 이미 `sudo -n`과 Docker PATH 주입 기준으로 보강되어 있습니다.
- 배포 중 sudo 비밀번호 프롬프트가 다시 뜨면 우회하지 말고 중단합니다. NAS sudoers/NOPASSWD 설정 문제로 보고 형에게 해당 명령과 영향 범위를 요청합니다.
- 전체 NAS 배포가 필요 없고 core만 바뀐 경우 `sh scripts/deploy-core.sh`, bot만 바뀐 경우 `sh scripts/deploy-bot.sh`를 우선 사용합니다.

#### Codex 컨텍스트에 넣을 요약
```text
반복 권한 이슈 표준 대응:
- Git 인덱스 쓰기(`git add/commit/restore --staged`)와 `git push`는 샌드박스 권한/네트워크 실패 시 즉시 require_escalated로 재실행한다.
- GitHub/NAS/Supabase/실제 dev server 검증 네트워크가 `EACCES` 또는 connect fail이면 같은 명령을 require_escalated로 재실행한다.
- Supabase DDL은 service_role REST 키만으로 적용할 수 없다. `SUPABASE_ACCESS_TOKEN` 또는 `supabase db query --db-url`용 Postgres 연결 문자열이 필요하다.
- PowerShell Start-Process 전에 PATH/Path 중복 키 정리: `$pathValue=$env:Path; Remove-Item Env:PATH -ErrorAction SilentlyContinue; $env:Path=$pathValue`.
- commit_msg.txt는 `[System.Text.UTF8Encoding]::new($false)`로 UTF-8 BOM 없이 작성하고 `git commit -F commit_msg.txt` 후 삭제한다.
- 한글 포함 부분 스테이징은 PowerShell 파이프 대신 apply_patch로 UTF-8 patch 파일을 만든 뒤 `git apply --cached`한다.
- Start-Job/Get-Job은 ScheduledJobs 권한 문제를 일으킬 수 있으니 dev server는 Start-Process 또는 Browser Node REPL 지속 프로세스로 띄운다.
```

---
*최종 갱신일: 2026-05-20 (by Codex — Supabase DDL 적용 권한 기준 보강)*
