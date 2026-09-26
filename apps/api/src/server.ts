import { parseEnv } from "./config/env.js";
import { createApp } from "./app.js";
import { createGracefulShutdown } from "./shutdown.js";

let env;
try {
  env = parseEnv(process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const app = createApp(env);
const server = app.listen(env.PORT, () => {
  console.log(`api listening on port ${env.PORT}`);
});

const shutdown = createGracefulShutdown(server);
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
