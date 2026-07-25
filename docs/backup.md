# Backup & Rollback

## Backup

### Manual
```bash
# MongoDB
mongodump --uri="$MONGO_URI" --out="./backups/mongodump_$(date +%Y%m%d_%H%M%S)"

# PostgreSQL
pg_dump "$DATABASE_URL" | gzip > "./backups/postgres_$(date +%Y%m%d_%H%M%S).sql.gz"

# .env
cp .env "./backups/env_$(date +%Y%m%d_%H%M%S).txt"
```

### Script
```bash
# Linux VPS
bash scripts/backup.sh

# Windows
.\scripts\backup.ps1
```

Config via env: `BACKUP_DIR` (default `./backups`), `RETENTION_DAYS` (default `7`).

### Cron (Linux VPS)
```cron
0 3 * * * cd /path/to/paperplane && bash scripts/backup.sh >> logs/backup.log 2>&1
```

## Rollback

### Step-by-step
```bash
# 1. Backup current state (just in case)
bash scripts/backup.sh

# 2. Revert code
git revert HEAD --no-edit
# or to a specific tag:
# git reset --hard v3.0.0

# 3. Rebuild
npm run build

# 4. Restart
pm2 restart paperplane

# 5. Verify
curl http://localhost:3001/api/health
# Expected: {"success":true,"data":{"status":"ok"}}
```

### Restore from backup
```bash
# MongoDB
mongorestore --uri="$MONGO_URI" --dir="./backups/mongodump_20250725_120000"

# PostgreSQL
gunzip -c "./backups/postgres_20250725_120000.sql.gz" | psql "$DATABASE_URL"

# Then restart:
pm2 restart paperplane
```

### Verify playback
```bash
curl http://localhost:3001/api/health
# Check: guilds > 0, database "connected", lavalink connectedNodes > 0
```
