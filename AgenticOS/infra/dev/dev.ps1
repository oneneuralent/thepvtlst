$ErrorActionPreference = "Stop"

# Kill anything holding our dev ports, then start both services.
& "$PSScriptRoot\\restart.ps1"

$root = Split-Path -Parent $PSScriptRoot

Start-Process -WindowStyle Hidden -WorkingDirectory $root -FilePath "npm" -ArgumentList @("run", "dev:web")
Start-Process -WindowStyle Hidden -WorkingDirectory $root -FilePath "npm" -ArgumentList @("run", "dev:agent")

Write-Output "Dev started:"
Write-Output "- Web: http://localhost:3000/app"
Write-Output "- Agent API: http://127.0.0.1:8001/health"
