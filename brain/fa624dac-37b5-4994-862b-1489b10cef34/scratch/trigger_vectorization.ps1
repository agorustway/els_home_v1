$backendUrl = "https://elssolution.synology.me:8443/api/vectorize/nas"
$unlockUrl = "https://elssolution.synology.me:8443/api/vectorize/nas/unlock"

$targets = @(
    @{ dir = "/app/volume1/서울본사"; branch = "본사" },
    @{ dir = "/app/volume2/아산지점"; branch = "아산" },
    @{ dir = "/app/volume2/당진지점"; branch = "당진" },
    @{ dir = "/app/volume2/서산지점"; branch = "서산" },
    @{ dir = "/app/volume2/울산지점"; branch = "울산" },
    @{ dir = "/app/volume2/중부지점"; branch = "중부" },
    @{ dir = "/app/volume2/예산지점"; branch = "예산" },
    @{ dir = "/app/volume2/영천지점"; branch = "영천" },
    @{ dir = "/app/volume2/임고지점"; branch = "임고" }
)

Write-Host "🔓 기존 락 해제 시도..."
Invoke-RestMethod -Method Post -Uri $unlockUrl -ContentType "application/json"

foreach ($t in $targets) {
    $dir = $t.dir
    $branch = $t.branch
    Write-Host "▶️ [$branch] 작업 요청 중... ($dir)"
    
    while ($true) {
        try {
            $body = @{ directory = $dir; branch = $branch } | ConvertTo-Json
            $response = Invoke-WebRequest -Method Post -Uri $backendUrl -Body $body -ContentType "application/json"
            
            if ($response.StatusCode -eq 202) {
                Write-Host "✅ [$branch] 백그라운드 작업 시작됨. 완료될 때까지 대기 중..."
                # 백그라운드 작업이 완료되었는지 확인할 명확한 API가 없으므로, 
                # 다음 지점 요청 시 429가 안 뜰 때까지 기다리는 방식으로 진행
                break
            }
        } catch {
            $statusCode = $_.Exception.Response.StatusCode.value__
            if ($statusCode -eq 429) {
                Write-Host "⏳ [$branch] 다른 지점이 작업 중입니다. 30초 후 재시도..."
                Start-Sleep -Seconds 30
            } else {
                Write-Host "❌ [$branch] 에러 발생: $_"
                break
            }
        }
    }
    
    # 락이 풀릴 때까지 대기 (다음 루프의 trigger가 성공할 때까지 기다림)
    Start-Sleep -Seconds 10
}

Write-Host "🎉 모든 지점 벡터화 요청 완료!"
