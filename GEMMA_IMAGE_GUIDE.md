# OneShot with Ollama + Gemma — Ready-to-Use Image

**Status:** ✅ Self-contained runtime with local LLM support
**Default model:** `gemma2:2b` (1.6GB; `OLLAMA_MODEL=gemma2:9b` for higher quality)
**Runtime:** Ollama (local) + cloud API support (Featherless, Gemini)

The image ships the application only. The Ollama runtime is streamed into the
`ollama_runtime` named volume on first startup (not baked into the image), and
models load from a host-side cache bind-mounted at `/root/.ollama/models`.
This keeps the image small, keeps the build context free of multi-GB data
(`.dockerignore` excludes `.ollama`), and avoids the buildkit OOM crashes a
build-time install caused on memory-constrained Windows/WSL2 hosts.

---

## Quick Start

### 1. Build the Image

```bash
cd D:\oneshot_e2e
docker build -f docker/Dockerfile.gemma -t oneshot:gemma-latest .
```

**⏱️ Estimated build time:** a few minutes; no LLM data is downloaded during
the build.

### 2. Run (Compose recommended)

```bash
docker compose --env-file app/env/.env -f docker/docker-compose.gemma.yml up -d
docker logs -f oneshot-gemma
```

### 3. Wait for Startup

Wait for:

```
[SUCCESS] Ollama is ready
[SUCCESS] gemma2:2b is already loaded (cached)
[SUCCESS] OneShot Ready!
```

First startup on a new host additionally streams the ~1.2GB Ollama runtime
(~2 minutes at the capped 10MB/s) and pulls `gemma2:2b` (~1.6GB) if the
mounted model cache does not have it. Both are cached for later starts.

### 4. Open Browser

```
http://localhost:8787
```

Authenticate with the API token. Compose defaults it to
`43da785bb20cf57d5b205274f12b620a` — override with `ONESHOT_API_TOKEN` and
change it for anything beyond local testing.

### 5. Run a Research Workflow

Submit a prompt — the entrypoint seeds the runtime provider config so the
production ProviderManager routes research through the OpenAI-compatible
adapter to local Gemma via Ollama automatically.

---

## What Is (and Is Not) in the Image

```
oneshot:gemma-latest
├── Node.js runtime + compiled OneShot backend
├── Web IDE (built)
├── Python 3.12 + validation tools
└── Startup script (installs/starts Ollama, loads the model, seeds providers)

NOT in the image (by design):
├── Ollama runtime  → streamed into the ollama_runtime volume on first start
└── Gemma model     → bind-mounted from ./.ollama/models (pull if missing)
```

---

## Features

✅ **Local LLM** — Gemma runs locally (no external API calls)
✅ **Offline Capable** — works without internet once runtime + model are cached
✅ **Chat Ready** — conversational interface built in
✅ **API Fallback** — switch to Featherless/Gemini with one env var
✅ **Deterministic Testing** — fixture mode still available
✅ **Persistent** — runtime install and models survive container recreation


---

## Configuration Options

All commands run from the repository root.

### Local Gemma via Ollama (default)

```bash
docker compose --env-file app/env/.env -f docker/docker-compose.gemma.yml up -d
```

Override the model: set `OLLAMA_MODEL=gemma2:9b` in `app/env/.env` (5.4GB,
needs more RAM) before `up -d`.

### Switch to Cloud API (Featherless)

```bash
docker run -d --name oneshot-gemma \
  -e ONESHOT_RESEARCH_PROVIDER=featherless \
  -e FEATHERLESS_API_KEY=your_key \
  -e ONESHOT_API_TOKEN=your-secure-token \
  -p 8787:8787 oneshot:gemma-latest
```

### Switch to Google Gemini

```bash
docker run -d --name oneshot-gemma \
  -e ONESHOT_RESEARCH_PROVIDER=gemini \
  -e GEMINI_API_KEY=your_key \
  -e ONESHOT_API_TOKEN=your-secure-token \
  -p 8787:8787 oneshot:gemma-latest
```

### Testing with Fixtures (No LLM)

```bash
docker run -d --name oneshot-gemma \
  -e ONESHOT_MODE=sample \
  -e ONESHOT_API_TOKEN=your-secure-token \
  -p 8787:8787 oneshot:gemma-latest
```

---

## Resource Requirements

| Component | Memory | Storage |
|-----------|--------|---------|
| OneShot (Node + Python) | ~512MB | image ~1.0GB |
| Ollama runtime (volume) | — | ~2GB extracted (CUDA runners excluded) |
| gemma2:2b (host cache) | ~2GB | 1.6GB |
| **Total (2B)** | **~2.5GB** | **~4.5GB** |

**Recommended Docker allocation:** 6GB RAM, 4 CPU cores (the compose file caps
the container at 8GB with a 4GB reservation).

---

## Troubleshooting

### Startup takes long on a new host

First run streams the Ollama runtime into the volume and pulls the model once.
Later starts reuse both caches and are fast.

```bash
docker exec oneshot-gemma sh -c 'PATH=/opt/ollama/bin:$PATH ollama list'
```

### Model not loading

**Check logs:**

```bash
docker logs oneshot-gemma | grep -i gemma
```

**Manual pull** (uses the bind-mounted host cache):

```bash
docker exec oneshot-gemma sh -c 'PATH=/opt/ollama/bin:$PATH ollama pull gemma2:2b'
```

### Incomplete install after a host crash

The entrypoint detects a partial extraction (missing runner binary), wipes the
install directory, and re-streams the archive on the next start. No manual
action needed.

### Out of memory

Lower the model tier or raise the Docker memory allocation; the compose file
caps the container at 8GB. Prefer `gemma2:2b` over `gemma2:9b` on constrained
hosts.

### Health check returns 401

The auth gate requires the API token on `/api/health`; the compose healthcheck
sends it. If you override `ONESHOT_API_TOKEN`, keep the env var and token in
sync.

---

## API & Chat Interface

### Web Chat

```
http://localhost:8787
```

- Conversational chat with local Gemma
- Real-time task tracking
- Workflow visualization

### API Access

```bash
curl -H "Authorization: Bearer your-token" \
  http://localhost:8787/api/health
```

### Ollama API (Advanced)

Ollama is bound to loopback inside the container; expose it deliberately by
publishing 11434 and setting `OLLAMA_HOST=0.0.0.0:11434`.

---

## Next Steps

1. **Build image:** `docker build -f docker/Dockerfile.gemma -t oneshot:gemma-latest .`
2. **Run container:** Compose recommended (`docker/docker-compose.gemma.yml`)
3. **Test locally:** submit a workflow via the web UI
4. **Configure providers:** `app/env/.env` (see `app/env/.env.example`)
5. **Share image:** `docker save oneshot:gemma-latest -o oneshot-gemma.tar`
   (recipients provide their own model cache; `docker load` + one `up -d`)

---

**Status:** Production-ready — verified live: image rebuilt with the current
provider refactor, container healthy, `/api/health` fully green, provider
connection test `{"ok":true}` against Ollama `gemma2:2b`.
**Support:** Local Gemma via Ollama + cloud API fallback
