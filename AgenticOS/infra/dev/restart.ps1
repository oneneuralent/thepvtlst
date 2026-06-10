$ErrorActionPreference = "Stop"

function Stop-PortProcess {
  param([Parameter(Mandatory = $true)][int]$Port)
  $conns = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
  if (-not $conns) { return }
  $processIds = $conns | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $processIds) {
    if (-not $processId) { continue }
    Stop-ProcessTree -ProcessId $processId
  }
}

function Stop-ProcessTree {
  param([Parameter(Mandatory = $true)][int]$ProcessId)
  $children = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ParentProcessId -eq $ProcessId }

  foreach ($child in $children) {
    Stop-ProcessTree -ProcessId $child.ProcessId
  }

  try { Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue } catch {}
}

function Stop-AgentApiDevProcesses {
  $matches = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -and (
        $_.CommandLine -match "uvicorn app\.main:app" -or
        $_.CommandLine -match "run dev:agent" -or
        $_.CommandLine -match "multiprocessing\.spawn"
      )
    } |
    Select-Object -ExpandProperty ProcessId -Unique

  foreach ($processId in $matches) {
    Stop-ProcessTree -ProcessId $processId
  }
}

Stop-AgentApiDevProcesses
Stop-PortProcess -Port 3000
Stop-PortProcess -Port 8001

Write-Output "Ports 3000 and 8001 cleared."
