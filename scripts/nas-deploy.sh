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

if [ -f "$ENV_FILE" ]; then
    # 더 강력한 패턴 매칭 (이름이 틀려도 AIza... 패턴으로 찾아냄)
    S_URL=$(grep "SUPABASE_URL=" "$ENV_FILE" | head -n 1 | cut -d'=' -f2- | xargs | tr -d '\r')
    S_KEY=$(grep "SUPABASE_SERVICE_ROLE_KEY=" "$ENV_FILE" | head -n 1 | cut -d'=' -f2- | xargs | tr -d '\r')
    G_KEY=$(grep -E "(GEMINI_API_KEY|AIza)" "$ENV_FILE" | grep "=" | head -n 1 | cut -d'=' -f2- | xargs | tr -d '\r')
    
    cat <<EOF > "$DOCKER_ENV"
SUPABASE_URL=$S_URL
SUPABASE_SERVICE_ROLE_KEY=$S_KEY
GEMINI_API_KEY=$G_KEY
DAEMON_URL=http://127.0.0.1:2931
EOF
    # 키 존재 여부뿐만 아니라 앞 4자리만 살짝 보여줘서 확인 사살
    G_MASKED=$([ -n "$G_KEY" ] && echo "${G_KEY:0:4}***" || echo "EMPTY")
    echo "✅ docker/.env 생성 완료 (G_KEY: $G_MASKED)"
else
    echo "⚠️ web/.env.local 파일을 찾을 수 없어 기존 설정을 유지합니다."
fi

# 3. 전체 서비스 빌드 및 재실행
echo ">>> 전 서비스 빌드 및 재가동..."
sudo docker-compose -f docker/docker-compose.yml up -d --build --force-recreate

# 3. 정리
sudo docker system prune -f
sudo docker builder prune -f
echo "✅ 통합 배포 완료! (기존 포트 2929 게이트웨이 생존 확인)"
sudo docker ps