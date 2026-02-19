#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB_ENV_FILE="$ROOT_DIR/.env.local"

if [[ -f "$DB_ENV_FILE" ]]; then
  set -a
  source "$DB_ENV_FILE"
  set +a
fi

TARGET="${1:-}"

if [[ "$TARGET" != "staging" && "$TARGET" != "production" ]]; then
  echo "Usage: bash scripts/supabase-promote.sh <staging|production>"
  exit 1
fi

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "Missing SUPABASE_ACCESS_TOKEN"
  exit 1
fi

if [[ "$TARGET" == "staging" ]]; then
  PROJECT_REF="${SUPABASE_STAGING_PROJECT_REF:-}"
else
  PROJECT_REF="${SUPABASE_PRODUCTION_PROJECT_REF:-}"
fi

if [[ -z "$PROJECT_REF" ]]; then
  echo "Missing project ref for $TARGET target."
  echo "Set SUPABASE_STAGING_PROJECT_REF and SUPABASE_PRODUCTION_PROJECT_REF."
  exit 1
fi

if [[ "$TARGET" == "production" && "${SUPABASE_PROD_CONFIRM:-}" != "YES" ]]; then
  echo "Refusing production push without confirmation."
  echo "Run: SUPABASE_PROD_CONFIRM=YES npm run db:push:production"
  exit 1
fi

echo "Pushing migrations to $TARGET ($PROJECT_REF)..."
npx supabase db push --project-ref "$PROJECT_REF"
echo "Done."
