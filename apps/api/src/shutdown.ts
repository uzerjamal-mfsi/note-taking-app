import type { Server } from "node:http";

export interface GracefulShutdownOptions {
  timeoutMs?: number;
  exit?: (code: number) => void;
}

export function createGracefulShutdown(server: Server, options: GracefulShutdownOptions = {}) {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const exit = options.exit ?? process.exit;

  return function shutdown(_signal: string): Promise<void> {
    return new Promise((resolve) => {
      const forceTimer = setTimeout(() => {
        server.closeAllConnections();
      }, timeoutMs);
      forceTimer.unref();

      // Idle keep-alive sockets don't close on their own, so `server.close`'s
      // callback would otherwise wait forever; sweep periodically to drop
      // them as soon as their in-flight request finishes.
      const idleSweep = setInterval(() => server.closeIdleConnections(), 50);
      idleSweep.unref();

      server.close(() => {
        clearInterval(idleSweep);
        clearTimeout(forceTimer);
        exit(0);
        resolve();
      });

      server.closeIdleConnections();
    });
  };
}
