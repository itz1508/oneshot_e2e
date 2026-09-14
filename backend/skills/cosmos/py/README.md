# OneShot Cosmos Skill (uv project)

This is an **independent uv project** under `backend/skills/cosmos/py`. It is intentionally not part of the root workspace so that its heavy PyTorch/CUDA dependencies do not leak into the rest of the repository.

## Local setup

```bash
cd backend/skills/cosmos/py
uv sync --extra dev
```

> On the first run `uv sync` downloads the platform-appropriate PyTorch wheel. The lockfile is configured so that macOS/Windows get CPU wheels and Linux gets CUDA 13.0 wheels automatically.

## Running the RPC server

The TypeScript `CosmosModelBridge` spawns this command:

```bash
uv run oneshot-cosmos-skill rpc
```

Useful `uv run` flags for this project:

| Flag | Purpose |
|------|---------|
| `--frozen` | Run without updating `uv.lock` (good for stable production spawns). |
| `--locked` | Fail if `uv.lock` is out of date with `pyproject.toml`. |
| `--no-sync` | Skip syncing the virtual environment (assumes `uv sync` already ran). |
| `--extra dev` | Include dev dependencies, e.g. `uv run --extra dev pytest`. |
| `--python 3.12` | Pin a specific Python interpreter. |
| `--env-file .env` | Load environment variables from a file. |

Example production spawn:

```bash
uv run --frozen --no-sync oneshot-cosmos-skill rpc
```

## Platform-specific wheels

The `pyproject.toml` declares two explicit PyTorch indexes:

- `pytorch-cpu` → `https://download.pytorch.org/whl/cpu`
- `pytorch-cu130` → `https://download.pytorch.org/whl/cu130`

`[tool.uv.sources]` routes `torch` and `torchvision` based on PEP 508 environment markers:

```toml
torch = [
  { index = "pytorch-cpu", marker = "sys_platform == 'darwin' or sys_platform == 'win32'" },
  { index = "pytorch-cu130", marker = "sys_platform == 'linux'" },
]
```

This keeps the lockfile valid for all three platforms while avoiding CUDA payloads on developer macOS/Windows machines.

## Cross-platform lock validation

From any machine you can inspect what would be installed on Linux with:

```bash
uv run --python-platform linux --frozen --dry-run oneshot-cosmos-skill --help
```

(Use `--dry-run` to avoid actually installing.)

## Build backend and packaging

This project uses the **uv build backend** (`uv_build`) because it is pure Python:

```toml
[build-system]
requires = ["uv_build>=0.12.13,<0.13"]
build-backend = "uv_build"
```

The backend normalizes the project name (`oneshot-cosmos-skill` → `oneshot_cosmos_skill`) to discover the module automatically. Because the package lives at the project root rather than under `src/`, `module-root` is set to `""`:

```toml
[tool.uv.build-backend]
module-root = ""
```

### File inclusion and exclusion

The uv build backend packages files as follows:

| Distribution | Included by default | Removed via |
|---|---|---|
| **Source distribution** | `pyproject.toml`, the module, `license-files`, `readme`, `data` dirs, `source-include` patterns | `source-exclude`, default excludes (`__pycache__`, `*.pyc`, `*.pyo`) |
| **Wheel** | the module, `license-files`, `readme`, `data` dirs | `source-exclude`, `wheel-exclude`, default excludes |

- Exclusions always take precedence over inclusions.
- Include patterns are **anchored** (e.g., `pyproject.toml` matches only the root file; `src/**` recurses only from `src/`).
- Exclude patterns are **unanchored** unless prefixed with `/` (e.g., `__pycache__` matches anywhere; `/dist` matches only root `dist/`).

You can build and inspect the distributions locally:

```bash
uv build
unzip -l dist/oneshot_cosmos_skill-0.1.0-py3-none-any.whl
```

## Troubleshooting source builds with build constraints

If a dependency has no wheel for your platform and uv has to build it from source, you can constrain the build-time packages without changing the runtime dependency graph:

```toml
[tool.uv]
build-constraint-dependencies = ["setuptools==60.0.0"]
```

Common cases:

- Pinning `setuptools`, `wheel`, or `maturin` when a source build fails because the latest build dependency is incompatible.
- Constraining `setuptools-rust` or `maturin` for packages with Rust extensions (e.g., `tokenizers`, `safetensors`) when no prebuilt wheel matches the target platform.

Because the Cosmos skill is its own uv project, this setting lives in its own `pyproject.toml`. In a uv workspace it would only be read from the workspace root.

Right now the lockfile resolves PyTorch packages as wheels, so build constraints are not needed unless a future dependency requires a source build.

## Deployment note

The root `Dockerfile` does **not** currently install this uv sub-project. In a containerized deployment, add a step such as:

```dockerfile
COPY backend/skills/cosmos/py ./backend/skills/cosmos/py
RUN cd backend/skills/cosmos/py && uv sync --frozen
```

Then make sure `uv` is on `PATH` when `CosmosModelBridge` spawns the RPC server.
