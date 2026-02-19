#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export DOCKER_HOST="unix://${HOME}/.colima/default/docker.sock"

NEXT_PID=""

cleanup() {
  echo ""
  echo "Shutting down..."

  if [[ -n "$NEXT_PID" ]] && kill -0 "$NEXT_PID" 2>/dev/null; then
    kill "$NEXT_PID" 2>/dev/null && wait "$NEXT_PID" 2>/dev/null || true
  fi

  if npx supabase status >/dev/null 2>&1; then
    npx supabase stop >/dev/null 2>&1 || true
  fi

  if colima status >/dev/null 2>&1; then
    colima stop >/dev/null 2>&1 || true
  fi
}

trap cleanup SIGINT SIGTERM

for cmd in colima docker npx node npm; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing dependency: $cmd"
    exit 1
  fi
done

if [[ ! -f "$SCRIPT_DIR/.env.local" ]]; then
  echo "Missing .env.local."
  exit 1
fi

if ! colima status >/dev/null 2>&1; then
  echo "Starting Colima..."
  colima start --cpu 2 --memory 4 --disk 20 >/dev/null 2>&1
fi

if ! npx supabase status >/dev/null 2>&1; then
  echo "Starting local Supabase..."
  npx supabase start -x logflare,vector,imgproxy >/dev/null
fi

echo "Local URLs:"
echo "  App: http://localhost:3000"
echo "  Supabase Studio: http://127.0.0.1:54323"
echo "  Mailpit: http://127.0.0.1:54324"
echo "  Supabase API: http://127.0.0.1:54321"
echo ""

cd "$SCRIPT_DIR"
npm run dev &
NEXT_PID=$!
wait "$NEXT_PID"
