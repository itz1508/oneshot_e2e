# OneShot Judge Guide

This guide helps evaluators run and assess the OneShot Production E2E system.

## Quick Start

```bash
# From repository root
npm run judge
```

This command will:
1. Inspect your environment
2. Open the walkthrough video (detached from terminal)
3. Install dependencies (if needed)
4. Build the application
5. Start the server
6. Verify health endpoints
7. Open the live application

## Judge Documentation

| Document | Purpose |
|----------|---------|
| [START_HERE.md](START_HERE.md) | This file - entry point |
| [EXPECTED_RESULT.md](EXPECTED_RESULT.md) | What success looks like |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Common issues and solutions |
| [walkthrough.mp4](walkthrough.mp4) | Video walkthrough (to be added) |

## System Requirements

- **Node.js**: >=24.13.0
- **npm**: >=11.8.0
- **Python**: 3.11+

## Installation Routes

The judge launcher automatically determines the best installation route:

1. **Repository already present** → Use directly
2. **Docker available with image** → Use Docker route
3. **Git available** → Git clone
4. **Fallback** → ZIP download

## Runtime Directory

All runtime-generated data is stored in `.runtime/`:

```
.runtime/
├── runs/              # Run artifacts and evidence
├── run-state/         # Run snapshots
├── task-events/       # Event store
├── checkpoints/       # Task checkpoints
├── conversations/     # Intent conversations
├── sandbox-workspaces/# Sandbox execution workspaces
├── cache/             # Cached data
├── uploads/           # Uploaded files
└── qc/                # Quality control data
```

**Important**: Generated output never goes to source directories (`backend/`, `app/`, `docs/`, `scripts/`).

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `ONESHOT_RUNTIME_DIR` | Custom runtime directory (default: `.runtime`) |
| `ONESHOT_MODE` | `sample` (deterministic) or `production` |
| `ONESHOT_API_TOKEN` | API authentication token |
| `PORT` | Server port (default: 8787) |

## Next Steps

1. Watch the [walkthrough video](walkthrough.mp4)
2. Review [expected results](EXPECTED_RESULT.md)
3. Run `npm run judge` to start evaluation
4. Consult [troubleshooting guide](TROUBLESHOOTING.md) if needed
