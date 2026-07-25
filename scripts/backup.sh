#!/bin/bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS="${RETENTION_DAYS:-7}"

mkdir -p "$BACKUP_DIR"

echo "[backup] Starting backup at $TIMESTAMP"

# MongoDB
if command -v mongodump &>/dev/null; then
  MONGO_URI="${MONGO_URI:-mongodb://localhost:27017/paperplane}"
  echo "[backup] MongoDB dump..."
  mongodump --uri="$MONGO_URI" --out="$BACKUP_DIR/mongodump_$TIMESTAMP" --quiet
  tar czf "$BACKUP_DIR/mongodb_$TIMESTAMP.tar.gz" -C "$BACKUP_DIR" "mongodump_$TIMESTAMP"
  rm -rf "$BACKUP_DIR/mongodump_$TIMESTAMP"
  echo "[backup] MongoDB dump: $BACKUP_DIR/mongodb_$TIMESTAMP.tar.gz"
else
  echo "[backup] mongodump not found — skipping MongoDB"
fi

# PostgreSQL (Prisma)
if command -v pg_dump &>/dev/null && [ -n "${DATABASE_URL:-}" ]; then
  echo "[backup] PostgreSQL dump..."
  PGPASSWORD=$(echo "$DATABASE_URL" | sed -n 's/.*:\([^@]*\)@.*/\1/p')
  PGHOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\).*/\1/p')
  PGUSER=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
  PGDATABASE=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\)/\1/p')
  pg_dump -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" > "$BACKUP_DIR/postgres_$TIMESTAMP.sql"
  gzip "$BACKUP_DIR/postgres_$TIMESTAMP.sql"
  echo "[backup] PostgreSQL dump: $BACKUP_DIR/postgres_$TIMESTAMP.sql.gz"
else
  echo "[backup] pg_dump not found or DATABASE_URL not set — skipping PostgreSQL"
fi

# .env
if [ -f .env ]; then
  cp .env "$BACKUP_DIR/env_$TIMESTAMP.txt"
  echo "[backup] .env: $BACKUP_DIR/env_$TIMESTAMP.txt"
fi

# Prune old backups
find "$BACKUP_DIR" -name "mongodb_*.tar.gz" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "postgres_*.sql.gz" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "env_*.txt" -mtime +$RETENTION_DAYS -delete

echo "[backup] Done. Pruned backups older than $RETENTION_DAYS days."
