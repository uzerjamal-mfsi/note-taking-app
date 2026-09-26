import { Prisma, type PrismaClient } from "@note-taking-app/db";
import { AppError } from "../errors/app-error.js";
import { normalizeEmail } from "./normalize-email.js";
import { hashPassword, verifyPassword } from "./password.js";

// A bcrypt hash of a fixed, never-used value. Compared against on an
// unknown-email login so that path takes as long as a real password check,
// preventing email enumeration via response timing (see design.md).
const DUMMY_PASSWORD_HASH = "$2b$12$CwTycUXWue0Thq9StjUM0uJ8v4M2wu9Qb8ee.2rqPvz4nJMOx4T0m";

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
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
}
