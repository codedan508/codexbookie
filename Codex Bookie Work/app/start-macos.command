#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "Starting Codex Bookie on http://localhost:2010 ..."
node src/server.js
