# BUILD & RUN: OneShot with Gemma 7B

## For You (Developer)

### Build Image (8-12 min)
```bash
cd D:\oneshot_e2e
docker build --no-cache --pull -f Dockerfile.gemma -t oneshot:gemma-latest .
```

### Test Image
```bash
docker-compose -f docker-compose.gemma.yml up -d
# Wait for: "[SUCCESS] OneShot Ready!"
# Open: http://localhost:8787
# Token: oneshot-default-token-please-change-me
```

### Stop & Clean
```bash
docker-compose -f docker-compose.gemma.yml down
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
docker-compose -f docker-compose.gemma.yml up -d
```

### Use
1. Open http://localhost:8787
2. Login with token
3. Submit research workflow
4. Gemma 7B runs locally, no API needed

### Optional: Use Cloud Instead
Edit `.env`:
```
ONESHOT_RESEARCH_PROVIDER=featherless
FEATHERLESS_API_KEY=your_key
```

Restart:
```bash
docker-compose -f docker-compose.gemma.yml restart
```

---

## What Users Get

✅ Local Gemma 7B chat/research (ready to use)  
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
- Ollama runtime
- Gemma 7B model (pre-loaded)
- Smart startup script

---

## System Requirements

**Minimum:**
- 4GB RAM for Gemma 7B
- 2 CPU cores
- 10GB disk (5GB model + runtime)
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
| Dockerfile.gemma | Build image with Ollama + Gemma |
| docker-compose.gemma.yml | One-command deployment |
| app/env/.env.gemma.example | Config template for users |
| scripts/docker-entrypoint-gemma.sh | Startup logic |
| GEMMA_IMAGE_GUIDE.md | Full documentation |

---

## Next Action

Run build command above →

Wait for completion →

Test with docker-compose →

Share image (docker save) or push to registry →

Users run docker-compose →

Done! ✅
