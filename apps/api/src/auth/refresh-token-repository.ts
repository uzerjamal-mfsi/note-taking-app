import { randomUUID } from "node:crypto";
import type { PrismaClient, RefreshToken } from "@note-taking-app/db";

interface CreateInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

interface RotateInput {
  tokenHash: string;
  expiresAt: Date;
}

export class RefreshTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateInput): Promise<RefreshToken> {
    const id = randomUUID();
    return this.prisma.refreshToken.create({
      data: {
        id,
        userId: input.userId,
        tokenHash: input.tokenHash,
        familyId: id,
        expiresAt: input.expiresAt,
      },
    });
  }

  findActiveByTokenHash(tokenHash: string): Promise<Pick<RefreshToken, "id"> | null> {
    return this.prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
  }

  findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  async rotate(current: RefreshToken, next: RotateInput): Promise<RefreshToken | null> {
    const nextId = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.refreshToken.create({
        data: {
          id: nextId,
          userId: current.userId,
          tokenHash: next.tokenHash,
          familyId: current.familyId,
          expiresAt: next.expiresAt,
        },
      });

      // Guarded by `revokedAt: null` so that if a concurrent request already
      // rotated this same token first, this update affects zero rows instead
      // of unconditionally succeeding a second time.
      const { count } = await tx.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedByTokenId: nextId },
      });

      if (count === 0) {
        // Lost the race: undo the child we just created so it doesn't
        // linger as an unreferenced, unrevoked row.
        await tx.refreshToken.delete({ where: { id: created.id } });
        return null;
      }

      return created;
    });
  }

  async revoke(id: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
