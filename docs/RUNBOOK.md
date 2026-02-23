# 🚀 운영 매뉴얼 (RUNBOOK)
#
# ╔══════════════════════════════════════════════════════════════════╗
# ║  이 파일은 "운영/배포/트러블슈팅"의 모든 것이다.                ║
# ║  로컬 개발, NAS Docker 배포, 문제 해결 절차를 담고 있다.        ║
# ║                                                                ║
# ║  🔗 통합 출처:                                                  ║
# ║  - /QUICK_START.md                                              ║
# ║  - /ELS_LOCAL_TEST_GUIDE.md                                     ║
# ║  - /NAS_DOCKER_ELS.md                                           ║
# ║  - /NAS_ENTWARE_INSTALL.md                                      ║
# ╚══════════════════════════════════════════════════════════════════╝
#
# 마지막 업데이트: 2026-02-23

---

## 1. 로컬 개발 환경 (빠른 시작)

### 1-1. 사전 준비
```powershell
# Python 패키지 설치
cd c:\Users\hoon\Desktop\els_home_v1\docker\els-backend
pip install -r requirements.txt

# Node.js 패키지 설치
cd c:\Users\hoon\Desktop\els_home_v1\web
npm install
```

### 1-2. 계정 설정
`elsbot/els_config.json` 파일 생성:
```json
{
  "user_id": "ETRANS_ID",
  "user_pw": "ETRANS_PW"
}
```

### 1-3. 서버 실행

**방법 A: 자동 스크립트 (권장)**
```powershell
.\scripts\start_local_test.ps1
```

**방법 B: 수동 실행 (터미널 3개)**
```powershell
# 터미널 1: Selenium 데몬
cd elsbot
python els_web_runner_daemon.py

# 터미널 2: Flask 백엔드
cd docker\els-backend
python app.py

# 터미널 3: Next.js 프론트엔드
cd web
npm run dev
```

### 1-4. 접속 및 확인
| 서비스 | URL | 확인 방법 |
|--------|-----|-----------|
| 프론트엔드 | http://localhost:3000 | 페이지 표시 |
| 백엔드 API | http://localhost:2929/api/els/capabilities | `available: true` |
| 데몬 | http://localhost:31999/health | 상태 응답 |

### 1-5. 종료
```powershell
.\scripts\stop_local_test.ps1
```

---

## 2. 테스트 시나리오

### 2-1. 로그인 테스트
1. `http://localhost:3000/employees/container-history` 접속
2. "로그인" 버튼 클릭
3. 시스템 상태 패널에서 5단계 진행 확인:
   - `[ OK ] Initialize Driver`
   - `[ OK ] Start Browser`
   - `[ OK ] Connect to ETRANS`
   - `[ OK ] User Auth`
   - `[ OK ] Load Menu`
4. "[성공] 로그인 완료" 메시지 확인

### 2-2. 조회 테스트
1. 컨테이너 번호 입력 (예: `TEMU1234567`)
2. "조회 실행" 클릭
3. 하단 테이블에 결과 표시 확인
4. "엑셀 다운로드" 버튼 테스트

### 2-3. 정상 로그 패턴
```
[네트워크] http://localhost:2929/api/els/login 접속 중...
LOG:[데몬] 계정으로 새 세션 로그인 시도 중...
LOG:[  0.50s] 로그인 시도 중...
LOG:[  5.20s] 메뉴 진입 시도 중...
LOG:[ 10.30s] 메뉴 진입 성공
LOG:[데몬] 로그인 및 메뉴 진입 성공!
[성공] 로그인 완료. 조회를 시작하세요.
```

---

## 3. NAS Docker 배포

### 3-1. 프로젝트 구조 (유령 파일 금지)
```
docker/els-backend/
├── Dockerfile          ← 설계도 (여기만 존재해야 함)
├── app.py              ← 백엔드 심장
└── requirements.txt    ← 자재 목록

❌ 프로젝트 루트의 Dockerfile, app.py는 과거 찌꺼기 → 존재 시 삭제
❌ elsbot/app.py 도 중복 → 삭제
```

### 3-2. 원클릭 배포 (nas-deploy.sh)
NAS SSH 접속 후:
```bash
cd /volume1/docker/els_home_v1
sh scripts/nas-deploy.sh
```

**스크립트 내용:**
```bash
#!/bin/bash
# 1. 최신 코드 동기화
/opt/bin/git fetch origin main && /opt/bin/git reset --hard origin/main

# 2. 이미지 빌드 (-f 옵션 필수!)
sudo docker build --no-cache -t els-backend:latest -f docker/els-backend/Dockerfile .

# 3. 컨테이너 재가동
sudo docker-compose -f docker/docker-compose.yml up -d --force-recreate
```

### 3-3. 배포 후 로그 확인
```bash
sudo docker logs -f els-backend
```

---

## 4. 트러블슈팅

### 🚨 CORS policy 에러
- **증상**: 브라우저 콘솔에 CORS 에러
- **원인**: 백엔드 CORS 설정 불일치
- **해결**: `docker/els-backend/app.py` → CORS `origins: "*"` 확인, 백엔드 재시작

### 🚨 ModuleNotFoundError: No module named 'flask_cors'
- **원인**: Docker 빌드 시 requirements.txt 무시
- **해결**: Dockerfile에서 `RUN pip install -r requirements.txt` 확인, `--no-cache` 빌드

### 🚨 502 Bad Gateway
- **원인**: 백엔드 Python 코드 에러로 서버 죽음
- **해결**: `docker logs`에서 NameError/ImportError 확인

### 🚨 503 / JSON Parsing Error (NaN)
- **원인**: 엑셀 빈 데이터에서 NaN 발생
- **해결**: `app.py`에서 `df.where(pd.notnull(df), None)` + `json.dumps(allow_nan=False)`

### 🚨 E: Unable to locate package libcursor1
- **원인**: apt-get 패키지 이름 오타
- **해결**: `libcursor1` → `libxcursor1`

### 🚨 "활성화된 브라우저 세션이 없습니다"
- **원인**: 세션 만료 또는 데몬 미실행
- **해결**: 데몬 재시작 후 다시 로그인

### 🚨 ChromeDriver 에러
- **해결**: `pip install --upgrade webdriver-manager`

### 🚨 import time 에러 (3일간 재발)
- **원인**: `__pycache__` 내 오래된 .pyc 우선 실행
- **해결**: 모든 `__pycache__` 삭제 + `PYTHONDONTWRITEBYTECODE=1` 설정

### 🚨 빌드 캐시 문제
```powershell
cd web
Remove-Item -Recurse -Force .next
npm run dev
```

---

## 5. NAS Entware 설치 (Git 사용을 위한 사전 작업)

> NAS SSH에서 `git pull`을 사용하기 위해 Entware를 설치해야 합니다.
> 대상: Synology NAS, Intel Celeron J3455 (x86_64), DSM 6/7

### 5-1. 설치 순서 (요약)
```bash
# 1. 폴더 생성 (root로)
sudo -i
mkdir -p /volume1/@Entware/opt

# 2. /opt 마운트
rm -rf /opt && mkdir /opt
mount -o bind "/volume1/@Entware/opt" /opt
# mount 실패 시: ln -sf /volume1/@Entware/opt /opt

# 3. Entware 설치 (x86_64)
wget -O - https://bin.entware.net/x64-k3.2/installer/generic.sh | /bin/sh
# wget HTTPS 안 되면: curl -sSL 사용

# 4. Git 설치
/opt/bin/opkg update
/opt/bin/opkg install git
/opt/bin/git --version
```

### 5-2. 부팅 시 자동 마운트
DSM → 제어판 → 작업 스케줄러 → 트리거된 작업 → 부팅 시 실행:
```bash
#!/bin/bash
mkdir -p /opt
mount -o bind "/volume1/@Entware/opt" /opt
/opt/etc/init.d/rc.unslung start
if ! grep -qF '/opt/etc/profile' /etc/profile; then
  echo '[ -r "/opt/etc/profile" ] && . /opt/etc/profile' >> /etc/profile
fi
/opt/bin/opkg update
```

### 5-3. NAS SSH 접속
```bash
ssh elsadmin@elssolution.synology.me
sudo -i
```

---

## 6. Docker 용량 관리
```bash
# 용량 확인
sudo docker system df

# 기본 정리
sudo docker system prune -f

# 강력 정리 (미사용 이미지까지 삭제)
docker system prune -a -f
```

---

## 7. 환경 전환 체크리스트

### 로컬 → 배포 전환 시
- [ ] `.env.local`에서 `ELS_BACKEND_URL`을 NAS 주소로 변경
- [ ] `NEXT_PUBLIC_ELS_BACKEND_URL`도 동일하게 변경
- [ ] `npm run build` 성공 확인
- [ ] Git commit (한글 메시지)
- [ ] NAS에서 `nas-deploy.sh` 실행

### 배포 → 로컬 복귀 시
- [ ] `.env.local`에서 `ELS_BACKEND_URL`을 `http://localhost:2929`로 변경
- [ ] `NEXT_PUBLIC_ELS_BACKEND_URL`도 동일하게 변경
