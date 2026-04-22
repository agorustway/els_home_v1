#!/bin/bash
# NAS 전 지점 라우팅 및 벡터화 순차 실행 스크립트

echo "🚀 NAS 지점별 벡터화 작업 순차 실행을 시작합니다..."
echo "로그 확인: sudo docker logs -f els-core"
echo "---------------------------------------------------"

# 실행할 지점 목록 (디렉토리와 지점명)
declare -A TARGETS=(
    ["/app/volume1/서울본사"]="본사"
    ["/app/volume2/아산지점"]="아산"
    ["/app/volume2/당진지점"]="당진"
    ["/app/volume2/서산지점"]="서산"
    ["/app/volume2/울산지점"]="울산"
    ["/app/volume2/중부지점"]="중부"
    ["/app/volume2/예산지점"]="예산"
    ["/app/volume2/영천지점"]="영천"
    ["/app/volume2/영천업무파일"]="영천"
    ["/app/volume2/임고지점"]="임고"
)

# 순서 보장을 위해 키보드 배열을 순차적으로 지정
ORDER=(
    "/app/volume1/서울본사"
    "/app/volume2/아산지점"
    "/app/volume2/당진지점"
    "/app/volume2/서산지점"
    "/app/volume2/울산지점"
    "/app/volume2/중부지점"
    "/app/volume2/예산지점"
    "/app/volume2/영천지점"
    "/app/volume2/영천업무파일"
    "/app/volume2/임고지점"
)

# 0. 시작 전 기존 작업 강제 잠금 해제 (Zombie Lock 방지)
echo "🔓 기존 작업 잠금 해제를 시도합니다..."
curl -s -X POST http://127.0.0.1:2930/api/vectorize/nas/unlock
echo ""

for DIR in "${ORDER[@]}"; do
    BRANCH="${TARGETS[$DIR]}"
    echo "▶️ [$BRANCH] 작업 시작 (경로: $DIR)..."
    
    RETRY_COUNT=0
    while true; do
        # curl 수행 (타임아웃 300초로 대폭 연장)
        RESPONSE=$(curl -s -m 300 -w "\n%{http_code}" -X POST http://127.0.0.1:2930/api/vectorize/nas \
          -H "Content-Type: application/json" \
          -d "{\"directory\": \"$DIR\", \"branch\": \"$BRANCH\"}")
        
        HTTP_STATUS=$(echo "$RESPONSE" | tail -n 1)
        BODY=$(echo "$RESPONSE" | head -n -1)
        
        if [ "$HTTP_STATUS" -eq 202 ]; then
            echo "✅ [$BRANCH] 백그라운드 작업 시작됨"
            echo "💡 다음 지점 실행을 위해 작업 완료를 기다립니다..."
            break
        elif [ "$HTTP_STATUS" -eq 429 ]; then
            echo "⏳ [$BRANCH] 다른 지점이 작업 중입니다. 60초 후 재시도... ($BODY)"
            sleep 60
        elif [ "$HTTP_STATUS" -eq 000 ]; then
            RETRY_COUNT=$((RETRY_COUNT+1))
            if [ $RETRY_COUNT -gt 3 ]; then
                echo "❌ [$BRANCH] 서버 응답 없음 (연속 3회). 서버 상태를 확인하세요."
                break
            fi
            echo "⚠️ [$BRANCH] 서버 응답 없음. 10초 후 재시도... (시도 $RETRY_COUNT/3)"
            sleep 10
        else
            echo "❌ [$BRANCH] 기타 오류 발생 (HTTP $HTTP_STATUS): $BODY"
            break
        fi
    done
    
    # 지점 내 완료까지 기다리는 로직 (백그라운드에서 돌기 때문에 임의로 충분히 쉼)
    # 실제로는 락이 풀릴 때까지 위 루프에서 429로 기다리게 됨
    sleep 10
done

echo "🎉 모든 지점 벡터화 스크립트 실행 완료!"
