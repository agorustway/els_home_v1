$backendUrl = "https://elssolution.synology.me:8443/api/vectorize/nas"
$unlockUrl = "https://elssolution.synology.me:8443/api/vectorize/nas/unlock"

$targets = @(
    @{ dir = "/app/volume1/서울본사"; branch = "본사" },
    @{ dir = "/app/volume2/아산지점"; branch = "아산" },
    @{ dir = "/app/volume2/당진지점"; branch = "당진" },
    @{ dir = "/app/volume2/중부지점"; branch = "중부" },
    @{ dir = "/app/volume2/예산지점"; branch = "예산" }
)

Write-Host "🔓 기존 락 해제 시도..."
try {
    Invoke-RestMethod -Method Post -Uri $unlockUrl -ContentType "application/json"
    Write-Host "✅ 락 해제 성공"
} catch {
    Write-Host "⚠️ 락 해제 실패(무시): $_"
}

foreach ($t in $targets) {
    $dir = $t.dir
    $branch = $t.branch
    Write-Host "▶️ [$branch] 작업 요청 중... ($dir)"
    
    while ($true) {
        try {
            $body = @{ directory = $dir; branch = $branch } | ConvertTo-Json -Compress
            $response = Invoke-WebRequest -Method Post -Uri $backendUrl -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -ContentType "application/json"
            
            if ($response.StatusCode -eq 202) {
                Write-Host "✅ [$branch] 백그라운드 작업 시작됨. 락이 풀릴 때까지 기다립니다..."
                break
            }
        } catch {
            $statusCode = $_.Exception.Response.StatusCode.value__
            if ($statusCode -eq 429) {
                Write-Host "⏳ [$branch] 다른 지점이 작업 중입니다. 60초 후 재시도..."
                Start-Sleep -Seconds 60
            } else {
                Write-Host "❌ [$branch] 에러 발생: $_"
                break
            }
        }
    }
    
    Start-Sleep -Seconds 10
}

Write-Host "🎉 모든 지점 벡터화 요청 완료!"
