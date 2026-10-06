import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionStore } from "../../../store/session-store.js";
import { getNoteVersion, listNoteVersions, restoreNoteVersion } from "./notes-history-api.js";

function res(status: number, body?: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function stub(response: ReturnType<typeof res>) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  useSessionStore.setState({ status: "idle", user: null, accessToken: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listNoteVersions", () => {
  it("GETs /notes/:id/versions and returns the summaries", async () => {
    const versions = [
      { id: "v1", noteId: "n1", title: "T", createdAt: "2026-10-06T00:00:00.000Z" },
    ];
    const fetchMock = stub(res(200, versions));

    await expect(listNoteVersions("n1")).resolves.toEqual(versions);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/notes/n1/versions");
    expect(init.method).toBeUndefined();
  });

  it("rejects with a normalized 404", async () => {
    stub(res(404, { code: "NOT_FOUND", message: "Not found" }));

    await expect(listNoteVersions("n1")).rejects.toMatchObject({ status: 404 });
  });
});

describe("getNoteVersion", () => {
  it("GETs /notes/:id/versions/:versionId", async () => {
    const version = {
      id: "v1",
      noteId: "n1",
      title: "T",
      createdAt: "2026-10-06T00:00:00.000Z",
      content: { type: "doc" },
    };
    const fetchMock = stub(res(200, version));

    await expect(getNoteVersion("n1", "v1")).resolves.toEqual(version);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/notes/n1/versions/v1");
    expect(init.method).toBeUndefined();
  });

  it("rejects with a normalized 404", async () => {
    stub(res(404, { code: "NOT_FOUND", message: "Not found" }));

    await expect(getNoteVersion("n1", "v1")).rejects.toMatchObject({ status: 404 });
  });
});

describe("restoreNoteVersion", () => {
  it("POSTs to the restore path with no body and returns the note", async () => {
    const note = { id: "n1", title: "T", content: { type: "doc" }, tags: [] };
    const fetchMock = stub(res(200, note));

    await expect(restoreNoteVersion("n1", "v1")).resolves.toEqual(note);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/notes/n1/versions/v1/restore");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });

  it("propagates a non-404 error", async () => {
    stub(res(500, { code: "INTERNAL", message: "boom" }));

    await expect(restoreNoteVersion("n1", "v1")).rejects.toMatchObject({ status: 500 });
  });
});
