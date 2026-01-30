# Synology NAS Docker로 ELS 컨테이너 이력조회 백엔드 실행

사용자가 exe/apk를 설치하지 않고 **웹에서 바로** 컨테이너 이력조회를 쓰려면, **Synology NAS에서 Docker로 ELS 백엔드**를 띄우고, 웹(nollae.com 또는 인트라)에서 그 백엔드로 API 요청을 보내면 됩니다.

---

## 1. 구조

- **NAS Docker 컨테이너**: Python + Chromium + elsbot → HTTP API (`/api/els/login`, `run`, `parse-xlsx` 등) 제공, 포트 **2929**.
- **웹(Vercel 등)**: 컨테이너 이력 페이지는 그대로 두고, **API만 NAS 백엔드로 프록시**. 환경 변수 `ELS_BACKEND_URL`에 NAS 백엔드 주소를 넣으면 Next.js API가 그쪽으로 요청을 넘깁니다.
- **자료실/게시판**: 지금처럼 WebDAV·프록시로 NAS 쓰는 것은 그대로 두고, **ELS 백엔드만 Docker로 추가**로 돌리는 형태입니다.

---

## 2. NAS에서 Docker 이미지 빌드 및 실행

### 2-1. 저장소 준비

- 이 프로젝트를 NAS에서 접근 가능한 경로에 둡니다. (Git 클론 또는 공유폴더에 복사)
- 예: `/volume1/docker/els_home_v1` (실제 경로는 NAS 공유폴더에 맞게 변경)

### 2-2. 이미지 빌드 (저장소 루트에서)

**중요:** 빌드 컨텍스트는 반드시 **저장소 루트**여야 합니다 (elsbot, docker/els-backend 등이 포함된 디렉터리).

```bash
cd /volume1/docker/els_home_v1   # 실제 경로(저장소 루트)로 변경
docker build -f docker/els-backend/Dockerfile -t els-backend:latest .
```

- Synology **Container Manager**(또는 기존 Docker)에서 터미널/SSH로 위처럼 실행하거나,  
  **Container Manager → 이미지 → 빌드**에서 Dockerfile 경로를 `docker/els-backend/Dockerfile`, **컨텍스트**를 저장소 루트로 두고 빌드합니다.

### 2-3. 컨테이너 실행

**방법 A — docker run**

```bash
docker run -d --name els-backend -p 2929:2929 --restart unless-stopped els-backend:latest
```

**방법 B — Docker Compose**

```bash
docker compose -f docker/docker-compose.yml up -d
```

**방법 C — Synology Container Manager**

1. **프로젝트** → **생성** → 경로를 이 저장소 루트로 지정.
2. `docker/docker-compose.yml` 을 사용하도록 설정 후 **실행**.

### 2-4. 동작 확인

- NAS IP가 `192.168.0.10` 이라면:  
  `http://192.168.0.10:2929/api/els/capabilities`  
  브라우저나 curl로 열었을 때 `{"available":true,"parseAvailable":true}` 비슷하게 나오면 정상입니다.

---

## 3. NAS 주소를 웹에서 쓰기 (프록시)

웹(nollae.com)은 Vercel에 있으므로, **Next.js API에서만** NAS 백엔드를 호출하도록 합니다.  
NAS 주소는 **내부 주소** 또는 **DDNS+역방향 프록시**로 붙일 수 있습니다.

### 3-1. 내부에서만 접속 (사무실 LAN)

- NAS IP: `192.168.0.10`, 포트 `2929` 라면  
  `ELS_BACKEND_URL=http://192.168.0.10:2929`  
  이 주소는 **Vercel 서버에서 접속 불가**하므로,  
  **Next.js를 NAS나 사무실 서버에 같이 두고** 그 서버의 환경 변수로 `ELS_BACKEND_URL=http://192.168.0.10:2929` 를 주는 방식이어야 합니다.  
  (Vercel에 올린 사이트는 인터넷에서만 접속하므로, Vercel 서버 → NAS 직접 접속은 안 됨.)

### 3-2. DDNS + 역방향 프록시 (Vercel에서 NAS 호출 가능)

- Synology **제어판 → 외부 액세스 → DDNS** 에서 DDNS 설정 (예: `myspace.synology.me`).
- **제어판 → 로그인 포털(또는 역방향 프록시)** 에서  
  예: `https://myspace.synology.me/els-api` → `http://localhost:2929` 로 프록시.
- 그러면 웹에서 부를 주소는 `https://myspace.synology.me/els-api` 입니다.  
  (백엔드는 `/api/els/...` 경로를 쓰므로, 프록시 시 **경로 유지**하도록 설정해야 합니다.  
  예: `https://myspace.synology.me/els-api/api/els/capabilities` → `http://NAS내부IP:2929/api/els/capabilities`.)

Vercel(또는 Next.js가 돌아가는 서버)의 환경 변수에:

```env
ELS_BACKEND_URL=https://myspace.synology.me/els-api
```

이렇게 넣으면, Next.js API가 컨테이너 이력 관련 요청을 이 URL로 프록시합니다.

---

## 4. Next.js 쪽 설정 (ELS_BACKEND_URL 프록시)

- Next.js API 라우트(`/api/els/*`)에서 **`ELS_BACKEND_URL`이 있으면** 해당 URL로 요청을 넘기고, 응답을 그대로 돌려주도록 구현해 두면 됩니다.
- 이렇게 해 두면, **사용자는 설치 없이** 컨테이너 이력 페이지에서 로그인·조회·다운로드를 그대로 사용할 수 있습니다.

---

## 5. 요약

| 항목 | 내용 |
|------|------|
| **NAS Docker** | `docker/els-backend/Dockerfile` 로 이미지 빌드, 포트 2929 노출 |
| **실행** | `docker run` 또는 `docker/docker-compose.yml` 로 실행 |
| **웹 연동** | Next.js에 `ELS_BACKEND_URL` 설정 시 `/api/els/*` 가 NAS 백엔드로 프록시됨 |
| **자료실/게시판** | 기존 WebDAV·프록시 설정 유지, ELS만 Docker로 추가 |

이 구성을 쓰면 **exe/apk 설치 없이**, NAS 한 대만 Docker로 돌려서 **웹에서 컨테이너 이력조회**를 사용할 수 있습니다.
