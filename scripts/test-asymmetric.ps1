# PowerShell wrapper for asymmetric workload test
Write-Host "Запуск тесту асиметричного навантаження..." -ForegroundColor Magenta
node (Join-Path $PSScriptRoot "test-asymmetric.js") $args
