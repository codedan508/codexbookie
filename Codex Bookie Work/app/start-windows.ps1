$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

Write-Host "Starting Codex Bookie on http://localhost:2010 ..."
node src/server.js
