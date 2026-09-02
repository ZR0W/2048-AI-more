#!/bin/sh
# Starts the demo with Python's built-in static file server and records
# its PID to pid.txt, so stop.sh can shut it down without hunting for the
# port/PID by hand.
set -eu

PORT="${1:-8000}"
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$REPO_ROOT/pid.txt"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Server already running (PID $(cat "$PID_FILE"), see pid.txt). Run stop.sh first." >&2
  exit 1
fi

cd "$REPO_ROOT"
python -m http.server "$PORT" >/dev/null 2>&1 &
echo $! > "$PID_FILE"

echo "Started on http://localhost:$PORT (PID $(cat "$PID_FILE"), recorded in pid.txt)"
