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
    ["/app/volume2/자료실"]="자료실"
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
    "/app/volume2/자료실"
)

for DIR in "${ORDER[@]}"; do
    BRANCH="${TARGETS[$DIR]}"
    echo "▶️ [$BRANCH] 작업 시작 (경로: $DIR)..."
    
    # curl 수행 (타임아웃 없이 끝날 때까지 대기)
    RESPONSE=$(curl -s -X POST http://127.0.0.1:2930/api/vectorize/nas \
      -H "Content-Type: application/json" \
      -d "{\"directory\": \"$DIR\", \"branch\": \"$BRANCH\"}")
      
    echo "✅ [$BRANCH] 완료: $RESPONSE"
    echo "---------------------------------------------------"
    
    # API 호출 제한(Rate Limit) 방지 및 서버 휴식을 위해 5초 대기
    sleep 5
done

echo "🎉 모든 지점 벡터화 스크립트 실행 완료!"
