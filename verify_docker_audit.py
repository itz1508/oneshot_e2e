#!/usr/bin/env python3
"""
OneShot Docker Audit - Corrected E2E Test Suite
Loads token from environment, never prints it.
Includes proper persistence test with container restart.
"""
import os
import subprocess
import requests
import json
import time
import sys

def load_token():
    """Load token from environment or .env file, never print it."""
    token = os.environ.get('ONESHOT_API_TOKEN')
    if not token:
        # Try to load from .env
        try:
            with open('.env', 'r') as f:
                for line in f:
                    if line.startswith('ONESHOT_API_TOKEN='):
                        token = line.split('=', 1)[1].strip()
                        break
        except:
            pass
    
    if not token:
        print("ERROR: ONESHOT_API_TOKEN not found in environment or .env")
        sys.exit(1)
    
    return token

TOKEN = load_token()
BASE_URL = "http://localhost:8787"

test_results = []

def test(name, fn):
    """Execute test, record result. Never print token."""
    try:
        fn()
        test_results.append((name, "PASS", ""))
        print(f"[PASS] {name}")
        return True
    except AssertionError as e:
        test_results.append((name, "FAIL", str(e)))
        print(f"[FAIL] {name}: {e}")
        return False
    except Exception as e:
        test_results.append((name, "ERROR", str(e)))
        print(f"[ERROR] {name}: {e}")
        return False

# Test 1: Unauthenticated API returns 401
def test_401():
    r = requests.get(f"{BASE_URL}/api/health", timeout=5)
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"
    assert "unauthorized" in r.text.lower(), "Expected 'unauthorized' in response"
test("Unauthenticated API returns 401", test_401)

# Test 2: Authenticated API returns 200
def test_auth_200():
    headers = {"Authorization": f"Bearer {TOKEN}"}
    r = requests.get(f"{BASE_URL}/api/health", headers=headers, timeout=5)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    data = r.json()
    assert data.get("status") == "ok", "Expected status=ok"
test("Authenticated API returns 200", test_auth_200)

# Test 3: UI accessible (200)
def test_ui_200():
    r = requests.get(f"{BASE_URL}/", timeout=5)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    assert "<!DOCTYPE" in r.text or "<html" in r.text, "Expected HTML"
test("UI returns 200", test_ui_200)

# Test 4: Authenticated workflow execution
def test_workflow():
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json"
    }
    payload = {
        "intent": "Run canonical success sample",
        "requested_outcome": "Execute the complete canonical workflow through DONE",
        "context": "Docker audit test",
        "research_direction": ["contracts", "proof"]
    }
    
    r = requests.post(f"{BASE_URL}/api/runs", json=payload, headers=headers, timeout=10)
    assert r.status_code == 202, f"Expected 202, got {r.status_code}"
    
    run_id = r.json().get("run_id")
    assert run_id, "No run_id in response"
    
    # Poll for completion
    for attempt in range(30):
        time.sleep(1)
        r = requests.get(f"{BASE_URL}/api/runs/{run_id}", headers=headers, timeout=5)
        assert r.status_code == 200, f"Status check failed: {r.status_code}"
        
        result = r.json().get("result")
        if result in ["PASSED", "FAILED", "DECLINED"]:
            assert result == "PASSED", f"Run failed: {result}"
            hash_proof = r.json().get("hash_proof", {})
            assert hash_proof.get("equal"), "Hash proof invalid"
            print(f"  [INFO] Workflow completed in {attempt+1}s")
            return
    
    raise AssertionError("Workflow did not complete within 30 seconds")
test("Authenticated workflow succeeds", test_workflow)

# Test 5: Persistence across restart
def test_persistence():
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json"
    }
    
    # Step 1: Create run
    payload = {
        "intent": "Persistence test run",
        "requested_outcome": "Execute the complete canonical workflow through DONE",
        "context": "Will verify after restart",
        "research_direction": ["contracts"]
    }
    
    r = requests.post(f"{BASE_URL}/api/runs", json=payload, headers=headers, timeout=10)
    assert r.status_code == 202, f"Failed to create run: {r.status_code}"
    
    run_id = r.json().get("run_id")
    assert run_id, "No run_id returned"
    print(f"  [INFO] Created run {run_id[:8]}...")
    
    # Wait for completion
    for i in range(30):
        time.sleep(1)
        r = requests.get(f"{BASE_URL}/api/runs/{run_id}", headers=headers, timeout=5)
        if r.status_code == 200 and r.json().get("result") == "PASSED":
            event_count_before = len(r.json().get("events", []))
            artifact_count_before = len(r.json().get("artifacts", {}))
            print(f"  [INFO] Run complete: {event_count_before} events, {artifact_count_before} artifacts")
            break
    
    # Step 2: Restart container
    print("  [INFO] Restarting container...")
    result = subprocess.run(["docker", "compose", "restart"], cwd=".", capture_output=True, timeout=30)
    assert result.returncode == 0, f"Restart failed: {result.stderr.decode()}"
    
    # Step 3: Wait for healthy. While the container is down, the Windows port
    # proxy aborts connections (WSAECONNABORTED 10053) instead of refusing
    # them, so the poll must tolerate connection errors until the server is
    # back. Only a full wait-window exhaustion is a failure.
    last_error = None
    for attempt in range(120):
        time.sleep(0.5)
        try:
            r = requests.get(f"{BASE_URL}/api/health", headers=headers, timeout=5)
        except requests.RequestException as exc:
            last_error = exc
            continue
        last_error = None
        if r.status_code == 200:
            print(f"  [INFO] Container healthy after {attempt*0.5:.1f}s")
            break
    else:
        raise AssertionError(f"Container did not become healthy after restart: {last_error}")
    
    # Step 4: Verify run persists (retry through any lingering connection resets)
    data = None
    last_error = None
    for attempt in range(10):
        try:
            r = requests.get(f"{BASE_URL}/api/runs/{run_id}", headers=headers, timeout=5)
            if r.status_code == 200:
                data = r.json()
                break
            last_error = f"status {r.status_code}"
        except requests.RequestException as exc:
            last_error = exc
        time.sleep(1)
    assert data is not None, f"Run not found after restart: {last_error}"
    event_count_after = len(data.get("events", []))
    artifact_count_after = len(data.get("artifacts", {}))
    
    assert event_count_after == event_count_before, f"Event count changed: {event_count_before} -> {event_count_after}"
    assert artifact_count_after == artifact_count_before, f"Artifact count changed"
    assert data.get("result") == "PASSED", "Result changed after restart"
    
    print(f"  [INFO] Persistence verified: data intact after restart")

test("Persistence across restart", test_persistence)

# Print summary
print("\n" + "="*60)
print("E2E TEST SUMMARY")
print("="*60)
passed = sum(1 for _, status, _ in test_results if status == "PASS")
failed = sum(1 for _, status, _ in test_results if status == "FAIL")
errors = sum(1 for _, status, _ in test_results if status == "ERROR")

for name, status, msg in test_results:
    symbol = "[OK]" if status == "PASS" else "[XX]"
    print(f"{symbol} {name}")
    if msg:
        print(f"     {msg}")

print("="*60)
print(f"Results: {passed} PASS / {failed} FAIL / {errors} ERROR")
print("="*60)

sys.exit(0 if failed == 0 and errors == 0 else 1)
