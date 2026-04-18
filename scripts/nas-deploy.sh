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
    # 주요 키값들만 추출 (주석 제외)
    S_URL=$(grep "^NEXT_PUBLIC_SUPABASE_URL=" "$ENV_FILE" | cut -d'=' -f2-)
    S_KEY=$(grep "^SUPABASE_SERVICE_ROLE_KEY=" "$ENV_FILE" | cut -d'=' -f2-)
    G_KEY=$(grep "^GEMINI_API_KEY=" "$ENV_FILE" | cut -d'=' -f2-)
    
    cat <<EOF > "$DOCKER_ENV"
SUPABASE_URL=$S_URL
SUPABASE_SERVICE_ROLE_KEY=$S_KEY
GEMINI_API_KEY=$G_KEY
DAEMON_URL=http://127.0.0.1:31999
EOF
    echo "✅ docker/.env 생성 완료"
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