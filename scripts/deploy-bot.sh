#!/bin/bash
# [v4.5.2] ELS Bot (Selenium/Chrome) 전용 중량 배포 스크립트
cd "$(dirname "$0")/.."
echo "--- 🐌 ELS Bot Selenium 전용 배포 시작 (예상 시간: 30-40분) ---"

# 1. 소스코드 동기화
/opt/bin/git fetch origin main
/opt/bin/git reset --hard origin/main

# 2. Bot 서비스만 빌드 및 재실행 (Core API 서비스 유지)
echo ">>> els-bot 서비스 빌드 및 재가동..."
sudo docker-compose -f docker/docker-compose.yml up -d --build --force-recreate els-bot

# 3. 정리
sudo docker system prune -f
sudo docker builder prune -f
echo "✅ Bot 배포 완료 (API 서버는 중단 없이 유지됨)"
sudo docker logs -f els-bot --tail 20
