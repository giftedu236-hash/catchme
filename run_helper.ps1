$ErrorActionPreference = 'Stop'
$projectDirectory = $PSScriptRoot
$runtimeBase = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$pythonPath = Join-Path $runtimeBase 'python\python.exe'
$envFile = Join-Path $projectDirectory '.env.local'
$exampleEnvFile = Join-Path $projectDirectory '.env.example'
$serverFile = Join-Path $projectDirectory 'server.py'

if (-not (Test-Path -LiteralPath $pythonPath)) {
  Write-Host 'Codex Python runtime was not found.' -ForegroundColor Red
  Write-Host 'Open this folder in Codex Desktop, then try again.'
  exit 1
}

if (-not (Test-Path -LiteralPath $envFile)) {
  Copy-Item -LiteralPath $exampleEnvFile -Destination $envFile
  Write-Host '.env.local file was created.' -ForegroundColor Green
  Write-Host 'Paste your two API keys into the file, save it, then run start_local again.'
  Start-Process notepad.exe -ArgumentList ('"{0}"' -f $envFile)
  exit 0
}

Write-Host 'Starting Bada Jikimi Busan at http://localhost:8080' -ForegroundColor Green
Start-Process 'http://localhost:8080'
& $pythonPath $serverFile
