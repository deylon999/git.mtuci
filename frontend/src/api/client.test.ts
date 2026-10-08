import { beforeEach, describe, expect, it, vi } from "vitest";

// client.ts reads the token from localStorage; a tiny in-memory stand-in is enough here.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const { ApiError, apiRequest, isSessionRejectedError, setToken } = await import("./client");

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(body == null ? null : JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("apiRequest", () => {
  beforeEach(() => store.clear());

  it("sends the bearer token and JSON body", async () => {
    setToken("abc");
    const fetchMock = mockFetch(200, { ok: true });
    await expect(apiRequest("/x", { method: "POST", body: { a: 1 } })).resolves.toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer abc");
    expect(init.body).toBe('{"a":1}');
  });

  it("returns undefined for an empty body", async () => {
    mockFetch(204, null);
    await expect(apiRequest("/x")).resolves.toBeUndefined();
  });

  it("throws ApiError with status and the FastAPI detail", async () => {
    mockFetch(403, { detail: "User is blocked" });
    const err = await apiRequest("/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as InstanceType<typeof ApiError>).status).toBe(403);
    expect((err as Error).message).toBe("403 User is blocked");
    expect(isSessionRejectedError(err)).toBe(true);
  });

  it("formats FastAPI validation errors", async () => {
    mockFetch(422, { detail: [{ loc: ["body", "email"], msg: "invalid", type: "value_error" }] });
    await expect(apiRequest("/x")).rejects.toThrow("422 body.email: invalid");
  });

  it("drops the token when an authenticated request gets 401", async () => {
    setToken("expired");
    mockFetch(401, { detail: "Session expired, please log in again" });
    await expect(apiRequest("/x")).rejects.toThrow("401 Session expired");
    expect(store.has("token")).toBe(false);
  });

  it("keeps the token on 403", async () => {
    setToken("valid");
    mockFetch(403, { detail: "Permission denied" });
    await expect(apiRequest("/x")).rejects.toThrow("403");
    expect(store.get("token")).toBe("valid");
  });

  it("does not treat server errors or network failures as a rejected session", async () => {
    mockFetch(500, { detail: "boom" });
    expect(isSessionRejectedError(await apiRequest("/x").catch((e: unknown) => e))).toBe(false);
    expect(isSessionRejectedError(new TypeError("Failed to fetch"))).toBe(false);
  });
});
