import { pino, type LevelWithSilent } from "pino";

export interface CreateLoggerOptions {
  level?: LevelWithSilent;
}

export function createLogger(
  destination?: NodeJS.WritableStream,
  options: CreateLoggerOptions = {},
) {
  return pino(
    {
      level: options.level ?? "info",
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.body.password",
          "req.body.newPassword",
          "req.body.otp",
          "req.body.token",
          "req.body.refreshToken",
          "req.body.accessToken",
        ],
        censor: "[redacted]",
      },
    },
    destination,
  );
}
