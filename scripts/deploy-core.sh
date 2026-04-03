#!/bin/bash
# [v4.5.2] ELS Core (API/관제) 전용 경량 배포 스크립트
cd "$(dirname "$0")/.."
echo "--- ⚡ ELS Core API 전용 배포 시작 ---"

# 1. 소스코드 동기화
/opt/bin/git fetch origin main
/opt/bin/git reset --hard origin/main

# 2. Core 서비스만 빌드 및 재실행 (기타 서비스 유지)
echo ">>> els-core 서비스 빌드 및 재가동..."
sudo docker-compose -f docker/docker-compose.yml up -d --build --force-recreate els-core

# 3. 정리
sudo docker system prune -f
sudo docker builder prune -f
echo "✅ Core API 배포 완료 (봇 서비스는 중단 없이 유지됨)"
sudo docker logs -f els-core --tail 20
