# PowerShell wrapper for balancing test
Write-Host "Запуск тестування балансування..." -ForegroundColor Cyan
node (Join-Path $PSScriptRoot "test-balancing.js") $args
