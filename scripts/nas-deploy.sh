#!/bin/bash
# [v4.5.2] ELS Unified (Bot + Core + Gateway) 전체 배포 스크립트
set -e
cd "$(dirname "$0")/.."
echo "--- 🚀 ELS 통합 백엔드 전체 재배포 시작 ---"

DOCKER_BIN="${DOCKER_BIN:-/usr/local/bin/docker}"
COMPOSE_BIN="${COMPOSE_BIN:-/usr/local/bin/docker-compose}"
SUDO_BIN="${SUDO_BIN:-sudo -n}"
DOCKER_PATH="${DOCKER_PATH:-/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}}"
export COMPOSE_HTTP_TIMEOUT="${COMPOSE_HTTP_TIMEOUT:-600}"
export DOCKER_CLIENT_TIMEOUT="${DOCKER_CLIENT_TIMEOUT:-600}"

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
echo ">>> 전 서비스 이미지 빌드..."
$SUDO_BIN PATH="$DOCKER_PATH" "$COMPOSE_BIN" -f docker/docker-compose.yml build

# docker-compose v1 + container_name 조합에서 recreate rename이 꼬이는 경우가 있어
# 빌드를 먼저 끝낸 뒤 기존 고정 이름 컨테이너만 제거하고 --no-build로 재기동한다.
echo ">>> 기존 고정 이름 컨테이너 정리..."
for NAME in els-gateway els-core els-bot; do
    if $SUDO_BIN PATH="$DOCKER_PATH" "$DOCKER_BIN" container inspect "$NAME" >/dev/null 2>&1; then
        echo " - remove $NAME"
        $SUDO_BIN PATH="$DOCKER_PATH" "$DOCKER_BIN" rm -f "$NAME"
    fi
done

echo ">>> 전 서비스 재가동..."
$SUDO_BIN PATH="$DOCKER_PATH" "$COMPOSE_BIN" -f docker/docker-compose.yml up -d --no-build --force-recreate --remove-orphans

# 4. 정리
$SUDO_BIN PATH="$DOCKER_PATH" "$DOCKER_BIN" system prune -f
$SUDO_BIN PATH="$DOCKER_PATH" "$DOCKER_BIN" builder prune -f
echo "✅ 통합 배포 완료! (기존 포트 2929 게이트웨이 생존 확인)"
$SUDO_BIN PATH="$DOCKER_PATH" "$DOCKER_BIN" ps
