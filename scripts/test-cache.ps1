# PowerShell wrapper for Redis Cache demonstration test
Write-Host "Запуск тесту розподіленого кешування (Redis Cache-Aside)..." -ForegroundColor Green
node (Join-Path $PSScriptRoot "test-cache.js") $args
