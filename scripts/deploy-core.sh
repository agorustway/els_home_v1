#!/bin/bash
# [v4.5.2] ELS Core (API/관제) 전용 경량 배포 스크립트
cd "$(dirname "$0")/.."
echo "--- ⚡ ELS Core API 전용 배포 시작 ---"

# 1. 소스코드 동기화
/opt/bin/git fetch origin main
/opt/bin/git reset --hard origin/main

# 2. 환경변수 동기화 (web/.env.local -> docker/.env)
echo ">>> 환경변수 동기화 중..."
ENV_FILE="web/.env.local"
DOCKER_ENV="docker/.env"
if [ -f "$ENV_FILE" ]; then
    CLEAN_ENV=$(cat "$ENV_FILE" | tr -d '\r')
    S_URL=$(echo "$CLEAN_ENV" | grep "^NEXT_PUBLIC_SUPABASE_URL=" | cut -d'=' -f2- | xargs)
    S_KEY=$(echo "$CLEAN_ENV" | grep "^SUPABASE_SERVICE_ROLE_KEY=" | cut -d'=' -f2- | xargs)
    G_KEY=$(echo "$CLEAN_ENV" | grep "^GEMINI_API_KEY=" | cut -d'=' -f2- | xargs)
    cat <<EOF > "$DOCKER_ENV"
SUPABASE_URL=$S_URL
SUPABASE_SERVICE_ROLE_KEY=$S_KEY
GEMINI_API_KEY=$G_KEY
DAEMON_URL=http://127.0.0.1:2931
EOF
    echo "✅ docker/.env 생성 완료 (G_KEY 존재 확인: $([ -n "$G_KEY" ] && echo "YES" || echo "NO"))"
fi

# 2. Core 서비스만 빌드 및 재실행 (기타 서비스 유지)
echo ">>> els-core 서비스 빌드 및 재가동..."
sudo docker-compose -f docker/docker-compose.yml up -d --build --force-recreate els-core

# 3. 정리
sudo docker system prune -f
sudo docker builder prune -f
echo "✅ Core API 배포 완료 (봇 서비스는 중단 없이 유지됨)"
sudo docker logs -f els-core --tail 20
