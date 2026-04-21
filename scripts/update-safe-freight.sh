#!/bin/bash
# ELS Safety Freight Data Update & Push Script (for NAS)

echo "--------------------------------------------------"
echo "🚀 안전운임(Safe Freight) 데이터 빌드 및 배포 시작"
echo "--------------------------------------------------"

# 1. 이동
cd /volume1/docker/els_home_v1/web

# 2. 데이터 빌드
echo "[1/3] 엑셀 데이터 추출 중..."
node scripts/build-safe-freight-data.js

if [ $? -eq 0 ]; then
    echo "✅ 데이터 빌드 성공!"
else
    echo "❌ 데이터 빌드 실패. 엑셀 파일을 확인하세요."
    exit 1
fi

# 3. 깃허브 업로드
echo "[2/3] 깃허브 커밋 준비..."
cd /volume1/docker/els_home_v1
git add web/public/data/safe-freight.json
git commit -m "[Auto] Sync safety freight data from NAS ($(date +'%Y-%m-%d %H:%M:%S'))"

echo "[3/3] 깃허브 푸시 (Vercel 배포 트리거)..."
git push

if [ $? -eq 0 ]; then
    echo "--------------------------------------------------"
    echo "✅ 모든 작업이 완료되었습니다! (5분 뒤 웹에서 확인 가능)"
    echo "--------------------------------------------------"
else
    echo "❌ 깃허브 푸시 실패. (토큰 만료 여부를 확인하세요)"
    echo "명령어: git remote set-url origin https://<USER>:<TOKEN>@github.com/agorustway/els_home_v1.git"
    exit 1
fi
