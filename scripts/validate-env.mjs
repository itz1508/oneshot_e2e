#!/usr/bin/env node
/**
 * Validates OneShot environment configuration
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve("app/env/.env");

console.log("OneShot Environment Validation");
console.log("=".repeat(50));
console.log("");

if (!existsSync(envPath)) {
  console.log("❌ app/env/.env not found");
  console.log("");
  console.log("Create it:");
  console.log("  cp app/env/.env.example app/env/.env");
  console.log("");
  console.log("Then add your API key:");
  console.log("  GEMINI_API_KEY=your_key_here");
  console.log("  or");
  console.log("  OPENAI_API_KEY=your_key_here");
  console.log("");
  process.exit(1);
}

console.log("✓ app/env/.env exists");

const env = readFileSync(envPath, "utf-8");
const lines = env.split("\n");

const config = {};
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  
  const [key, ...valueParts] = trimmed.split("=");
  const value = valueParts.join("=").trim();
  
  if (key && value) {
    config[key] = value;
  }
}

// Check API keys
const geminiKey = config.GEMINI_API_KEY;
const openaiKey = config.OPENAI_API_KEY;

if (!geminiKey && !openaiKey) {
  console.log("❌ No LLM provider API key configured");
  console.log("");
  console.log("Add to app/env/.env:");
  console.log("  GEMINI_API_KEY=your_key_here");
  console.log("  or");
  console.log("  OPENAI_API_KEY=your_key_here");
  console.log("");
  console.log("Get keys:");
  console.log("  Gemini: https://aistudio.google.com/apikey");
  console.log("  OpenAI: https://platform.openai.com/api-keys");
  console.log("");
  process.exit(1);
}

if (geminiKey) {
  console.log(`✓ GEMINI_API_KEY configured (${geminiKey.length} chars)`);
  if (geminiKey.length < 30) {
    console.log("  ⚠ Warning: Key seems too short");
  }
}

if (openaiKey) {
  console.log(`✓ OPENAI_API_KEY configured (${openaiKey.length} chars)`);
  if (openaiKey.length < 30) {
    console.log("  ⚠ Warning: Key seems too short");
  }
}

if (geminiKey && openaiKey) {
  console.log("  ℹ Both keys set - will use Gemini by default");
}

// Check port
const port = config.PORT || "8080";
console.log(`✓ PORT=${port}`);

// Check OAuth
const oauthClientId = config.GOOGLE_OAUTH_CLIENT_ID;
if (oauthClientId) {
  console.log("✓ GOOGLE_OAUTH_CLIENT_ID configured");
} else {
  console.log("  ℹ GOOGLE_OAUTH_CLIENT_ID not set (OAuth disabled)");
}

console.log("");
console.log("Configuration valid!");
console.log("");
console.log("Next steps:");
console.log("  1. Test network: pnpm exec node scripts/test-network-connection.mjs");
console.log("  2. Start server: pnpm run start");
console.log("  3. Open browser: http://localhost:" + port);
console.log("");

process.exit(0);
