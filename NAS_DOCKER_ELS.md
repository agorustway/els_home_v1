🚛 ELS 컨테이너 이력조회 NAS API 가이드
핵심 요약: 웹 화면(UI)은 Vercel이나 로컬에 두고, **조회 엔진(API)**만 시놀로지 NAS에서 돌리는 하이브리드 방식입니다.

1. 프로젝트 구조 및 파일 관리 (매우 중요)
빌드 오류를 방지하기 위해 최상위 폴더의 '유령 파일'을 제거하고 아래 경로를 엄수해야 합니다.

✅ 진짜 파일 위치
설계도: docker/els-backend/Dockerfile

자재 목록: docker/els-backend/requirements.txt

백엔드 심장: docker/els-backend/app.py

조회 엔진: elsbot/els_web_runner_daemon.py

❌ 삭제해야 할 파일 (유령 파일)
프로젝트 루트(els_home_v1/)에 있는 Dockerfile, requirements.txt, app.py는 과거의 찌꺼기이므로 반드시 삭제하세요.

elsbot/app.py 역시 중복 파일이므로 삭제하여 혼선을 방지합니다.

2. Docker 빌드 및 배포 (nas-deploy.sh)
NAS 터미널에서 아래 스크립트를 실행하여 한 번에 업데이트합니다.

Bash
#!/bin/bash
echo "=== 1. GitHub에서 최신 코드 받기 ==="
/opt/bin/git fetch origin main
/opt/bin/git reset --hard origin/main

echo "=== 2. Docker 이미지 빌드 ==="
# -f 옵션으로 하위 폴더의 Dockerfile을 정확히 지목해야 합니다.
sudo docker build --no-cache -t els-backend:latest -f docker/els-backend/Dockerfile .

echo "=== 3. 컨테이너 재가동 ==="
sudo docker-compose -f docker/docker-compose.yml up -d --force-recreate

echo "=== 배포 완료 및 로그 확인 ==="
sudo docker logs -f els-backend
3. 핵심 파일 설정값
📦 requirements.txt
flask-cors가 빠지면 브라우저에서 접속이 차단됩니다.

Plaintext
flask>=3.0.0
pandas>=2.0
openpyxl>=3.1
selenium>=4.15
webdriver-manager>=4.0
flask-cors
🐳 Dockerfile 주요 포인트
패키지 오타(libxcursor1)와 실행 환경을 고정한 최종 버전입니다.

시스템 패키지: libxcursor1 등 Chromium 실행 필수 라이브러리 포함.

실시간 로그: python -u 옵션을 사용하여 실시간 소요 시간 출력을 보장합니다.

중복 제거: 빌드 과정에서 elsbot 내부의 불필요한 파일을 정리합니다.

4. 트러블슈팅 가이드 (실전 대응)
🚨 ModuleNotFoundError: No module named 'flask_cors'
원인: 도커 빌드 시 requirements.txt를 무시하고 Flask만 개별 설치했을 때 발생합니다.

해결: Dockerfile에서 RUN pip install -r requirements.txt를 사용하고 빌드 시 --no-cache 옵션을 줍니다.

🚨 502 Bad Gateway / CORS Policy Error
원인: 백엔드 파이썬 코드 에러(예: import time 누락)로 서버가 죽었을 때 발생합니다.

해결: docker logs를 확인하여 NameError나 ImportError를 먼저 잡아야 합니다.

🚨 E: Unable to locate package libcursor1
원인: apt-get 패키지 이름 오타입니다.

해결: libcursor1을 **libxcursor1**로 수정하면 해결됩니다.

5. 고급 기능 설명
실시간 로그 스트리밍: 각 작업 단계마다 [1.2s]와 같은 소요 시간을 계산하여 사용자에게 즉시 전송합니다.

55분 세션 자동 관리: 데몬이 백그라운드에서 1분마다 체크하여, 55분간 활동이 없으면 세션 만료 전 자동으로 재로그인을 수행합니다.

# 🚛 Synology NAS Docker 배포 및 운영 가이드

### 1. 프로젝트 구조 (유령 파일 금지)
도커 빌드 오류 방지를 위해 아래 경로를 엄수한다.
- **설계도**: `docker/els-backend/Dockerfile`
- **심장**: `docker/els-backend/app.py`
- **엔진**: `elsbot/els_bot.py`
- **데몬**: `elsbot/els_web_runner_daemon.py`
*주의: 프로젝트 루트(`els_home_v1/`)의 Dockerfile, app.py는 반드시 삭제할 것.*

### 2. 빌드 및 배포 스크립트 (nas-deploy.sh)
나스 SSH에서 아래 명령어로 한 번에 배포한다.
```bash
# 1. 최신 코드 동기화
/opt/bin/git fetch origin main && /opt/bin/git reset --hard origin/main

# 2. 이미지 빌드 (-f 옵션 필수)
sudo docker build --no-cache -t els-backend:latest -f docker/els-backend/Dockerfile .

# 3. 컨테이너 재가동
sudo docker-compose -f docker/docker-compose.yml up -d --force-recreate