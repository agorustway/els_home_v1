#!/bin/bash
# 스크립트가 위치한 폴더의 상위 폴더(루트)로 이동해!
cd "$(dirname "$0")/.."
echo "현재 작업 디렉토리: $(pwd)"

echo "=== 1. GitHub에서 최신 코드 받기 ==="
/opt/bin/git fetch origin main
/opt/bin/git reset --hard origin/main

echo "=== 2. 기존 컨테이너 중지 ==="
sudo docker-compose -f docker/docker-compose.yml down

echo "=== 3. Docker 이미지 빌드 ==="
# -f 옵션으로 하위 폴더의 Dockerfile을 지목하고, 현재 폴더(.)를 기준으로 빌드해!
sudo docker build --no-cache -t els-backend:latest -f docker/els-backend/Dockerfile .

echo "=== 4. 컨테이너 재가동 ==="
sudo docker-compose -f docker/docker-compose.yml up -d --force-recreate

echo "=== 5. Docker 찌꺼기 청소 (용량 관리) ==="
# 이름 없는 옛날 이미지와 빌드 캐시를 삭제해! (-f는 자동 확인)
sudo docker system prune -f
sudo docker builder prune -f

echo "=== 배포 완료! 로그 확인 중... ==="
sudo docker logs -f els-backend