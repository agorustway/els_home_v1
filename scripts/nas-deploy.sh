#!/bin/bash
# [v4.5.2] ELS Unified (Bot + Core + Gateway) 전체 배포 스크립트
cd "$(dirname "$0")/.."
echo "--- 🚀 ELS 통합 백엔드 전체 재배포 시작 ---"

# 1. 소스코드 동기화
/opt/bin/git fetch origin main
/opt/bin/git reset --hard origin/main

# 2. 전체 서비스 빌드 및 재실행
echo ">>> 전 서비스 빌드 및 재가동..."
# --build를 사용하여 Dockerfile 변경사항을 반영해!
sudo docker-compose -f docker/docker-compose.yml up -d --build --force-recreate

# 3. 정리
sudo docker system prune -f
sudo docker builder prune -f
echo "✅ 통합 배포 완료! (기존 포트 2929 게이트웨이 생존 확인)"
sudo docker ps