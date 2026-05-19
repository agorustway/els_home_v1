#!/bin/bash
# ELS Bot-only deploy script. Rebuilds/recreates els-bot without touching core/gateway.
set -e

cd "$(dirname "$0")/.."
echo "--- ELS Bot deploy start (expected: 30-40 min on cold build) ---"

DOCKER_BIN="${DOCKER_BIN:-/usr/local/bin/docker}"
COMPOSE_BIN="${COMPOSE_BIN:-/usr/local/bin/docker-compose}"
SUDO_BIN="${SUDO_BIN:-sudo -n}"
DOCKER_PATH="${DOCKER_PATH:-/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}}"
export COMPOSE_HTTP_TIMEOUT="${COMPOSE_HTTP_TIMEOUT:-600}"
export DOCKER_CLIENT_TIMEOUT="${DOCKER_CLIENT_TIMEOUT:-600}"

# 1. Sync source from origin/main.
/opt/bin/git fetch origin main
/opt/bin/git reset --hard origin/main

# 2. Sync env values from web/.env.local to docker/.env.
echo ">>> Sync docker/.env..."
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
    echo "docker/.env synced (GEMINI_API_KEY: $([ -n "$G_KEY" ] && echo "YES" || echo "NO"))"
fi

# 3. Build first, then remove the fixed-name container before recreate.
# docker-compose v1 can fail with "Renaming a container with the same name" when container_name is fixed.
echo ">>> Build els-bot image..."
$SUDO_BIN PATH="$DOCKER_PATH" "$COMPOSE_BIN" -f docker/docker-compose.yml build els-bot

echo ">>> Remove existing els-bot container..."
if $SUDO_BIN PATH="$DOCKER_PATH" "$DOCKER_BIN" container inspect els-bot >/dev/null 2>&1; then
    $SUDO_BIN PATH="$DOCKER_PATH" "$DOCKER_BIN" rm -f els-bot
fi

echo ">>> Recreate els-bot..."
$SUDO_BIN PATH="$DOCKER_PATH" "$COMPOSE_BIN" -f docker/docker-compose.yml up -d --no-build --force-recreate els-bot

# 4. Cleanup and show a bounded log tail.
$SUDO_BIN PATH="$DOCKER_PATH" "$DOCKER_BIN" system prune -f
$SUDO_BIN PATH="$DOCKER_PATH" "$DOCKER_BIN" builder prune -f
echo "Bot deploy complete. Recent els-bot logs:"
$SUDO_BIN PATH="$DOCKER_PATH" "$DOCKER_BIN" logs els-bot --tail 80
