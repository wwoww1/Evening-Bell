@echo off
setlocal
cd /d "%~dp0"
set "EVENING_BELL_NODE="
for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined EVENING_BELL_NODE set "EVENING_BELL_NODE=%%N"
if not defined EVENING_BELL_NODE if exist "%ProgramFiles%\nodejs\node.exe" set "EVENING_BELL_NODE=%ProgramFiles%\nodejs\node.exe"
if not defined EVENING_BELL_NODE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "EVENING_BELL_NODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined EVENING_BELL_NODE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "EVENING_BELL_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined EVENING_BELL_NODE (
  echo Node.js was not found. Install Node.js 24 LTS from https://nodejs.org/
  echo Then reopen this launcher. Press any key to close.
  pause
  exit /b 1
)
for %%N in ("%EVENING_BELL_NODE%") do set "PATH=%%~dpN;%PATH%"
"%EVENING_BELL_NODE%" "%~dp0scripts\start.mjs"
set "EVENING_BELL_EXIT_CODE=%errorlevel%"
if not "%EVENING_BELL_EXIT_CODE%"=="0" (
  echo.
  echo Startup failed. Read the error above. Press any key to close.
  pause
)
exit /b %EVENING_BELL_EXIT_CODE%
