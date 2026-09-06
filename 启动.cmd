@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  set "AFTER_HOURS_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
) else (
  set "AFTER_HOURS_NODE=node.exe"
)
"%AFTER_HOURS_NODE%" scripts\start.mjs
if errorlevel 1 pause
endlocal
