@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js 24 LTS, then reopen this window.
  pause
  exit /b 1
)
node scripts\start.mjs
if errorlevel 1 pause
endlocal
