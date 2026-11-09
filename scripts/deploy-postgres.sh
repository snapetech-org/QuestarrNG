#!/bin/sh
set -eu

PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$PROJECT_ROOT"

PASSWORD_FILE="$PROJECT_ROOT/.env.postgres"

if [ -L "$PASSWORD_FILE" ]; then
  echo "ERROR: refusing to use a symlink for .env.postgres." >&2
  exit 1
fi

if [ -f "$PASSWORD_FILE" ]; then
  SAVED_PASSWORD=$(sed -n 's/^POSTGRES_PASSWORD=//p' "$PASSWORD_FILE")
  if [ -n "${POSTGRES_PASSWORD:-}" ] && [ "$POSTGRES_PASSWORD" != "$SAVED_PASSWORD" ]; then
    echo "ERROR: POSTGRES_PASSWORD differs from the value persisted in .env.postgres." >&2
    echo "Unset the environment variable or update .env.postgres intentionally before deploying." >&2
    exit 1
  fi
  POSTGRES_PASSWORD=$SAVED_PASSWORD
else
  POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-}
  if [ -z "$POSTGRES_PASSWORD" ] && [ -f "$PROJECT_ROOT/.env" ]; then
    POSTGRES_PASSWORD=$(sed -n 's/^POSTGRES_PASSWORD=//p' "$PROJECT_ROOT/.env")
  fi
  if [ -z "$POSTGRES_PASSWORD" ]; then
    if ! command -v openssl >/dev/null 2>&1; then
      echo "ERROR: openssl is required to generate the PostgreSQL password." >&2
      exit 1
    fi
    POSTGRES_PASSWORD=$(openssl rand -hex 32)
  fi

  case "$POSTGRES_PASSWORD" in
    ''|*[!A-Za-z0-9_-]*)
      echo "ERROR: PostgreSQL password must contain only letters, digits, underscores, or hyphens." >&2
      echo "This keeps it safe to embed in DATABASE_URL." >&2
      exit 1
      ;;
  esac

  TEMP_PASSWORD_FILE=$(umask 077 && mktemp "$PASSWORD_FILE.tmp.XXXXXX")
  trap 'rm -f "$TEMP_PASSWORD_FILE"' EXIT
  trap 'exit 1' HUP INT TERM
  printf 'POSTGRES_PASSWORD=%s\n' "$POSTGRES_PASSWORD" > "$TEMP_PASSWORD_FILE"
  chmod 600 "$TEMP_PASSWORD_FILE"
  mv "$TEMP_PASSWORD_FILE" "$PASSWORD_FILE"
  trap - EXIT HUP INT TERM
fi

case "$POSTGRES_PASSWORD" in
  ''|*[!A-Za-z0-9_-]*)
    echo "ERROR: .env.postgres has no valid URL-safe POSTGRES_PASSWORD." >&2
    exit 1
    ;;
esac

chmod 600 "$PASSWORD_FILE"
unset POSTGRES_PASSWORD

if [ "$#" -eq 0 ]; then
  set -- up -d
fi

if [ -f "$PROJECT_ROOT/.env" ]; then
  exec docker compose --env-file "$PROJECT_ROOT/.env" --env-file "$PASSWORD_FILE" \
    -f docker-compose.postgres.yml "$@"
fi

exec docker compose --env-file "$PASSWORD_FILE" -f docker-compose.postgres.yml "$@"
