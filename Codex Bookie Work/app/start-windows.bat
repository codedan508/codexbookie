@echo off
cd /d "%~dp0"
echo Starting Codex Bookie on http://localhost:2010 ...
node src\server.js
pause
