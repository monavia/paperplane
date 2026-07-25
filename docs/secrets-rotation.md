# Secrets Rotation

## Discord Token
1. Generate new token at [Discord Developer Portal](https://discord.com/developers/applications)
2. Update `DISCORD_TOKEN` in `.env`
3. `pm2 restart paperplane`
4. Verify bot online — old token invalidated by Discord after ~1h or on next reconnect
5. Revoke old token from developer portal

**Zero-downtime:** Not possible — Discord rejects duplicate login. Expect ~5s downtime during restart.

## AI API Key (OpenRouter)
1. Generate new key at [OpenRouter Keys](https://openrouter.ai/keys)
2. Update `AI_API_KEY` in `.env`
3. `pm2 reload paperplane` (graceful — waits for active AI tasks to finish)
4. Revoke old key

## Redis Password
1. Update `requirepass` in `docker-compose.yml` (Redis service)
2. `docker compose restart redis`
3. Update `REDIS_URL` in `.env` with new password
4. `pm2 restart paperplane`

**⚠️** Redis restart clears all cache. Bot re-warms cache on demand.

## MongoDB Credentials
1. Update MongoDB user password
2. Update `MONGO_URI` in `.env`
3. `pm2 restart paperplane`

**Zero-downtime** if using MongoDB replica set with auth — connection pool auto-refreshes. On single-node, expect ~2s reconnect.

## Rotation Checklist
- [ ] Update `.env` on VPS
- [ ] Update `.env.example` in repo (if new var added)
- [ ] Restart bot (`pm2 reload` recommended over `restart`)
- [ ] Verify health: `curl http://localhost:3001/api/health`
- [ ] Revoke old credential
- [ ] Log rotation in `CHANGELOG.md`
