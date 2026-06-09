@echo off
setlocal
cd /d "%~dp0"
set "APP_URL=http://localhost:3003"
set "BUNDLED_NODE=C:\Users\ocdtr\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if exist "%BUNDLED_NODE%" (
  set "NODE_CMD=%BUNDLED_NODE%"
) else (
  where node >nul 2>nul
  if %errorlevel%==0 (
    set "NODE_CMD=node"
  ) else (
    echo Node.js was not found.
    pause
    exit /b 1
  )
)

echo Starting BOT DESTROYER...
echo.
echo This app reads credentials from the local credential setup folder.
echo LIVE_TRADING_ENABLED must be true in .env before real orders can be placed.
echo Leave this window open while the trader is running.
echo.

start "" "%APP_URL%"
"%NODE_CMD%" server.js

echo.
echo BOT DESTROYER stopped.
pause
