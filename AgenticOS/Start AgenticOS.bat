@echo off
setlocal
cd /d "%~dp0"
echo Starting AgenticOS...
echo.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File ".\infra\dev\dev.ps1"
echo.
echo AgenticOS start command finished. You can close this window.
pause
