# OneShot Ready-to-Use Image with Gemma

## What's Prepared

✅ **docker/Dockerfile.gemma** - Multi-stage build (app only; Ollama runtime + models load at first startup)
✅ **docker/docker-compose.gemma.yml** - One-command deployment
✅ **app/env/.env.example** - Configuration template
✅ **scripts/docker-entrypoint-gemma.sh** - Smart startup script
✅ **GEMMA_IMAGE_GUIDE.md** - Complete documentation

---

## How to Build

```bash
cd D:\oneshot_e2e

# Build with Gemma support (Ollama runtime + model load at first startup)
docker build --no-cache --pull -f docker/Dockerfile.gemma -t oneshot:gemma-latest .
```

**Build time:** a few minutes (no LLM data downloaded during the build)
**Final size:** ~1.0GB

---

## How Users Run It

### Option 1: Docker Compose (Easiest)

```bash
docker compose --env-file app/env/.env -f docker/docker-compose.gemma.yml up -d
```

Browser: `http://localhost:8787`

### Option 2: Docker Run

```bash
docker run -d \
  --name oneshot \
  -p 8787:8787 \
  -e ONESHOT_API_TOKEN=your-token \
  oneshot:gemma-latest
```

### Option 3: Docker Run with Cloud API

```bash
docker run -d \
  --name oneshot \
  -p 8787:8787 \
  -e ONESHOT_RESEARCH_PROVIDER=featherless \
  -e FEATHERLESS_API_KEY=your_key \
  oneshot:gemma-latest
```

---

## What's Included in Image

```
oneshot:gemma-latest
├── Node.js runtime
├── OneShot backend (compiled)
├── React Web IDE (built)
├── Python 3.12 + validation tools
└── Start script (installs/starts Ollama, loads the model, seeds providers)

Loaded at first startup (NOT baked into the image):
├── Ollama runtime → streamed into the ollama_runtime volume (~1.2GB download, once per host)
└── Gemma model    → pulled into ./.ollama/models unless already cached (gemma2:2b = 1.6GB)
```

---

## Features for End Users

**Local Chat:**
- Run Gemma locally (gemma2:2b default; no internet needed)
- Works offline after first startup
- Private: data never leaves container

**Cloud Alternative:**
- Switch to Featherless/Gemini with env var
- No image rebuild needed
- Same interface, different backend

**Testing Mode:**
- Use fixture-based deterministic workflows
- For validation without LLMs

---

## Quick Comparison

| Feature | Local Gemma | Cloud API | Fixtures |
|---------|-------------|-----------|----------|
| **Setup Time** | Minutes (build) + first-run model pull | Instant | Instant |
| **Runtime** | ~2.5 GB RAM (2B) | 512 MB | 512 MB |
| **Cost** | Free | Pay-per-call | Free |
| **Privacy** | Full (local) | Shared (API) | Full (local) |
| **Speed** | Medium | Fast | Instant |
| **Model** | Gemma 2 (2B/9B) | Proprietary | Fixture |

---

## For Distribution

**Share the image:**
```bash
# On build machine
docker save oneshot:gemma-latest | gzip > oneshot-gemma-latest.tar.gz

# On user machine
gunzip -c oneshot-gemma-latest.tar.gz | docker load
docker compose --env-file app/env/.env -f docker/docker-compose.gemma.yml up -d
```

**Or push to registry:**
```bash
docker tag oneshot:gemma-latest your-registry/oneshot:gemma-latest
docker push your-registry/oneshot:gemma-latest
```

---

## Next Steps

### 1. Build the Image
```powershell
cd D:\oneshot_e2e
docker build -f docker/Dockerfile.gemma -t oneshot:gemma-latest .
```

### 2. Test Locally
```bash
docker compose --env-file app/env/.env -f docker/docker-compose.gemma.yml up -d
docker logs -f oneshot-gemma
```

Wait for:
```
✓ Ollama is ready
✓ gemma2:2b is already loaded
[SUCCESS] OneShot Ready!
```

### 3. Verify
- Open http://localhost:8787
- Authenticate with default token (change it!)
- Submit a research workflow
- Verify Gemma processes it

### 4. Share
```bash
docker save oneshot:gemma-latest -o oneshot-gemma.tar
# Share oneshot-gemma.tar with others
```

---

## Key Design Decisions

**Gemma 2 (2B default, 9B optional) chosen because:**
- ✅ Balanced size (1.6GB model, fits the 8GB container cap)
- ✅ Good quality reasoning
- ✅ Ollama has native support
- ✅ Reasonable inference speed
- ✅ Open source, no licensing issues

**Ollama chosen because:**
- ✅ Simple deployment (just `ollama serve`)
- ✅ Pre-built Gemma support
- ✅ Low overhead
- ✅ Can run CPU-only (no GPU needed)
- ✅ Works with existing OneShot architecture

**Cloud API fallback because:**
- ✅ Users can switch without rebuilding
- ✅ Featherless/Gemini available if faster
- ✅ Maintains flexibility
- ✅ One-line env var configuration

---

## Files Ready to Use

```
D:\oneshot_e2e\
├── docker/Dockerfile.gemma                 # Build with Gemma
├── docker/docker-compose.gemma.yml         # Run with one command
├── app/env/.env.example               # Configuration template
├── scripts/docker-entrypoint-gemma.sh  # Startup logic
└── GEMMA_IMAGE_GUIDE.md             # Full user documentation
```

---

## Status

**Built:** YES ✅ — `oneshot:gemma-latest` rebuilt from the current tree (includes the provider registry refactor)
**Verified live:** YES ✅ — container healthy, `/api/health` fully green, provider test `{"ok":true}` via Ollama `gemma2:2b`
**Ready to share:** YES ✅
