#!/bin/sh
# NAS 배포 스크립트: GitHub 최신 코드 받기 → 이미지 빌드 → 컨테이너 재시작
# 사용법: NAS SSH 접속 후 프로젝트 폴더에서
#   sh nas-deploy.sh
# 또는 실행 권한 부여 후
#   chmod +x nas-deploy.sh && ./nas-deploy.sh

set -e

# 스크립트가 있는 디렉터리(프로젝트 루트)로 이동
cd "$(dirname "$0")"

# NAS Entware에 git이 있으면 사용, 없으면 PATH의 git 사용
if [ -x /opt/bin/git ]; then
  GIT=/opt/bin/git
else
  GIT=git
fi

echo "=== 1. GitHub에서 최신 코드 받기 ==="
$GIT fetch origin main
$GIT reset --hard origin/main

echo ""
echo "=== 2. Docker 이미지 빌드 ==="
sudo docker build --no-cache -t els-backend:latest .

echo ""
echo "=== 3. 컨테이너 재시작 ==="
sudo docker-compose -f docker/docker-compose.yml down
sudo docker-compose -f docker/docker-compose.yml up -d

echo ""
echo "=== 배포 완료 ==="
