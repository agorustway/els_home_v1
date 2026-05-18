#!/bin/bash
# ELS Core-only deploy script. Rebuilds/recreates els-core without touching bot/gateway.
set -e

cd "$(dirname "$0")/.."
echo "--- ELS Core deploy start ---"

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

# 3. Rebuild/recreate only els-core. Bot service stays up.
echo ">>> Rebuild and recreate els-core..."
$SUDO_BIN PATH="$DOCKER_PATH" "$COMPOSE_BIN" -f docker/docker-compose.yml up -d --build --force-recreate els-core

# 4. Cleanup and show a bounded log tail.
$SUDO_BIN PATH="$DOCKER_PATH" "$DOCKER_BIN" system prune -f
$SUDO_BIN PATH="$DOCKER_PATH" "$DOCKER_BIN" builder prune -f
echo "Core deploy complete. Recent els-core logs:"
$SUDO_BIN PATH="$DOCKER_PATH" "$DOCKER_BIN" logs els-core --tail 80
