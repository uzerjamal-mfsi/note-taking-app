import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionStore } from "../store/session-store.js";
import { apiFetch } from "./api-client.js";

const user = { id: "user-1", name: "Ada Lovelace", email: "ada@example.com" };

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  useSessionStore.setState({ status: "idle", user: null, accessToken: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch - client session state", () => {
  it("adds an Authorization header and sends credentials when a session is present", async () => {
    useSessionStore.getState().setSession({ user, accessToken: "access-token-1" });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/notes");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer access-token-1");
    expect(init.credentials).toBe("include");
  });

  it("omits the Authorization header when there is no session, but still sends credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/health");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(init.credentials).toBe("include");
  });
});

describe("apiFetch - skipAuth", () => {
  it("sends no Authorization header even when a token is in the session store", async () => {
    useSessionStore.getState().setSession({ user, accessToken: "access-token-1" });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/shared/abc", {}, { skipAuth: true });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("does not call /auth/refresh on a 401", async () => {
    useSessionStore.getState().setSession({ user, accessToken: "access-token-1" });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { code: "UNAUTHORIZED", message: "no" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/shared/abc", {}, { skipAuth: true })).rejects.toMatchObject({
      status: 401,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/auth/refresh"))).toBe(false);
  });
});

describe("apiFetch - transparent access-token refresh", () => {
  it("refreshes once and retries the original request on a 401", async () => {
    useSessionStore.getState().setSession({ user, accessToken: "expired-token" });
    let notesCallCount = 0;
    const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
      if (url.endsWith("/auth/refresh")) {
        return Promise.resolve(jsonResponse(200, { user, accessToken: "fresh-token" }));
      }
      notesCallCount += 1;
      if (notesCallCount === 1) {
        return Promise.resolve(jsonResponse(401, { code: "TOKEN_EXPIRED", message: "expired" }));
      }
      return Promise.resolve(jsonResponse(200, { data: "ok" }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch<{ data: string }>("/notes");

    expect(result).toEqual({ data: "ok" });
    expect(notesCallCount).toBe(2);
    expect(useSessionStore.getState().accessToken).toBe("fresh-token");
    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]!;
    const retryInit = lastCall[1] as RequestInit;
    expect((retryInit.headers as Record<string, string>).Authorization).toBe("Bearer fresh-token");
  });

  it("clears the session and propagates the error when refresh itself fails", async () => {
    useSessionStore.getState().setSession({ user, accessToken: "expired-token" });
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith("/auth/refresh")) {
        return Promise.resolve(jsonResponse(401, { code: "INVALID_TOKEN", message: "invalid" }));
      }
      return Promise.resolve(jsonResponse(401, { code: "TOKEN_EXPIRED", message: "expired" }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/notes")).rejects.toMatchObject({ status: 401 });
    expect(useSessionStore.getState().status).toBe("unauthenticated");
    expect(useSessionStore.getState().accessToken).toBeNull();
  });

  it("shares a single in-flight refresh call across concurrent 401s", async () => {
    useSessionStore.getState().setSession({ user, accessToken: "expired-token" });
    let refreshCallCount = 0;
    let notesCallCount = 0;
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith("/auth/refresh")) {
        refreshCallCount += 1;
        return Promise.resolve(jsonResponse(200, { user, accessToken: "fresh-token" }));
      }
      notesCallCount += 1;
      // Each distinct call to /notes 401s on its first attempt (per-URL call count is odd), succeeds on retry.
      if (notesCallCount <= 2) {
        return Promise.resolve(jsonResponse(401, { code: "TOKEN_EXPIRED", message: "expired" }));
      }
      return Promise.resolve(jsonResponse(200, { data: "ok" }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([
      apiFetch<{ data: string }>("/notes"),
      apiFetch<{ data: string }>("/tags"),
    ]);

    expect(first).toEqual({ data: "ok" });
    expect(second).toEqual({ data: "ok" });
    expect(refreshCallCount).toBe(1);
  });

  it("does not attempt a refresh when the caller opts out via skipRefresh (as auth endpoints do)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(401, { code: "INVALID_CREDENTIALS", message: "Invalid email or password" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiFetch("/auth/login", { method: "POST", body: JSON.stringify({}) }, { skipRefresh: true }),
    ).rejects.toMatchObject({ status: 401, code: "INVALID_CREDENTIALS" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().status).toBe("idle");
  });
});
