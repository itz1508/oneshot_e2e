# OneShot

Agentic build-and-prove system.

## Requirements
- [Node.js](https://nodejs.org/) >= 24.13.0
- [npm](https://www.npmjs.com/) >= 11.8.0
- [Python](https://www.python.org/) >= 3.11
- [Redis](https://redis.io/) >= 7.x (optional)

Missing something? Install it first, then come back.

## Install (pick one)

### Option A: Git
```
git clone https://github.com/itz1508/oneshot_e2e.git
cd oneshot_e2e
```

### Option B: Docker
```
docker build -t oneshot:latest .
```

### Option C: ZIP
Download from [GitHub](https://github.com/itz1508/oneshot_e2e) and extract.

## Build
```
npm ci && npm --prefix app/web ci && npm run build
```

## Verify
```
npm run verify
```

## Run
```
npm start          # http://localhost:8787
npm run judge      # judge/evaluation view
```

## Next steps
- [Judge Start](docs/judge/START_HERE.md)
- [Canonical Workflow](docs/CANONICAL_WORKFLOW.md)
- [Provider Management](docs/PROVIDER_MANAGEMENT.md)