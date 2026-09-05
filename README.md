# OneShot

Get OneShot running on this machine.

## 1. Requirements
node --version  # >= 24.13.0
npm --version   # >= 11.8.0
python --version  # >= 3.11
Missing? Tell user. Stop.

## 2. Source (pick one)
git clone https://github.com/itz1508/oneshot_e2e.git
docker build -t oneshot:latest .
Download ZIP -> extract

## 3. Install
npm ci && npm --prefix app/web ci && npm run build

## 4. Verify
npm run verify

## 5. Launch
npm start      # server (http://localhost:8787)
npm run judge  # judge/evaluation view