#!/bin/sh
# Stops the demo server started by start.sh, using the PID recorded in
# pid.txt instead of hunting for the port/PID by hand.
set -eu

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$REPO_ROOT/pid.txt"

if [ ! -f "$PID_FILE" ]; then
  echo "pid.txt not found - is the server running? (start it with start.sh)" >&2
  exit 1
fi

SERVER_PID="$(cat "$PID_FILE")"
if kill -0 "$SERVER_PID" 2>/dev/null; then
  kill "$SERVER_PID"
  echo "Stopped server (PID $SERVER_PID)"
else
  echo "No process with PID $SERVER_PID was running (stale pid.txt)"
fi

rm "$PID_FILE"
