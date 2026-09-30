#!/bin/sh
set -eu

psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=temporal_user="${TEMPORAL_POSTGRES_USER:-temporal}" \
  --set=temporal_password="${TEMPORAL_POSTGRES_PASSWORD:-temporal_local}" <<'SQL'
SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L CREATEDB',
  :'temporal_user',
  :'temporal_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'temporal_user')\gexec
SQL
