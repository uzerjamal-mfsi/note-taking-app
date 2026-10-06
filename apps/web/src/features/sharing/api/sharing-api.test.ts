import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionStore } from "../../../store/session-store.js";
import { createShareLink, getShareLink, getSharedNote, revokeShareLink } from "./sharing-api.js";

const link = {
  token: "tok-1",
  viewCount: 3,
  expiresAt: null,
  createdAt: "2026-10-06T00:00:00.000Z",
};

function res(status: number, body?: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  useSessionStore.setState({ status: "idle", user: null, accessToken: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stub(response: ReturnType<typeof res>) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("getShareLink", () => {
  it("GETs /notes/:id/share and returns the link", async () => {
    const fetchMock = stub(res(200, link));

    await expect(getShareLink("n1")).resolves.toEqual(link);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/notes/n1/share");
    expect(init.method).toBeUndefined();
  });

  it("resolves null on a 404", async () => {
    stub(res(404, { code: "NOT_FOUND", message: "none" }));

    await expect(getShareLink("n1")).resolves.toBeNull();
  });

  it("rethrows non-404 errors", async () => {
    stub(res(500, { code: "INTERNAL", message: "boom" }));

    await expect(getShareLink("n1")).rejects.toMatchObject({ status: 500 });
  });
});

describe("createShareLink", () => {
  it("omits expiresAt from the body when not supplied", async () => {
    const fetchMock = stub(res(201, link));

    await createShareLink("n1");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/notes/n1/share");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({});
  });

  it("sends expiresAt when supplied", async () => {
    const fetchMock = stub(res(201, link));

    await createShareLink("n1", "2030-01-01T00:00:00.000Z");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ expiresAt: "2030-01-01T00:00:00.000Z" });
  });
});

describe("revokeShareLink", () => {
  it("DELETEs /notes/:id/share", async () => {
    const fetchMock = stub(res(204));

    await expect(revokeShareLink("n1")).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/notes/n1/share");
    expect(init.method).toBe("DELETE");
  });
});

describe("getSharedNote", () => {
  it("GETs /shared/:token without an Authorization header", async () => {
    useSessionStore.getState().setSession({
      user: { id: "u", name: "A", email: "a@example.com" },
      accessToken: "secret",
    });
    const fetchMock = stub(res(200, { title: "T", content: { type: "doc" } }));

    await getSharedNote("tok-1");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/shared/tok-1");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});
