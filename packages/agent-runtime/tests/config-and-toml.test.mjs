import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseToml, loadConfig, getConfig } from "../src/config/index.js";

describe("OneShot TOML Parser & Configuration Engine", () => {
  it("parses primitive types, tables, and arrays from TOML strings", () => {
    const toml = `
    # Comment line
    [server]
    host = "127.0.0.1"
    port = 9000
    active = true
    float_val = 3.14

    [security.rate_limiting]
    enabled = true
    max_requests = 100
    tags = ["agent", "runtime", "production"]
    `;

    const parsed = parseToml(toml);
    assert.equal(parsed.server.host, "127.0.0.1");
    assert.equal(parsed.server.port, 9000);
    assert.equal(parsed.server.active, true);
    assert.equal(parsed.server.float_val, 3.14);
    assert.equal(parsed.security.rate_limiting.enabled, true);
    assert.equal(parsed.security.rate_limiting.max_requests, 100);
    assert.deepEqual(parsed.security.rate_limiting.tags, ["agent", "runtime", "production"]);
  });

  it("parses Array of Tables [[models.providers]] (UV-index style)", () => {
    const toml = `
    [[models.providers]]
    name = "mistral"
    priority = 100
    baseUrl = "https://api.mistral.ai/v1"
    defaultModel = "mistral-large-latest"
    models = ["mistral-large-latest", "codestral-latest"]
    envKey = "MISTRAL_API_KEY"
    explicit = false

    [[models.providers]]
    name = "ollama"
    priority = 50
    baseUrl = "http://localhost:11434/v1"
    defaultModel = "llama3.2"
    models = ["llama3.2"]
    envKey = "OLLAMA_API_KEY"
    explicit = true
    `;

    const parsed = parseToml(toml);
    assert.ok(Array.isArray(parsed.models.providers));
    assert.equal(parsed.models.providers.length, 2);
    assert.equal(parsed.models.providers[0].name, "mistral");
    assert.equal(parsed.models.providers[0].priority, 100);
    assert.equal(parsed.models.providers[1].name, "ollama");
    assert.equal(parsed.models.providers[1].explicit, true);
  });

  it("performs environment variable interpolation with fallback defaults", () => {
    process.env.TEST_ONESHOT_HOST = "192.168.1.10";
    const toml = `
    [server]
    host = "\${TEST_ONESHOT_HOST:-127.0.0.1}"
    secret = "\${NON_EXISTENT_VAR:-fallback_secret}"
    `;

    const parsed = parseToml(toml);
    assert.equal(parsed.server.host, "192.168.1.10");
    assert.equal(parsed.server.secret, "fallback_secret");
    delete process.env.TEST_ONESHOT_HOST;
  });

  it("loads root config.toml with valid OneShot schema defaults", () => {
    const config = loadConfig();
    assert.ok(config);
    assert.equal(config.app.name, "OneShot Agent Runtime");
    assert.ok(config.server.port > 0);
    assert.equal(config.sandbox.virtual_mode, true);
    assert.equal(config.sandbox.partitions.length, 4);

    // Verify UV-index style multi-provider registry
    assert.ok(config.models.providers.length >= 3);
    const mistral = config.models.providers.find((p) => p.name === "mistral");
    assert.ok(mistral);
    assert.equal(mistral.defaultModel, "ministral-8b-latest");
  });
});
