import {
  probeLiveModels,
  resolveProviderConfiguration,
} from "../integration/provider-discovery.js";
import { Agent, OpenAIModel } from "../../app/integration/strands/src/index.js";

async function main(): Promise<void> {
  const config = resolveProviderConfiguration();

  if (!config.baseUrl || !config.apiKey) {
    console.log(`provider=${config.provider}`);
    console.log(`baseUrl=${config.baseUrl || "none"}`);
    console.log(`modelId=none`);
    console.log(`apiKeyPresent=${config.apiKeyPresent}`);
    console.log(`modelsProbe=fail (not configured)`);
    console.log(`agentInvocation=skip`);
    process.exitCode = 1;
    return;
  }

  let selectedModelId = "unknown";
  try {
    const discovered = await probeLiveModels(config.baseUrl, config.apiKey);
    if (!discovered.length) {
      throw new Error(`0 models returned by ${config.baseUrl}/models`);
    }

    const requested = config.requestedModelId;
    const match = requested ? discovered.find((m) => m.id === requested) : undefined;
    selectedModelId = match?.id || discovered[0].id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`provider=${config.provider}`);
    console.log(`baseUrl=${config.baseUrl}`);
    console.log(`modelId=none`);
    console.log(`apiKeyPresent=true`);
    console.log(`modelsProbe=fail (${msg})`);
    console.log(`agentInvocation=skip`);
    process.exitCode = 1;
    return;
  }

  // Construct real Strands OpenAIModel with api: "chat"
  try {
    const strandsModel = new OpenAIModel({
      api: "chat",
      apiKey: config.apiKey,
      clientConfig: { baseURL: config.baseUrl },
      modelId: selectedModelId,
    });

    const agent = new Agent({
      model: strandsModel,
      systemPrompt: "You are an automated smoke test agent. Respond only with the single word PONG.",
    });

    const response = await agent.invoke("PING");
    const responseText = response.toString().trim();
    if (!responseText) {
      throw new Error("Empty text response from Strands Agent");
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`provider=${config.provider}`);
    console.log(`baseUrl=${config.baseUrl}`);
    console.log(`modelId=${selectedModelId}`);
    console.log(`apiKeyPresent=true`);
    console.log(`modelsProbe=pass`);
    console.log(`agentInvocation=fail (${msg})`);
    process.exitCode = 1;
    return;
  }

  // Output safe metadata report
  console.log(`provider=${config.provider}`);
  console.log(`baseUrl=${config.baseUrl}`);
  console.log(`modelId=${selectedModelId}`);
  console.log(`apiKeyPresent=true`);
  console.log(`modelsProbe=pass`);
  console.log(`agentInvocation=pass`);
}

main().catch((err) => {
  console.error("Unexpected failure in strands-provider-check:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
