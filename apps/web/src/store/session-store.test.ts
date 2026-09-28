import { beforeEach, describe, expect, it } from "vitest";
import { useSessionStore } from "./session-store.js";

const user = { id: "user-1", name: "Ada Lovelace", email: "ada@example.com" };

describe("useSessionStore", () => {
  beforeEach(() => {
    useSessionStore.setState({ status: "idle", user: null, accessToken: null });
  });

  it("starts idle with no user or access token", () => {
    const state = useSessionStore.getState();

    expect(state.status).toBe("idle");
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
  });

  it("setSession stores the user and access token and marks the session authenticated", () => {
    useSessionStore.getState().setSession({ user, accessToken: "access-token-1" });

    const state = useSessionStore.getState();
    expect(state.status).toBe("authenticated");
    expect(state.user).toEqual(user);
    expect(state.accessToken).toBe("access-token-1");
  });

  it("clearSession removes the user and access token and marks the session unauthenticated", () => {
    useSessionStore.getState().setSession({ user, accessToken: "access-token-1" });

    useSessionStore.getState().clearSession();

    const state = useSessionStore.getState();
    expect(state.status).toBe("unauthenticated");
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
  });
});
