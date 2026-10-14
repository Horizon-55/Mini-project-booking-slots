# PowerShell wrapper for failover simulation test
Write-Host "Запуск тесту відмовостійкості (Failover)..." -ForegroundColor Yellow
node (Join-Path $PSScriptRoot "test-failover.js") $args
