import { create } from "zustand";
import type { AuthUserDto } from "@note-taking-app/shared";

export type SessionStatus = "idle" | "authenticated" | "unauthenticated";

interface SessionState {
  status: SessionStatus;
  user: AuthUserDto | null;
  accessToken: string | null;
  setSession: (session: { user: AuthUserDto; accessToken: string }) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  status: "idle",
  user: null,
  accessToken: null,
  setSession: ({ user, accessToken }) => set({ status: "authenticated", user, accessToken }),
  clearSession: () => set({ status: "unauthenticated", user: null, accessToken: null }),
}));
