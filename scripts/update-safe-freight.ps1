# ELS Safety Freight Data Update & Push Script (for Windows)

Write-Host "--------------------------------------------------" -ForegroundColor Cyan
Write-Host "🚀 안전운임(Safe Freight) 데이터 빌드 및 배포 시작" -ForegroundColor Cyan
Write-Host "--------------------------------------------------" -ForegroundColor Cyan

# 1. 데이터 빌드
Write-Host "[1/3] 엑셀 데이터 추출 중..." -ForegroundColor Yellow
cd web
node scripts/build-safe-freight-data.js

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ 데이터 빌드 성공!" -ForegroundColor Green
} else {
    Write-Host "❌ 데이터 빌드 실패. 엑셀 파일을 확인하세요." -ForegroundColor Red
    exit
}

# 2. 깃허브 업로드
Write-Host "[2/3] 깃허브 커밋 준비..." -ForegroundColor Yellow
cd ..
git add web/public/data/safe-freight.json
git commit -m "[Auto] Sync safety freight data from Windows ($(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))"

# 3. 깃허브 푸시
Write-Host "[3/3] 깃허브 푸시 (Vercel 배포 트리거)..." -ForegroundColor Yellow
git push

if ($LASTEXITCODE -eq 0) {
    Write-Host "--------------------------------------------------" -ForegroundColor Cyan
    Write-Host "✅ 모든 작업이 완료되었습니다! (5분 뒤 웹에서 확인 가능)" -ForegroundColor Green
    Write-Host "--------------------------------------------------" -ForegroundColor Cyan
} else {
    Write-Host "❌ 깃허브 푸시 실패." -ForegroundColor Red
}
