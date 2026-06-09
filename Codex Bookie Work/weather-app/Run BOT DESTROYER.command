#!/bin/zsh
set -e

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node 18 or newer from https://nodejs.org/ and run this again."
  read "?Press Return to close."
  exit 1
fi

if [ ! -d node_modules ]; then
  npm install
fi

export PORT="${PORT:-3003}"
export NO_OPEN="${NO_OPEN:-0}"
node server.js
