import { randomInt } from "node:crypto";
import type { PrismaClient } from "@note-taking-app/db";
import { AppError } from "../errors/app-error.js";
import { isUniqueConstraintError } from "../errors/prisma-errors.js";
import { normalizeEmail } from "./normalize-email.js";
import { hashPassword, verifyPassword } from "./password.js";

// A bcrypt hash of a fixed, never-used value. Compared against on an
// unknown-email login (or an unknown-email/missing-OTP password reset) so
// that path takes as long as a real check, preventing email enumeration via
// response timing (see design.md).
const DUMMY_PASSWORD_HASH = "$2b$12$CwTycUXWue0Thq9StjUM0uJ8v4M2wu9Qb8ee.2rqPvz4nJMOx4T0m";

const OTP_TTL_MS = 10 * 60 * 1000;

function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export class AuthService {
  constructor(private readonly prisma: PrismaClient) {}

  async registerUser(input: RegisterInput): Promise<AuthUser> {
    const normalizedEmail = normalizeEmail(input.email);

    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existing) {
      throw new AppError("EMAIL_TAKEN", 409, "Email is already registered");
    }

    const passwordHash = await hashPassword(input.password);

    try {
      return await this.prisma.user.create({
        data: { name: input.name, email: normalizedEmail, passwordHash },
        select: { id: true, name: true, email: true },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppError("EMAIL_TAKEN", 409, "Email is already registered");
      }
      throw error;
    }
  }

  async verifyCredentials(email: string, password: string): Promise<AuthUser> {
    const normalizedEmail = normalizeEmail(email);

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, name: true, email: true, passwordHash: true },
    });
    const passwordMatches = await verifyPassword(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !passwordMatches) {
      throw new AppError("INVALID_CREDENTIALS", 401, "Invalid email or password");
    }

    return { id: user.id, name: user.name, email: user.email };
  }

  /**
   * Issues a password-reset OTP for the given email if it belongs to a
   * registered user, invalidating any prior unconsumed OTP for that user.
   * Returns the raw OTP so the caller can log it, or null when the email is
   * unknown - callers must not let this difference show up in the response.
   */
  async requestPasswordReset(email: string): Promise<string | null> {
    const normalizedEmail = normalizeEmail(email);

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (!user) {
      // Burn the same bcrypt cost, and the same shape of DB round trips
      // (a two-statement transaction), as the real path below so response
      // timing does not reveal whether the email is registered.
      await hashPassword(generateOtp());
      await this.prisma.$transaction([
        this.prisma.$queryRaw`SELECT 1`,
        this.prisma.$queryRaw`SELECT 1`,
      ]);
      return null;
    }

    const otp = generateOtp();
    const otpHash = await hashPassword(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await this.prisma.$transaction([
      this.prisma.passwordResetOtp.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.passwordResetOtp.create({
        data: { userId: user.id, otpHash, expiresAt },
      }),
    ]);

    return otp;
  }

  /**
   * Verifies an OTP for the given email and, on success, sets the new
   * password and consumes the OTP. Unknown email, wrong OTP, expired OTP,
   * and already-consumed OTP all raise the same generic error so none of
   * them can be distinguished from the response.
   */
  async resetPassword(email: string, otp: string, newPassword: string): Promise<void> {
    const normalizedEmail = normalizeEmail(email);

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    const candidateOtp = user
      ? await this.prisma.passwordResetOtp.findFirst({
          where: { userId: user.id, consumedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
          select: { id: true, otpHash: true },
        })
      : null;

    const otpMatches = await verifyPassword(otp, candidateOtp?.otpHash ?? DUMMY_PASSWORD_HASH);

    if (!user || !candidateOtp || !otpMatches) {
      throw new AppError("INVALID_OTP", 401, "Invalid or expired code");
    }

    const passwordHash = await hashPassword(newPassword);

    await this.prisma.$transaction(async (tx) => {
      // Guarded by `consumedAt: null` so that if a concurrent request already
      // consumed this same OTP first, this update affects zero rows and we
      // roll back instead of letting both requests reset the password.
      const { count } = await tx.passwordResetOtp.updateMany({
        where: { id: candidateOtp.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });

      if (count === 0) {
        throw new AppError("INVALID_OTP", 401, "Invalid or expired code");
      }

      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    });
  }
}
