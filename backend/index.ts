import "./environment.js";
import { startOneShot } from "./startup.js";

const { server, runtimeInfo, close } = await startOneShot();

const address = server.address();
const port =
  typeof address === "object" && address ? address.port : process.env.PORT;

console.log(
  `ONESHOT_SERVER_READY port=${port} mode=${runtimeInfo.mode ?? "unavailable"}`,
);

// --- Graceful shutdown (idempotent) ---
let shuttingDown = false;
const shutdown = async (signal?: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  if (signal) {
    console.log(`[OneShot] received ${signal}`);
  }

  try {
    server.closeAllConnections?.();
  } catch {
    /* ignore */
  }

  await close().catch(() => {});
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
