# OneShot

Agentic build-and-prove system. Study → plan → refactor → gap-analysis → triple-validation → sandbox-build → hash-verification.

## Requirements

- Node.js >= 24.13.0
- npm >= 11.8.0
- Python >= 3.11
- Redis 7.x (optional)

## Install (choose one)

1. `git clone https://github.com/itz1508/oneshot_e2e.git && cd oneshot_e2e`
2. `docker build -t oneshot:latest . && docker run -d -p 8787:8787 oneshot:latest`
3. Download ZIP → extract

## After install

`npm ci && npm --prefix app/web ci && npm run build`

## Verify

`npm run verify`

## Run

`npm start`          # server (http://localhost:8787)
`npm run judge`      # judge/evaluation
