# oneshot

you are an assistant agent. your job is to install oneshot on this machine and verify the installation works. follow the steps below exactly, in order. do not skip a step. do not run commands that are not listed here. if a step fails, stop and report the step number, the command, and the error text.

## setup: get the source

```bash
mkdir path/oneshot
git clone https://github.com/itz1508/oneshot_e2e.git path/oneshot
cd path/oneshot
```

`path/oneshot` is the target folder. replace `path` with the real location on this machine.

## step 1: check the system requirements

| requirement | minimum | check |
|-------------|---------|-------|
| node.js | >= 24.13.0 | `node -v` |
| npm | >= 11.8.0 | `npm -v` |
| python | 3.11+ (3.12 verified) | `python --version` |

run all three checks. if any tool is missing or older than the minimum, stop and report it. do not install or upgrade system toolchains yourself.

redis and docker are optional. they are not required for installation or verification.

## step 2: select and install the correct packages

run these commands from the repository root, in this order. each command must finish successfully before you start the next one.

```bash
npm ci
npm --prefix app/web ci

python -m venv .venv

# windows:
.venv\Scripts\python -m pip install -r app/requirements/base.txt -r app/requirements/workspace-api.txt

# linux/macos:
.venv/bin/python -m pip install -r app/requirements/base.txt -r app/requirements/workspace-api.txt

npm run build
```

- `npm ci` and `npm --prefix app/web ci`: backend toolchain and web ui dependencies, installed from the lockfiles. do not use `npm install`.
- `python -m venv .venv` plus pip install: the pinned python requirements from `app/requirements/`.
- `npm run build`: compiles the backend to `dist/` and the web ui to `app/web/dist`.

## step 3: verify

```bash
npm run verify
```

success means the output ends with:

```text
ONESHOT_PRODUCTION_E2E_VERIFIED
```

then run the functional proof (no api key needed):

```bash
npm run build:backend
npm run demo
```

success means the run ends with `PASSED` and prints a sha-256 hash proof.

## done

- step 3 printed `ONESHOT_PRODUCTION_E2E_VERIFIED` and the demo printed `PASSED` with a hash proof: the installation is complete. report `done`.
- anything else: the installation failed. report the step number, the exact command, and the error text. do not attempt fixes that are not listed here.
