# Troubleshooting Guide

Common issues and their solutions when running OneShot.

## Installation Issues

### Node.js Version Mismatch

**Error**: `ERROR: Node.js X.X.X found, but 24.13.0+ is required.`

**Solution**:
```bash
# Check current version
node --version

# Install correct version (use nvm, n, or download from nodejs.org)
nvm install 24
nvm use 24
```

### Python Version Mismatch

**Error**: `ERROR: Python X.X found, but 3.11+ is required.`

**Solution**:
```bash
# Check current version
python --version

# Install Python 3.11+ from python.org
# Or use pyenv (Linux/macOS)
pyenv install 3.11.0
pyenv global 3.11.0
```

### Dependency Installation Fails

**Error**: `npm install` or `pip install` fails

**Solutions**:

1. **Network issues**:
   ```bash
   # Retry with network
   npm install --no-audit --no-fund
   ```

2. **Offline installation**:
   ```bash
   # Use vendored dependencies
   npm ci --offline --ignore-scripts --no-audit --no-fund
   ```

3. **Clean install**:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

## Runtime Issues

### Port Already in Use

**Error**: `EADDRINUSE: address already in use :::8787`

**Solutions**:

1. **Use different port**:
   ```bash
   # PowerShell
   $env:PORT="8788"; npm run demo

   # Linux/macOS
   PORT=8788 npm run demo
   ```

2. **Kill existing process**:
   ```bash
   # Windows
   netstat -ano | findstr :8787
   taskkill /PID <PID> /F

   # Linux/macOS
   lsof -ti:8787 | xargs kill -9
   ```

### Health Check Fails

**Error**: `Health check failed` or timeout

**Diagnosis**:
```bash
# Check if server is running
curl http://localhost:8787/api/health

# Check server logs
# Look for errors in terminal output

# Check if port is listening
# Windows
netstat -ano | findstr :8787
# Linux/macOS
lsof -i :8787
```

**Solutions**:
1. Wait longer for startup (can take 30-60s)
2. Check for compilation errors in build step
3. Verify all dependencies installed correctly
4. Check `.runtime/` directory permissions

### Backend Exits Unexpectedly

**Symptoms**: Server crashes after startup

**Diagnosis**:
```bash
# Check runtime logs
# Look for ROOT_CAUSE in error messages

# Check environment variables
echo $ONESHOT_MODE
echo $ONESHOT_RESEARCH_PROVIDER

# Verify runtime directories exist
ls -la .runtime/
```

**Common Causes**:
1. Missing environment variables
2. Invalid provider configuration
3. Runtime directory permission issues
4. Database connection failures (if using PostgreSQL)

## Browser E2E Test Issues

### Browser Cannot Start

**Error**: Browser fails to launch or connect

**Solutions**:

1. **Headless mode**:
   ```bash
   # Some tests support headless mode
   export HEADLESS=true
   ```

2. **Browser not installed**:
   ```bash
   # Install required browser
   # Or use system browser
   ```

3. **CDP connection fails**:
   ```bash
   # Check browser diagnostics
   node scripts/e2e/browser/browser-diag.mjs
   ```

### Test Timeout

**Error**: E2E test times out

**Solutions**:
1. Increase timeout in test configuration
2. Check system resources (CPU, memory)
3. Close other applications
4. Run in headless mode

## Runtime Directory Issues

### Permission Errors

**Error**: `EACCES` or permission denied in `.runtime/`

**Solution**:
```bash
# Windows
icacls .runtime /grant Everyone:F

# Linux/macOS
chmod -R u+w .runtime/
```

### Missing Runtime Directories

**Error**: Runtime directories don't exist

**Solution**:
```bash
# Recreate runtime directories
mkdir -p .runtime/{runs,run-state,task-events,checkpoints,conversations,sandbox-workspaces,cache,uploads,qc}
```

### Legacy data/ Directory Conflict

**Issue**: Both `data/` and `.runtime/` exist

**Solution**:
```bash
# Verify .runtime is being used
ls -la .runtime/

# If data/ is still being written to, update scripts
# See migration notes in START_HERE.md
```

## Provider Issues

### Deterministic Sample Provider

**Issue**: Provider not working as expected

**Check**:
```bash
# Verify mode
echo $ONESHOT_MODE  # Should be "sample"

# Check fixtures exist
ls -la app/fixtures/
```

### Production Provider (ADK)

**Issue**: ADK provider fails

**Check**:
```bash
# Verify environment
echo $ONESHOT_RESEARCH_PROVIDER  # Should be "adk_gemma2" or similar

# Check API credentials
# Check network connectivity to provider
```

## Build Issues

### TypeScript Compilation Fails

**Error**: `tsc` errors

**Solutions**:
1. Check TypeScript version: `npm list typescript`
2. Clean build artifacts: `rm -rf dist/`
3. Reinstall dependencies: `npm install`
4. Check for syntax errors in TypeScript files

### UI Build Fails

**Error**: `npm --prefix app/web run build` fails

**Solutions**:
1. Check Node version in `app/web/`
2. Reinstall UI dependencies: `npm --prefix app/web install`
3. Check for build errors in UI source

## Docker Issues

### Container Won't Start

**Error**: Docker container fails to start

**Solutions**:
1. Check Docker daemon: `docker version`
2. Verify image exists: `docker images | grep oneshot`
3. Check container logs: `docker logs <container-id>`
4. Verify port availability

### Docker Health Check Fails

**Error**: Container health check timeout

**Solutions**:
1. Increase health check timeout in Dockerfile
2. Check container internal logs
3. Verify network configuration

## Getting Help

If issues persist:

1. **Check logs**: Terminal output, `.runtime/` logs
2. **Verify environment**: All prerequisites met
3. **Clean state**: Remove `.runtime/` and rebuild
4. **Check documentation**: Review other docs in this directory
5. **Search issues**: Look for similar reported issues

## Diagnostic Commands

```bash
# System info
node --version
npm --version
python --version

# Check installation
npm run verify

# Clean build
rm -rf dist/ .runtime/
npm run build

# Test backend
npm test

# Test UI
npm --prefix app/web test

# Check runtime directories
ls -la .runtime/

# Check for port conflicts
# Windows: netstat -ano | findstr :8787
# Linux/macOS: lsof -i :8787
```
