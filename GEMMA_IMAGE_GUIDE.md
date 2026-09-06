# OneShot with Ollama + Gemma 7B - Ready-to-Use Image

**Status:** ✅ Self-contained image with local LLM support  
**Gemma Model:** 7B (5GB, recommended balance)  
**Runtime:** Ollama (local) + Cloud API support (Featherless, Gemini)

---

## Quick Start (60 seconds)

### 1. Build Image with Gemma

```bash
cd D:\oneshot_e2e
docker build --no-cache --pull -f Dockerfile.gemma -t oneshot:gemma-latest .
```

**⏱️ Estimated build time:** 8-12 minutes (includes downloading Gemma 7B model)

### 2. Run Container

```bash
docker run -d \
  --name oneshot \
  -p 8787:8787 \
  -p 11434:11434 \
  -e ONESHOT_RESEARCH_PROVIDER=ollama \
  -e ONESHOT_API_TOKEN=your-secure-token \
  oneshot:gemma-latest
```

### 3. Wait for Startup

```bash
docker logs -f oneshot
```

Wait for:
```
✓ Ollama ready
✓ Gemma 7B already available
Starting OneShot server on port 8787...
```

### 4. Open Browser

```
http://localhost:8787
```

Authenticate with the token you set.

### 5. Run Research Workflow

Submit a prompt → OneShot uses **local Gemma 7B** automatically via Ollama

---

## Features

✅ **Local LLM** - Gemma 7B runs locally (no external API calls)  
✅ **Offline Capable** - Works without internet after first run  
✅ **Chat Ready** - Conversational interface built-in  
✅ **API Fallback** - Can switch to Featherless/Gemini if needed  
✅ **Deterministic Testing** - Fixture mode still available  
✅ **Pre-loaded** - Gemma model already in image, no download on startup

---

## Docker Compose (Recommended)

Create `docker-compose.gemma.yml`:

```yaml
version: '3.8'

services:
  oneshot:
    image: oneshot:gemma-latest
    container_name: oneshot-gemma
    ports:
      - "8787:8787"      # OneShot HTTP
      - "11434:11434"    # Ollama API
    environment:
      ONESHOT_RESEARCH_PROVIDER: ollama
      ONESHOT_API_TOKEN: your-secure-token-here
      OLLAMA_MODEL: gemma:7b
      PORT: 8787
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8787/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s
    volumes:
      - oneshot_cache:/root/.ollama/models
      - oneshot_runtime:/app/.runtime

volumes:
  oneshot_cache:
  oneshot_runtime:
```

**Run:**
```bash
docker-compose -f docker-compose.gemma.yml up -d
```

---

## Configuration Options

### Use Local Gemma 7B (Default)

```bash
docker run -e ONESHOT_RESEARCH_PROVIDER=ollama oneshot:gemma-latest
```

### Switch to Cloud API (Featherless)

```bash
docker run \
  -e ONESHOT_RESEARCH_PROVIDER=featherless \
  -e FEATHERLESS_API_KEY=your_key \
  oneshot:gemma-latest
```

### Switch to Google Gemini

```bash
docker run \
  -e ONESHOT_RESEARCH_PROVIDER=adk_gemma2 \
  -e GEMINI_API_KEY=your_key \
  oneshot:gemma-latest
```

### Testing with Fixtures (No LLM)

```bash
docker run \
  -e ONESHOT_MODE=sample \
  -e ONESHOT_RESEARCH_PROVIDER=fixture \
  oneshot:gemma-latest
```

---

## Resource Requirements

| Component | Memory | CPU | Storage |
|-----------|--------|-----|---------|
| OneShot   | 512MB  | 1   | -       |
| Gemma 7B  | 4GB    | 2   | 5GB     |
| **Total** | **4.5GB** | **3** | **5GB** |

**Recommended Docker allocation:** 6GB RAM, 4 CPU cores

---

## Troubleshooting

### Ollama slow to start

**Symptom:** Takes >5 minutes to see "Ollama ready"

**Solution:** First run downloads model cache. Subsequent runs are faster.

```bash
docker exec oneshot ollama list
```

### Gemma 7B not loading

**Check logs:**
```bash
docker logs oneshot | grep -i gemma
```

**Manual load:**
```bash
docker exec oneshot ollama pull gemma:7b
```

### Out of memory

**Error:** `OOM kill`

**Solution:** Allocate more Docker memory:
```bash
docker update --memory 8g oneshot
```

Or use smaller model:
```bash
docker run -e OLLAMA_MODEL=gemma:2b oneshot:gemma-latest
```

### Want to use cloud API instead

**Switch to Featherless without rebuilding:**
```bash
docker stop oneshot
docker run -e ONESHOT_RESEARCH_PROVIDER=featherless \
  -e FEATHERLESS_API_KEY=key \
  oneshot:gemma-latest
```

---

## Image Contents

```
oneshot:gemma-latest (1.2GB compressed, ~8GB extracted)
├── Node.js runtime + OneShot backend
├── React web IDE + assets
├── Python 3.12 + validation tools
├── Ollama runtime
└── Gemma 7B model (pre-downloaded)
```

---

## For Users/Teams

**Share this image:**
```bash
docker save oneshot:gemma-latest -o oneshot-gemma.tar.gz
```

**Load on another machine:**
```bash
docker load -i oneshot-gemma.tar.gz
docker run -p 8787:8787 oneshot:gemma-latest
```

**Next users just need:**
1. Docker Desktop/Engine installed
2. 6GB RAM available
3. One command to run

---

## API & Chat Interface

### Web Chat
```
http://localhost:8787
```
- Conversational chat with local Gemma 7B
- Real-time task tracking
- Workflow visualization

### API Access
```bash
curl -H "Authorization: Bearer your-token" \
  http://localhost:8787/api/health
```

### Ollama API (Advanced)
```bash
curl http://localhost:11434/api/generate \
  -d '{"model":"gemma:7b", "prompt":"Hello"}'
```

---

## Next Steps

1. **Build image:** See "Quick Start" above
2. **Run container:** docker-compose recommended
3. **Test locally:** Submit workflow via web UI
4. **Configure providers:** Update `app/env/.env.gemma.example` as needed
5. **Share image:** `docker save` for offline distribution

---

**Status:** Ready for production use  
**Support:** Local Gemma 7B + cloud API fallback  
**Users:** Fully self-contained, no setup needed
