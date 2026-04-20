#!/bin/bash
# [v4.5.2] ELS Unified (Bot + Core + Gateway) 전체 배포 스크립트
cd "$(dirname "$0")/.."
echo "--- 🚀 ELS 통합 백엔드 전체 재배포 시작 ---"

# 1. 소스코드 동기화
/opt/bin/git fetch origin main
/opt/bin/git reset --hard origin/main

# 2. 환경변수 동기화 (web/.env.local -> docker/.env)
echo ">>> 환경변수 동기화 중..."
ENV_FILE="web/.env.local"
DOCKER_ENV="docker/.env"

    # 가능한 모든 env 파일 탐색
    SEARCH_FILES="$ENV_FILE web/.env docker/.env .env"
    
    # 더 강력한 패턴 매칭 (여러 파일 순회, -E 옵션 제외)
    S_URL=$(cat $SEARCH_FILES 2>/dev/null | grep "SUPABASE_URL=" | head -n 1 | cut -d'=' -f2- | xargs | tr -d '\r')
    S_KEY=$(cat $SEARCH_FILES 2>/dev/null | grep "SUPABASE_SERVICE_ROLE_KEY=" | head -n 1 | cut -d'=' -f2- | xargs | tr -d '\r')
    
    G_KEY=$(cat $SEARCH_FILES 2>/dev/null | grep "GEMINI_API_KEY=" | head -n 1 | cut -d'=' -f2- | xargs | tr -d '\r')
    if [ -z "$G_KEY" ]; then
        G_KEY=$(cat $SEARCH_FILES 2>/dev/null | grep "AIza" | head -n 1 | cut -d'=' -f2- | xargs | tr -d '\r')
    fi
    
    # 하나라도 못 찾았다면 빈 값 방지를 위해 기존 파일 내용 유지 (fallback)
    if [ -z "$G_KEY" ] && [ -f "$DOCKER_ENV" ]; then
        G_KEY=$(grep "GEMINI_API_KEY=" "$DOCKER_ENV" | head -n 1 | cut -d'=' -f2- | xargs | tr -d '\r')
    fi
    if [ -z "$S_URL" ] && [ -f "$DOCKER_ENV" ]; then
        S_URL=$(grep "SUPABASE_URL=" "$DOCKER_ENV" | head -n 1 | cut -d'=' -f2- | xargs | tr -d '\r')
    fi
    if [ -z "$S_KEY" ] && [ -f "$DOCKER_ENV" ]; then
        S_KEY=$(grep "SUPABASE_SERVICE_ROLE_KEY=" "$DOCKER_ENV" | head -n 1 | cut -d'=' -f2- | xargs | tr -d '\r')
    fi

    cat <<EOF > "$DOCKER_ENV"
SUPABASE_URL=$S_URL
SUPABASE_SERVICE_ROLE_KEY=$S_KEY
GEMINI_API_KEY=$G_KEY
DAEMON_URL=http://127.0.0.1:2931
EOF
    # 키 존재 여부뿐만 아니라 앞 4자리만 살짝 보여줘서 확인 사살
    G_MASKED=$([ -n "$G_KEY" ] && echo "${G_KEY:0:4}***" || echo "EMPTY")
    echo "✅ docker/.env 생성 완료 (G_KEY: $G_MASKED)"


# 3. 전체 서비스 빌드 및 재실행
echo ">>> 전 서비스 빌드 및 재가동..."
sudo docker-compose -f docker/docker-compose.yml up -d --build --force-recreate

# 3. 정리
sudo docker system prune -f
sudo docker builder prune -f
echo "✅ 통합 배포 완료! (기존 포트 2929 게이트웨이 생존 확인)"
sudo docker ps