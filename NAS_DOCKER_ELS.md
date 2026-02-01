# 컨테이너 조회만 NAS에서 돌리기 (쉬운 설명)

**요약:** 전체 사이트는 **옮기지 않습니다.**  
지금처럼 로컬(또는 Vercel 등)에서 사이트 개발·운영하고, **컨테이너 이력조회 기능만** NAS에서 돌리는 API 서버를 하나 띄워서, 그쪽으로 연결하는 방식입니다.

---

## 1. 큰 그림 (이렇게 되는 거예요)

| 하는 곳 | 하는 일 |
|--------|---------|
| **로컬 PC (지금 작업하는 곳)** | 웹 사이트 전체 개발·실행. 회사소개, 로그인, 게시판, 자료실 등 **전부 그대로** 여기서. |
| **NAS** | **컨테이너 이력조회**에 필요한 것만 Docker로 실행 (Python + Chrome + ELS). 여기서 **API만** 제공. |

- 사용자는 **웹 주소 하나**로 접속 (로컬이면 `localhost:3000`, 배포 주소면 그 주소).
- 컨테이너 조회 버튼을 누르면 → 로컬(또는 배포된) 웹이 **NAS 주소로 API 요청**만 보냄 → NAS에서 ETRANS 로그인·조회 후 결과를 돌려줌.

그래서 **전체 사이트를 NAS로 옮길 필요 없고**, 컨테이너 조회 **API만** NAS에서 구성하면 됩니다.

---

## 2. NAS에서 할 일 (컨테이너 조회 API만 띄우기)

현재 NAS 주소: **elssolution.synology.me**

### 2-1. NAS에 프로젝트가 있어야 할까요?

- **Docker 이미지를 만들 때** 한 번만 이 프로젝트(els_home_v1)가 NAS에서 접근 가능한 곳에 있으면 됩니다.  
  (Git 클론하거나, 공유폴더에 복사해 두기.)
- 예: 공유폴더 `docker` 안에 `els_home_v1` 폴더 전체 복사  
  → NAS 기준 경로가 `/volume1/docker/els_home_v1` 이라면, 아래는 그 경로라고 생각하면 됩니다.

### 2-2. Docker 이미지 빌드 (한 번만)

**GUI(Container Manager / Docker Desktop)에서 빌드할 때**

- **빌드 컨텍스트(경로)** = **프로젝트 루트** (`els_home_v1` 폴더 전체. 안에 `elsbot`, `docker` 폴더가 있는 그 폴더)
- **Dockerfile** = **루트에 있는 `Dockerfile`** 사용 (프로젝트 루트에 `Dockerfile` 파일이 있음)
- 이렇게 하면 "Dockerfile 파일 형식이 유효하지 않습니다" 오류를 피할 수 있습니다.

**터미널(SSH)에서 빌드할 때**

프로젝트 루트로 이동한 뒤:

```bash
cd /volume1/docker/els_home_v1
docker build -t els-backend:latest .
```

(루트에 있는 `Dockerfile`을 쓰므로 `-f` 옵션 없이 위처럼 하면 됩니다.)

### 2-3. 컨테이너 실행 (한 번만)

- **Container Manager**에서:  
  **프로젝트 → 생성** → 이 저장소 루트 지정 → Compose 파일로 `docker/docker-compose.yml` 선택 후 **실행**.

또는 터미널에서:

```bash
cd /volume1/docker/els_home_v1
sudo docker-compose -f docker/docker-compose.yml up -d
```

- **"unknown shorthand flag: -f"** 가 나오면: NAS Docker가 구버전이라 `docker compose`(띄어쓰기)가 없습니다. 위처럼 **`docker-compose`**(하이픈) 를 사용하세요.
- **"Permission denied"** 가 나오면: **`sudo`** 를 앞에 붙여 실행하세요.
- **"port 2929 already allocated"** 가 나오면: 2929 포트를 쓰는 **기존 컨테이너**가 있습니다. `sudo docker ps` 로 **실제 컨테이너 이름**을 확인한 뒤(예: `els-backend1`), `sudo docker stop <이름>` → `sudo docker rm <이름>` 으로 제거하고, 다시 `sudo docker-compose -f docker/docker-compose.yml up -d` 로 올리세요.

이렇게 하면 NAS 안에서 **2929 포트**로 “컨테이너 조회 API” 서버가 돌아갑니다.  
(웹 사이트 전체가 NAS로 오는 게 아니라, 이 API만 2929에서 동작하는 겁니다.)

- **세션 유지:** 컨테이너 안에서 **ELS 데몬**이 함께 실행됩니다. 로그인 한 번 후에는 **조회할 때마다 다시 로그인하지 않고** 기존 브라우저 세션을 씁니다. 그래서 **두 번째 조회부터는 훨씬 빠르고**, 로그에 "기존 세션으로 조회 진행." 이 나옵니다.
- **조회할 때마다 "엔진 예열 및 로그인 중..." 이 나오면:** NAS에 **최신 이미지가 반영되지 않은 것**일 수 있습니다. 아래 "최신 코드 반영" 후 `sudo docker build --no-cache -t els-backend:latest .` 로 다시 빌드하고, `sudo docker-compose -f docker/docker-compose.yml down` → `sudo docker-compose -f docker/docker-compose.yml up -d` 로 다시 띄워 주세요.
- **NAS에서 `git pull` 이 없을 때 (커맨드를 찾을 수 없음):** NAS에는 Git이 설치되어 있지 않을 수 있습니다. **PC에서** 최신 코드를 받은 뒤, **프로젝트 폴더 전체**(`els_home_v1`)를 NAS 공유폴더(예: `docker`)로 **복사해 덮어쓰기**하세요. (Windows: 탐색기에서 NAS 공유폴더 열고 `els_home_v1` 붙여넣기. 또는 File Station에서 PC 쪽 폴더를 업로드.) 그 다음 NAS SSH에서 `cd /volume1/docker/els_home_v1` 후 `sudo docker build --no-cache -t els-backend:latest .` 로 빌드하면 됩니다.

#### NAS에 Git 설치하기 (선택 — `git pull`로 빠르게 반영하려면)

반영할 때마다 폴더 복사가 부담되면, NAS에 **Entware**를 설치한 뒤 `opkg install git`으로 Git을 깔고 `git pull`로 업데이트할 수 있습니다.

**Synology NAS 기준 (Intel J3455 / x86_64)**

- **상세 단계별 가이드:** [NAS_ENTWARE_INSTALL.md](./NAS_ENTWARE_INSTALL.md) 를 참고하세요. (wget 실패, HTTPS 오류, 부팅 시 마운트 등 해결 방법 포함.)
- 요약:
  1. **Entware** 설치 (Entware-ng 아님. URL은 `https://bin.entware.net/x64-k3.2/installer/generic.sh`).
  2. 폴더는 `/volume1/@Entware/opt` (대문자 E). `/opt` 는 `mount -o bind` 또는 `ln -sf` 로 연결.
  3. DSM 6/7에서는 **작업 스케줄러**로 부팅 시 `/opt` 마운트 및 `rc.unslung start` 실행.
  4. 설치 후 ` /opt/bin/opkg update && /opt/bin/opkg install git` 로 Git 설치.

**그대로 복사로 반영**  
- Git을 쓰지 않으면 **PC에서 최신 코드 받은 뒤 `els_home_v1` 전체를 NAS 공유폴더로 복사**하는 방식으로 계속 반영하면 됩니다.

Git 설치 후 한 번만 클론해 두면 됩니다.

```bash
cd /volume1/docker
git clone https://github.com/사용자/els_home_v1.git
# 또는 기존에 복사해 둔 폴더를 저장소로 연결
cd /volume1/docker/els_home_v1
git init
git remote add origin https://github.com/사용자/els_home_v1.git
git fetch origin main && git reset --hard origin/main
```

이후 코드 반영 시:

**방법 1 — 한 번에 실행 (권장)**  
프로젝트 루트에 `nas-deploy.sh` 가 있으면, NAS SSH에서 아래만 실행하면 됩니다.

```bash
cd /volume1/docker/els_home_v1
sh nas-deploy.sh
```

(또는 `chmod +x nas-deploy.sh` 후 `./nas-deploy.sh`)  
스크립트가 하는 일: `git fetch` + `git reset --hard origin/main` → 이미지 빌드 → 컨테이너 down/up.

**방법 2 — 명령어 하나씩 실행**

```bash
cd /volume1/docker/els_home_v1
/opt/bin/git fetch origin main
/opt/bin/git reset --hard origin/main
sudo docker build --no-cache -t els-backend:latest .
sudo docker-compose -f docker/docker-compose.yml down
sudo docker-compose -f docker/docker-compose.yml up -d
```

### 2-4. NAS를 밖에서 부를 수 있게 (DDNS + 역방향 프록시)

로컬 PC나 Vercel에서 NAS를 호출하려면, NAS 주소가 **인터넷에서 접근 가능**해야 합니다.

- **제어판 → 외부 액세스 → DDNS**  
  이미 **elssolution.synology.me** 로 쓰고 있다면 그대로 사용.
- **제어판 → 로그인 포털(또는 역방향 프록시)**  
  - **소스(외부)**  
    - **호스트 이름**: **`elssolution.synology.me`** 만 입력. (경로 `/els` 또는 `/els-api` 는 **호스트 이름란에 넣지 않음**. "잘못된 도메인 이름" 오류 원인.)  
    - **포트**: HTTPS면 **443**, HTTP면 **80**. (2929는 대상(내부) 포트.)  
  - **대상(내부)**  
    - 프로토콜: **HTTP**  
    - 호스트 이름: **192.168.0.4** (NAS 내부 IP)  
    - 포트: **2929**  
  - **경로 유지** 옵션이 있으면 켜 두기.  
  - 소스에 **경로** 필드가 있으면 거기에 `els-api` 또는 `/els-api` 로 넣어서, 접속 주소를 `https://elssolution.synology.me/els-api` 로 쓸 수 있습니다. 경로 필드가 없으면 호스트만 쓰고, 접속 주소는 `https://elssolution.synology.me` 가 됩니다.

이렇게 하면 “컨테이너 조회 API”의 주소는:

- **경로 필드가 있는 DSM**: `https://elssolution.synology.me/els-api`
- **경로 필드가 없는 DSM**(추천): **포트 8443** → **`https://elssolution.synology.me:8443`** (복사·확인 시 이 주소 사용.)

**"잘못된 도메인 이름" 나올 때:** 호스트 이름란에 **경로를 넣지 마세요.** `elssolution.synology.me/els` → **`elssolution.synology.me`** 만 입력. 포트는 외부용 **443**(HTTPS) 또는 **80**(HTTP). 2929는 **대상(내부)** 포트에만 넣습니다.

**이미 같은 도메인으로 다른 역방향 프록시를 쓰고 있을 때:** 기존 규칙(예: elssolution.synology.me:443 → localhost:9000)은 **그대로 두고**, **새 규칙을 하나 더** 만드세요.  
- 소스에 **경로** 필드가 있으면: 경로만 `/els-api`, 호스트·포트 동일 → 대상 `http://localhost:2929`.  
- **경로 필드가 없는 DSM**이면 아래 **대안 1** 또는 **대안 2**를 쓰면 됩니다.

**경로 없을 때 대안 (둘 중 하나 선택)**

| 대안 | 설정 | 접속 주소 | 로컬 `.env.local` |
|------|------|-----------|-------------------|
| **1. 다른 포트** | 새 규칙: 소스 `https://elssolution.synology.me` **포트 8443** → 대상 `http://localhost:2929`. (443은 기존 규칙이 쓰므로 8443 등 **다른 포트** 사용.) | `https://elssolution.synology.me:8443` | `ELS_BACKEND_URL=https://elssolution.synology.me:8443` |
| **2. 서브도메인** | DDNS/DNS에서 서브도메인(예: `els.elssolution.synology.me`)을 이 NAS로 연결한 뒤, 새 규칙: 소스 `https://els.elssolution.synology.me:443` → 대상 `http://localhost:2929`. | `https://els.elssolution.synology.me` | `ELS_BACKEND_URL=https://els.elssolution.synology.me` |

- **대안 1**: 제어판 → **외부 액세스 → 라우터 설정** (또는 **포트 전달**)에서 포트 **8443** 포워딩 추가.  
  - **사용자 지정 포트 전달**에서: 프로토콜 **TCP**, **로컬 포트** `8443`, **라우터 포트** `8443` 입력 후 완료.  
  - (외부에서 8443으로 들어오면 NAS 8443으로 전달되고, 역방향 프록시가 2929로 넘깁니다.)  
  - **8443 저장 후 할 일**: (1) 역방향 프록시에 **새 규칙** 추가: 소스 `https://elssolution.synology.me` **포트 8443** → 대상 `http://localhost:2929`. (2) 로컬 `web/.env.local` 에 `ELS_BACKEND_URL=https://elssolution.synology.me:8443` 추가 후 Next 서버 재시작.  
- **대안 2**: Synology DDNS에서 서브도메인을 지원하면 **애플리케이션 포털** 또는 DDNS에 `els` 서브도메인을 추가한 뒤, 역방향 프록시 규칙만 위처럼 추가하면 됩니다.

---

## 3. 로컬(지금 작업하는 PC)에서 할 일

- 웹 사이트는 **지금처럼** 로컬에서 실행 (전체 사이트 NAS로 옮기지 않음).
- **연결만** 해 주면 됩니다: “컨테이너 조회는 저 NAS 주소 써라”라고 환경 변수로 지정.

**로컬에서 Next.js 띄우는 폴더**(`web`)에 `.env.local` 파일이 있다고 하면, 아래 한 줄 추가:

```env
ELS_BACKEND_URL=https://elssolution.synology.me:8443
```

저장 후 Next 서버 다시 실행하면, 컨테이너 이력 페이지에서 버튼 누를 때 **로컬 사이트가 NAS의 컨테이너 조회 API**로 요청을 보냅니다.  
(나머지 페이지·로그인·게시판 등은 전부 로컬 그대로입니다.)

**Vercel 배포(www.nollae.com) 시**

- 사이트를 Vercel에 배포했다면, **Vercel 대시보드 → 프로젝트 → Settings → Environment Variables** 에서 아래 두 개를 반드시 설정하세요.
  - **`ELS_BACKEND_URL`** = `https://elssolution.synology.me:8443`  
    → 로그인·조회 API 요청을 NAS로 프록시할 때 사용.
  - **`NEXT_PUBLIC_ELS_BACKEND_URL`** = `https://elssolution.synology.me:8443`  
    → **엑셀 다운로드** 링크가 NAS를 가리키도록 할 때 사용. (이걸 안 넣으면 다운로드 시 "페이지를 찾을 수 없음" 404가 납니다.)
- 두 값은 같은 NAS 주소로 넣으면 됩니다. 저장 후 **Redeploy** 한 번 해 주세요.

---

## 4. 동작 확인

1. **NAS 쪽 API만 확인**  
   브라우저에서  
   `https://elssolution.synology.me:8443/api/els/capabilities`  
   열어서 `{"available":true,"parseAvailable":true}` 비슷하게 나오면 NAS Docker는 정상입니다.

2. **로컬 사이트에서 확인**  
   로컬에서 `npm run dev` 등으로 사이트 띄운 뒤, 컨테이너 이력 조회 페이지에서 로그인·조회 해 보면, 실제 조회는 NAS에서 하고 결과만 로컬 화면에 나옵니다.

---

## 5. 정리

| 질문 | 답 |
|------|----|
| 전체 사이트를 NAS로 옮겨야 하나요? | **아니요.** 로컬(또는 배포 서버)에서 그대로 둡니다. |
| NAS에는 뭐만 하면 되나요? | **컨테이너 조회 API만** Docker로 띄우고, DDNS + 역방향 프록시로 **포트 8443** 사용 시 `https://elssolution.synology.me:8443` 로 열리게 하면 됩니다. |
| 로컬에서는? | 사이트는 지금처럼 개발·실행하고, `.env.local`에 `ELS_BACKEND_URL=https://elssolution.synology.me:8443` 한 줄만 넣어서 **연결**해 주면 됩니다. |

이 구성을 쓰면 **컨테이너 조회 페이지만 NAS에서 구성**하고, 나머지는 전부 지금 작업하는 로컬에서 진행·연결하는 방식으로 갈 수 있습니다.

---

## 6. 이미지 빌드 시 "Dockerfile 파일 형식이 유효하지 않습니다" 나올 때

- **원인**: (1) GUI에서 빌드 컨텍스트/경로가 잘못되었거나, (2) **Dockerfile 줄바꿈이 Windows(CRLF)** 로 되어 있으면 Docker가 "형식이 유효하지 않다"고 할 수 있습니다.
- **해결** (순서대로 시도):

  1. **빌드 컨텍스트**를 **반드시 `els_home_v1` 폴더**로 지정하세요. (Dockerfile이 들어 있는 그 폴더 전체. 상위 폴더 `docker`나 `ActiveBackuptorBusines` 가 아니라 **els_home_v1**)
  2. **Dockerfile 줄바꿈을 LF로 바꾸기**  
     - Cursor / VS Code에서 `Dockerfile` 열기 → 우측 하단에 **"CRLF"** 또는 **"UTF-8"** 표시 클릭 → **"LF"** 로 바꾼 뒤 저장.  
     - 다시 이미지 빌드 시도.
  3. **GUI 대신 터미널에서 빌드**  
     - NAS에 **SSH로 접속**한 뒤(아래 7번 참고), `els_home_v1` 가 있는 폴더로 이동해서  
       `docker build -t els-backend:latest .`  
     - 이렇게 하면 GUI가 아닌 Docker 엔진이 직접 빌드해서, 같은 오류가 나는지 확인할 수 있습니다.

**"docker-compose.yml 파일 형식이 유효하지 않습니다" 나올 때:** Compose 파일을 쓰지 말고, **이미지에서 컨테이너만 직접 실행**하세요. Container Manager에서 **이미지** → `els-backend:latest` 선택 → **실행** → 컨테이너 이름·포트 2929:2929 만 설정 후 실행.

---

## 7. NAS에 SSH로 접속하는 방법 (터미널에서 빌드할 때)

Dockerfile 오류가 GUI에서 계속 나면, **PC에서 NAS로 SSH 접속**한 뒤 터미널에서 `docker build` 를 실행하면 됩니다.

### 7-1. Synology NAS에서 SSH 켜기

1. NAS **제어판** 열기.
2. **터미널 및 SNMP** (또는 **터미널**) 메뉴 들어가기.
3. **SSH 서비스 활성화** 체크 후 포트 확인 (기본 **22**). 적용.

### 7-2. PC에서 SSH 접속하기

- **Windows**: 명령 프롬프트(cmd) 또는 PowerShell 열고 아래 입력.  
  (NAS 관리자 계정 아이디와 비밀번호 입력 필요.)

```bash
ssh 관리자아이디@elssolution.synology.me
```

  - DDNS 대신 **NAS IP**를 쓰려면 (같은 공유기/사무실 안일 때):  
    `ssh 관리자아이디@192.168.x.x`

- **Mac / Linux**: 터미널에서 위와 동일하게  
  `ssh 관리자아이디@elssolution.synology.me`

- 처음 접속 시 "호스트 인증" 물음이 나오면 `yes` 입력.

### 7-3. SSH 접속이 안 될 때 (체크할 것)

아래 순서대로 확인해 보세요.

| 확인 | 어떻게 할지 |
|------|-------------|
| **1. NAS에서 SSH가 켜져 있는지** | 제어판 → **터미널 및 SNMP** → **SSH 서비스 활성화** 체크. 포트(기본 22) 확인 후 **적용** 클릭. |
| **2. 같은 네트워크인지** | PC와 NAS가 **같은 공유기/사무실 Wi‑Fi(유선)** 에 붙어 있어야 합니다. |
| **3. DDNS 대신 NAS IP로 시도** | DDNS(`elssolution.synology.me`)가 안 되면 **NAS 내부 IP**로 시도.  
  - NAS **제어판 → 네트워크 → 네트워크 인터페이스** 에서 IP 확인 (예: `192.168.0.10`).  
  - PC에서: `ssh 관리자아이디@192.168.0.10` (예시). |
| **4. 포트 지정** | Synology에서 SSH 포트를 22가 아닌 값으로 바꿨다면, 접속할 때 포트를 넣어야 합니다.  
  - 예: 포트가 **2222** 이면  
    `ssh -p 2222 관리자아이디@elssolution.synology.me`  
    또는  
    `ssh -p 2222 관리자아이디@192.168.0.10` |
| **5. 방화벽** | NAS **제어판 → 보안 → 방화벽** 에서 **SSH(22)** 또는 사용 중인 SSH 포트가 **허용**인지 확인. |
| **6. 아이디/비밀번호** | NAS **관리자 계정** 아이디·비밀번호를 정확히 입력. 대소문자 구분됨. |
| **7. Windows에서 "ssh를 찾을 수 없음"** | Windows 10/11에는 보통 SSH가 들어 있습니다. 없으면 **PowerShell**에서 `ssh` 입력 시 "앱 설치" 제안이 나오면 설치하거나, **PuTTY** 같은 SSH 클라이언트를 설치해서 사용. |

**에러 메시지별로**

- **"Connection refused"** → NAS에서 SSH 서비스가 꺼져 있거나, 포트가 다르거나, 방화벽에서 막힌 경우. 1, 4, 5번 다시 확인.
- **"Connection timed out"** → NAS IP가 틀렸거나, 다른 네트워크이거나, 방화벽/공유기에서 막는 경우. 2, 3, 5번 확인.
- **"Permission denied"** (SSH 로그인 시) → 아이디나 비밀번호가 틀린 경우. 6번 확인.
- **"permission denied" / "connect to the Docker daemon socket"** (SSH 접속 후 `docker build` 할 때) → 일반 사용자는 Docker 소켓 권한이 없음. **`sudo docker build ...`** 로 실행하세요.

**SSH 없이 빌드하는 방법**

- SSH 접속이 계속 안 되면, **로컬 PC(Windows)** 에서 Docker Desktop으로 빌드한 뒤 **이미지를 NAS로 옮기는** 방법을 쓸 수 있습니다.  
  - 로컬에서: `docker build -t els-backend:latest .` (프로젝트 루트 `els_home_v1` 에서)  
  - 이미지 저장: `docker save els-backend:latest -o els-backend.tar`  
  - `els-backend.tar` 파일을 NAS 공유폴더에 복사한 뒤, NAS **Container Manager** 에서 **이미지 → 가져오기** 로 `els-backend.tar` 를 불러오면 됩니다. (NAS 쪽에서 `docker load -i els-backend.tar` 로 가져와도 됩니다.)

### 7-4. 접속 후 Docker 이미지 빌드

1. `els_home_v1` 가 있는 경로로 이동.  
   (공유폴더 이름이 `ActiveBackuptorBusines` 라면, 예시는 아래처럼 됩니다. 실제 경로는 NAS에서 **제어판 → 공유 폴더**에서 확인.)

```bash
cd /volume1/docker/els_home_v1
```

   또는 공유폴더가 다른 볼륨이면:

```bash
cd /volume1/ActiveBackuptorBusines/docker/els_home_v1
```

2. 현재 폴더에 `Dockerfile`, `elsbot`, `docker` 가 있는지 확인:

```bash
ls -la
```

3. 이미지 빌드 실행: (**docker** 로 입력. `doker` 가 아님.)  
   - **"permission denied" / "connect to the Docker daemon socket"** 나오면 **sudo** 붙여서 실행:

```bash
sudo docker build -t els-backend:latest .
```

   (비밀번호 물어보면 NAS 관리자 비밀번호 입력.)

4. 빌드가 끝나면 **컨테이너 실행**.  
   - **GUI(Container Manager)** 에서: **이미지** 목록에서 `els-backend:latest` 선택 → **실행**(또는 **다음**) → 컨테이너 이름 `els-backend`, **포트 설정**에서 로컬 포트 **2929** → 컨테이너 포트 **2929** 연결 → **적용** 후 실행. (Compose 파일 선택하지 말고, **이미지에서 직접** 컨테이너 생성.)  
   - **SSH 터미널**에서: `sudo docker run -d --name els-backend -p 2929:2929 --restart unless-stopped els-backend:latest`  
   - **"docker-compose.yml 파일 형식이 유효하지 않습니다"** 나오면: Compose 말고 **이미지에서 직접 실행**하세요. 위처럼 이미지 선택 후 실행 → 포트 2929:2929 만 넣으면 됩니다.
