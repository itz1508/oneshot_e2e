/**
 * Node ↔ Python JSON-RPC bridge for the Cosmos skill.
 *
 * Spawns `oneshot-cosmos-skill rpc` from the isolated `backend/skills/cosmos/py`
 * uv project. No CUDA binaries or model weights are bundled; they must be
 * present in the target environment.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PYTHON_PROJECT_ROOT = join(__dirname, "py");

export interface CosmosModelBridgeConfig {
  reasonerUrl?: string;
  generatorModel?: string;
  visionModel?: string;
  enabledGroups?: string[];
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

interface RpcMessage {
  id?: string;
  result?: unknown;
  error?: { message?: string };
}

export class CosmosModelBridge {
  #process: ChildProcessWithoutNullStreams | null = null;
  #pending = new Map<string, Pending>();
  #ready = false;
  #buffer = "";
  readonly config: Required<CosmosModelBridgeConfig>;

  constructor(config: CosmosModelBridgeConfig = {}) {
    this.config = {
      reasonerUrl: config.reasonerUrl || "",
      generatorModel: config.generatorModel || "",
      visionModel: config.visionModel || "",
      enabledGroups: config.enabledGroups ?? [],
    };
  }

  get available(): boolean {
    return Boolean(
      this.config.reasonerUrl || this.config.generatorModel || this.config.visionModel,
    );
  }

  async start(): Promise<void> {
    if (this.#process) return;

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      COSMOS_REASONER_URL: this.config.reasonerUrl,
      COSMOS_GENERATOR_MODEL: this.config.generatorModel,
      COSMOS_VISION_MODEL: this.config.visionModel,
    };

    this.#process = spawn("uv", ["run", "oneshot-cosmos-skill", "rpc"], {
      cwd: PYTHON_PROJECT_ROOT,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.#process.stdout.on("data", (chunk: Buffer) => this.#onData(chunk));
    this.#process.stderr.on("data", (chunk: Buffer) => {
      process.stderr.write(`[cosmos-skill] ${chunk}`);
    });
    this.#process.on("error", (err: Error) => this.#rejectAll(err));
    this.#process.on("exit", (code: number | null) =>
      this.#rejectAll(new Error(`cosmos-skill exited ${code ?? "unknown"}`)),
    );

    await this.#call("set_groups", { groups: this.config.enabledGroups });
    this.#ready = true;
  }

  stop(): void {
    if (this.#process) {
      this.#process.kill();
      this.#process = null;
    }
    this.#ready = false;
    this.#rejectAll(new Error("cosmos-skill stopped"));
  }

  async callTool(name: string, input: unknown): Promise<unknown> {
    await this.start();
    return this.#call("tool", { name, input });
  }

  async reason(prompt: string, media?: string[]): Promise<unknown> {
    await this.start();
    return this.#call("reason", { prompt, media });
  }

  async vision(prompt: string, media: string[]): Promise<unknown> {
    await this.start();
    return this.#call("vision", { prompt, media });
  }

  async generate(
    mode: string,
    prompt: string,
    imagePath: string | undefined,
    outPath: string,
  ): Promise<unknown> {
    await this.start();
    return this.#call("generate", {
      mode,
      prompt,
      image_path: imagePath,
      out_path: outPath,
    });
  }

  #onData(chunk: Buffer): void {
    this.#buffer += chunk.toString("utf8");
    let lines: string[];
    while ((lines = this.#buffer.split("\n")).length > 1) {
      const line = lines.shift();
      this.#buffer = lines.join("\n");
      if (!line?.trim()) continue;
      try {
        const msg = JSON.parse(line) as RpcMessage;
        const pending = this.#pending.get(msg.id || "");
        if (!pending) continue;
        this.#pending.delete(msg.id || "");
        if (msg.error) {
          pending.reject(new Error(msg.error.message || String(msg.error)));
        } else {
          pending.resolve(msg.result);
        }
      } catch {
        // Ignore malformed lines; they will surface as timeouts.
      }
    }
  }

  #call(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      this.#pending.set(id, { resolve, reject });
      this.#process?.stdin?.write(
        JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
      );
      setTimeout(() => {
        if (this.#pending.has(id)) {
          this.#pending.delete(id);
          reject(new Error(`Cosmos RPC timeout: ${method}`));
        }
      }, 120_000);
    });
  }

  #rejectAll(err: Error): void {
    for (const { reject } of this.#pending.values()) {
      reject(err);
    }
    this.#pending.clear();
  }
}
