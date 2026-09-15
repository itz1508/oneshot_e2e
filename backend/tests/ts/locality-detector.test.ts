import test from "node:test";
import assert from "node:assert/strict";
import { createLocalityDetector } from "../../integration/endpoint/locality-detector.js";

test("locality detector classifies loopback", () => {
  const d = createLocalityDetector();
  assert.equal(d.detect("http://127.0.0.1:11434/v1"), "loopback");
  assert.equal(d.detect("http://localhost:11434/v1"), "loopback");
  assert.equal(d.detect("http://[::1]:11434/v1"), "loopback");
  assert.equal(d.detect("http://127.255.255.255/v1"), "loopback");
});

test("locality detector classifies container-host", () => {
  const d = createLocalityDetector();
  assert.equal(d.detect("http://host.docker.internal:11434/v1"), "container-host");
});

test("locality detector classifies private-network ranges", () => {
  const d = createLocalityDetector();
  assert.equal(d.detect("http://10.0.0.5:11434/v1"), "private-network");
  assert.equal(d.detect("http://172.16.0.1:11434/v1"), "private-network");
  assert.equal(d.detect("http://172.31.255.255:11434/v1"), "private-network");
  assert.equal(d.detect("http://192.168.1.1:11434/v1"), "private-network");
});

test("locality detector classifies public IP literals as cloud", () => {
  const d = createLocalityDetector();
  assert.equal(d.detect("http://8.8.8.8/v1"), "cloud");
});

test("locality detector returns unknown for non-IP hostnames (needs DNS)", () => {
  const d = createLocalityDetector();
  assert.equal(d.detect("http://api.example.com/v1"), "unknown");
});

test("locality detector returns unknown for malformed URLs", () => {
  const d = createLocalityDetector();
  assert.equal(d.detect("not a url"), "unknown");
});
