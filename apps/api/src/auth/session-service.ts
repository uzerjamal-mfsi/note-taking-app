import { signAccessToken } from "./access-token.js";
import { generateRefreshToken, hashRefreshToken } from "./refresh-token.js";
import type { RefreshTokenRepository } from "./refresh-token-repository.js";

export interface SessionServiceConfig {
  accessTokenSecret: string;
  refreshTokenSecret: string;
  refreshTokenTtlMs: number;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
}

export class SessionService {
  constructor(
    private readonly repository: RefreshTokenRepository,
    private readonly config: SessionServiceConfig,
  ) {}

  async startSession(userId: string): Promise<Session> {
    const refreshToken = generateRefreshToken();

    await this.repository.create({
      userId,
      tokenHash: hashRefreshToken(refreshToken, this.config.refreshTokenSecret),
      expiresAt: new Date(Date.now() + this.config.refreshTokenTtlMs),
    });

    return {
      accessToken: signAccessToken({ userId }, this.config.accessTokenSecret),
      refreshToken,
    };
  }

  async refreshSession(rawRefreshToken: string): Promise<Session | null> {
    const tokenHash = hashRefreshToken(rawRefreshToken, this.config.refreshTokenSecret);

    const current = await this.repository.findByTokenHash(tokenHash);
    if (!current) {
      return null;
    }

    if (current.revokedAt) {
      // Reuse of an already-rotated/revoked token: treat as possible theft.
      await this.repository.revokeFamily(current.familyId);
      return null;
    }

    if (current.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    const nextRawToken = generateRefreshToken();
    const rotated = await this.repository.rotate(current, {
      tokenHash: hashRefreshToken(nextRawToken, this.config.refreshTokenSecret),
      expiresAt: new Date(Date.now() + this.config.refreshTokenTtlMs),
    });

    if (!rotated) {
      // Lost a race with a concurrent refresh of the same token; the other
      // request's rotation already went through, so this one simply fails.
      return null;
    }

    return {
      accessToken: signAccessToken({ userId: rotated.userId }, this.config.accessTokenSecret),
      refreshToken: nextRawToken,
    };
  }

  async endSession(rawRefreshToken: string): Promise<boolean> {
    const tokenHash = hashRefreshToken(rawRefreshToken, this.config.refreshTokenSecret);
    const current = await this.repository.findActiveByTokenHash(tokenHash);
    if (!current) {
      return false;
    }

    await this.repository.revoke(current.id);
    return true;
  }
}
