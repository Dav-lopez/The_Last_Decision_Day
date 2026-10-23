# Windows PowerShell smoke test. Run from the repository root.
param([string]$BaseUrl = 'http://localhost:8080')
$ErrorActionPreference = 'Stop'
$failed = $false
function Test-Endpoint([string]$Name, [int]$Expected, [string]$Path, [string]$Method = 'GET') {
    $actual = & curl.exe --silent --output NUL --write-out '%{http_code}' --retry 12 --retry-connrefused --retry-delay 2 --max-time 10 --request $Method "$BaseUrl$Path"
    if ($LASTEXITCODE -ne 0) { $actual = '000' }
    if ($actual -eq "$Expected") { Write-Host "PASS $Name ($actual)" }
    else { Write-Error "FAIL $Name (expected $Expected, got $actual)" -ErrorAction Continue; $script:failed = $true }
}
Test-Endpoint 'web index' 200 '/'
Test-Endpoint 'SPA fallback' 200 '/game/unknown-route'
Test-Endpoint 'API liveness' 200 '/api/v1/health/live'
Test-Endpoint 'API readiness before migration' 503 '/api/v1/health/ready'
Test-Endpoint 'SignalR negotiate' 200 '/hubs/world/negotiate?negotiateVersion=1' 'POST'
if ($failed) { exit 1 }
