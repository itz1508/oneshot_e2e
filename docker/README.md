# Docker configuration

Run these commands from the repository root. Build context remains the repository
root, where `.dockerignore` excludes credentials, runtime data, and local models.

```sh
docker build -f docker/Dockerfile -t oneshot:local .
docker compose -f docker/docker-compose.local.yml up -d --build
docker compose -f docker/docker-compose.dev.yml up -d --build
```

For the existing local Gemma image:

```sh
docker build -f docker/Dockerfile.gemma -t oneshot:gemma-latest .
docker compose --env-file app/env/.env -f docker/docker-compose.gemma.yml up -d
```

Use one Compose configuration at a time. The explicit `oneshot_e2e` project name
preserves existing named volume identities after moving these files. Runtime and
model bind mounts still resolve to the repository's `.runtime` and `.ollama` paths.

Live settings belong in ignored `app/env/.env`; `app/env/.env.example` is the
consolidated public template. Container-only bind addresses and filesystem paths
belong in Compose configuration. Do not copy live credentials into this folder.

The reasoner image remains with its Python package at `backend/python/Dockerfile`.
Sandbox-specific infrastructure remains under `app/deploy/docker/`.

Moving Dockerfiles does not require deleting an existing image. Verify image and
container usage before removing build assets or cached models.
