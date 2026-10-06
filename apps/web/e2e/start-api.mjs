// Starts the API for the E2E run and tees its output to e2e/.api.log so the tests can read the
// password-reset OTP (which the API only ever writes to the console).
//
// Node has no "unbuffered stdout" switch, so every chunk is written to the log with a synchronous
// fs.writeSync on an open file descriptor: a line is on disk before the next one is processed.
import console from "node:console";
import process from "node:process";
import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { e2eEnv } from "./e2e-env.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(here, "../../api");
const logPath = path.join(here, ".api.log");

mkdirSync(here, { recursive: true });
const logFd = openSync(logPath, "w"); // "w" truncates, so stale OTP lines never survive a restart

// `node --import tsx` runs the TypeScript sources directly (no watch mode, so no restarts).
const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
  cwd: apiDir,
  env: e2eEnv(),
  stdio: ["ignore", "pipe", "pipe"],
});

function tee(stream, sink) {
  stream.on("data", (chunk) => {
    sink.write(chunk);
    writeSync(logFd, chunk);
  });
}
tee(child.stdout, process.stdout);
tee(child.stderr, process.stderr);

let closed = false;
function closeLog() {
  if (!closed) {
    closed = true;
    closeSync(logFd);
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error(`start-api: failed to spawn the API: ${error.message}`);
  closeLog();
  process.exit(1);
});

child.on("close", (code, signal) => {
  closeLog();
  process.exit(code ?? (signal ? 1 : 0));
});
