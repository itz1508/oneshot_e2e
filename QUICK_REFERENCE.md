# BUILD & RUN: OneShot with Gemma (Ollama)

## For You (Developer)

### Build Image (8-12 min)
```bash
cd D:\oneshot_e2e
docker build --no-cache --pull -f docker/Dockerfile.gemma -t oneshot:gemma-latest .
```

### Test Image
```bash
docker compose --env-file app/env/.env -f docker/docker-compose.gemma.yml up -d
# Wait for: "[SUCCESS] OneShot Ready!"
# Open: http://localhost:8787
# Token: oneshot-default-token-please-change-me
```

### Stop & Clean
```bash
docker compose --env-file app/env/.env -f docker/docker-compose.gemma.yml down
```

---

## For End Users (Once Shared)

### First Time
```bash
# Load image (if you have .tar file)
docker load -i oneshot-gemma-latest.tar

# Or pull from registry
docker pull your-registry/oneshot:gemma-latest
```

### Run
```bash
docker compose --env-file app/env/.env -f docker/docker-compose.gemma.yml up -d
```

### Use
1. Open http://localhost:8787
2. Login with token
3. Submit research workflow
4. Gemma runs locally via Ollama, no API needed

### Optional: Use Cloud Instead
Edit `.env`:
```
ONESHOT_RESEARCH_PROVIDER=featherless
FEATHERLESS_API_KEY=your_key
```

Restart:
```bash
docker compose --env-file app/env/.env -f docker/docker-compose.gemma.yml restart
```

---

## What Users Get

✅ Local Gemma chat/research (ready to use)  
✅ Web UI for conversations  
✅ Can switch to cloud API anytime  
✅ Deterministic testing mode  
✅ No setup complexity  
✅ Works offline (after first run)  

---

## Image Includes

- Node.js + OneShot backend
- React Web IDE
- Python 3.12 + validation
- Smart startup script (streams Ollama runtime into a volume on first start)
- Gemma models via host cache `.ollama/models` (gemma2:2b default, pulled if missing)

---

## System Requirements

**Minimum:**
- 4GB RAM for Gemma 2 (2.5GB typical for 2B)
- 2 CPU cores
- 10GB disk (Ollama runtime volume + model cache)
- Docker with 6GB allocation

**Recommended:**
- 8GB RAM
- 4 CPU cores
- 20GB disk

---

## Troubleshooting

**First startup slow?**
→ Normal, it's loading Gemma model. Takes 1-2 min.

**Out of memory?**
→ Allocate more RAM: `docker update --memory 8g oneshot`

**Want to use GPU?**
→ Edit docker-compose: Change `OLLAMA_NUM_GPU: 0` to your GPU count

**Want different model?**
→ Edit docker-compose: `OLLAMA_MODEL: gemma:2b` (smaller) or build custom

---

## Files

| File | Purpose |
|------|---------|
| docker/Dockerfile.gemma | Build image with Ollama + Gemma |
| docker/docker-compose.gemma.yml | One-command deployment |
| docker/README.md | Docker configuration overview |
| docker/Dockerfile | Standard (non-Gemma) runtime image |
| app/env/.env.example | Config template for users |
| scripts/docker-entrypoint-gemma.sh | Startup logic |

---

## Next Action

Run build command above →

Wait for completion →

Test with docker-compose →

Share image (docker save) or push to registry →

Users run docker-compose →

Done! ✅
