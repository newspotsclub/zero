#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB_ENV_FILE="$ROOT_DIR/.env.local"

if [[ ! -f "$DB_ENV_FILE" ]]; then
  echo "Missing .env.local."
  exit 1
fi

set -a
source "$DB_ENV_FILE"
set +a

if [[ -z "${SUPABASE_STAGING_DATABASE_URL:-}" ]]; then
  echo "Missing SUPABASE_STAGING_DATABASE_URL in .env.local"
  exit 1
fi

echo "Checking staging DB schema..."
DATABASE_URL="$SUPABASE_STAGING_DATABASE_URL" node "$ROOT_DIR/scripts/verify-db.mjs"
echo "Staging DB check passed."
