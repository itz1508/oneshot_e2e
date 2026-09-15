import { OpenAIModel } from "../../../app/integration/strands/src/index.js";
import type { ResolvedExecutionRoute } from "../core/route.js";

/**
 * Build a Strands `OpenAIModel` from a resolved route (M9). The route is
 * non-secret and carries `baseUrl` + `modelId`; credentials are supplied
 * separately by the caller (M11 CredentialReference) — the adapter receives
 * the route, not credentials directly.
 */
export function createStrandsOpenAIModel(
  route: ResolvedExecutionRoute,
  apiKey?: string,
): OpenAIModel {
  return new OpenAIModel({
    api: "chat",
    apiKey: apiKey ?? "",
    clientConfig: { baseURL: route.baseUrl },
    modelId: route.modelId,
  });
}
