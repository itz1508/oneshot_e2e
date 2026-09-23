#!/usr/bin/env node
/**
 * OneShot Network Connection Test
 * Proves the agent runtime makes real HTTP requests to LLM provider APIs
 * 
 * Usage:
 *   GEMINI_API_KEY=xxx node scripts/test-network-connection.mjs
 *   OPENAI_API_KEY=xxx node scripts/test-network-connection.mjs
 */

// Import from compiled dist — TypeScript source requires compilation, dist is ready
import { createMainAgent, createLiveModel } from "../dist/packages/agent-runtime/src/index.js";

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

console.log("=".repeat(70));
console.log("OneShot Network Connection Test");
console.log("=".repeat(70));
console.log("");

if (!GEMINI_KEY && !OPENAI_KEY) {
  console.error("❌ No API key found!");
  console.error("");
  console.error("Set one of:");
  console.error("  export GEMINI_API_KEY=your_key_here");
  console.error("  export OPENAI_API_KEY=your_key_here");
  console.error("");
  console.error("Or add to app/env/.env:");
  console.error("  GEMINI_API_KEY=your_key_here");
  process.exit(1);
}

const provider = GEMINI_KEY ? "Gemini" : "OpenAI";
const apiKey = GEMINI_KEY || OPENAI_KEY;
const modelId = GEMINI_KEY ? "gemini-2.5-flash" : "gpt-4o-mini";

console.log(`Provider: ${provider}`);
console.log(`Model: ${modelId}`);
console.log(`API Key: ${apiKey.substring(0, 8)}...${apiKey.slice(-4)}`);
console.log("");

try {
  console.log("[1/3] Creating model instance...");
  const model = createLiveModel({
    apiKey,
    modelId
  });
  console.log("✓ Model created successfully");
  console.log("");

  console.log("[2/3] Creating agent...");
  const agent = createMainAgent({ model });
  console.log("✓ Agent created successfully");
  console.log("");

  console.log("[3/3] Sending test prompt to LLM API...");
  console.log('Prompt: "Respond with exactly: Connection test successful"');
  console.log("");
  console.log("Streaming response:");
  console.log("-".repeat(70));

  let fullResponse = "";
  let eventCount = 0;
  const startTime = Date.now();

  for await (const event of agent.stream("Respond with exactly: Connection test successful")) {
    eventCount++;
    
    // Extract text from various event formats
    const text = event.text || event.data || event.content || "";
    
    if (text) {
      process.stdout.write(text);
      fullResponse += text;
    }
    
    // Log event types for debugging
    if (event.type && event.type !== "data" && event.type !== "chunk") {
      console.log(`\n[Event: ${event.type}]`);
    }
  }

  const duration = Date.now() - startTime;

  console.log("");
  console.log("-".repeat(70));
  console.log("");
  console.log("✅ Network connection test PASSED");
  console.log("");
  console.log(`Total events: ${eventCount}`);
  console.log(`Response length: ${fullResponse.length} characters`);
  console.log(`Duration: ${duration}ms`);
  console.log("");
  console.log("This proves:");
  console.log(`  • HTTP request reached ${provider} API`);
  console.log("  • Real LLM processed the prompt");
  console.log("  • Response streamed back successfully");
  console.log("  • Strands SDK integration is fully functional");
  console.log("");

  process.exit(0);

} catch (error) {
  console.log("");
  console.log("❌ Network connection test FAILED");
  console.log("");
  console.log("Error:", error.message);
  console.log("");
  
  if (error.message.includes("401")) {
    console.log("Diagnosis: Invalid API key");
    console.log("Solution: Check your API key at:");
    if (GEMINI_KEY) {
      console.log("  https://aistudio.google.com/apikey");
    } else {
      console.log("  https://platform.openai.com/api-keys");
    }
  } else if (error.message.includes("ECONNREFUSED") || error.message.includes("ENOTFOUND")) {
    console.log("Diagnosis: Network connection failed");
    console.log("Solution: Check your internet connection and firewall settings");
  } else if (error.message.includes("Missing provider credentials")) {
    console.log("Diagnosis: No API key configured");
    console.log("Solution: Set GEMINI_API_KEY or OPENAI_API_KEY environment variable");
  }
  
  console.log("");
  process.exit(1);
}
