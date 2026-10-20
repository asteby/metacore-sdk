import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  attachCacheEpoch,
  CACHE_EPOCH_WS_TYPE,
  currentCacheEpoch,
  epochFromHeaders,
  isStaleStateError,
  observeCacheEpoch,
  onCacheEpochChange,
  rebaselineCacheEpoch,
  resetCacheEpochForTests,
  STALE_RETRIED_FLAG,
  withStaleRetry,
  wireCacheEpochPush,
} from "../cache-epoch.js";
import { MarketplaceClient, MarketplaceError } from "../client.js";

beforeEach(() => resetCacheEpochForTests());

describe("epoch observation", () => {
  it("the first token is the baseline and fires nothing", () => {
    const fn = vi.fn();
    onCacheEpochChange(fn);
    expect(observeCacheEpoch("a.1.0")).toBe(false);
    expect(currentCacheEpoch()).toBe("a.1.0");
    expect(fn).not.toHaveBeenCalled();
  });

  it("fires once per real change with the previous token and the source", () => {
    const fn = vi.fn();
    onCacheEpochChange(fn);
    observeCacheEpoch("a.1.0");
    observeCacheEpoch("a.1.0");
    expect(fn).not.toHaveBeenCalled();
    expect(observeCacheEpoch("a.2.1")).toBe(true);
    expect(fn).toHaveBeenCalledWith({ epoch: "a.2.1", previous: "a.1.0", source: "header" });
    observeCacheEpoch("a.2.1");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("ignores missing, empty and non-string tokens (a proxy that strips the header)", () => {
    const fn = vi.fn();
    onCacheEpochChange(fn);
    observeCacheEpoch("a.1.0");
    for (const bad of [undefined, null, "", "   ", 42, {}]) expect(observeCacheEpoch(bad)).toBe(false);
    expect(currentCacheEpoch()).toBe("a.1.0");
    expect(fn).not.toHaveBeenCalled();
  });

  it("one failing listener does not block the rest; unsubscribe works", () => {
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    const off = onCacheEpochChange(bad);
    onCacheEpochChange(good);
    observeCacheEpoch("x.1");
    observeCacheEpoch("x.2");
    expect(good).toHaveBeenCalledTimes(1);
    off();
    observeCacheEpoch("x.3");
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(2);
  });

  it("reads the header from fetch Headers, axios bags and plain objects", () => {
    expect(epochFromHeaders(new Headers({ "X-Cache-Epoch": "h.1.1" }))).toBe("h.1.1");
    expect(epochFromHeaders({ "x-cache-epoch": "p.1.1" })).toBe("p.1.1");
    expect(epochFromHeaders({ "X-Cache-Epoch": "p.1.2" })).toBe("p.1.2");
    expect(epochFromHeaders({ get: (k: string) => (k === "x-cache-epoch" ? "a.1.3" : undefined) })).toBe("a.1.3");
    expect(epochFromHeaders(undefined)).toBeUndefined();
    expect(epochFromHeaders({})).toBeUndefined();
  });
});

describe("push (WebSocket CACHE_EPOCH_CHANGED)", () => {
  it("is a direct refresh signal and rebaselines the header, so there is no second refresh", () => {
    let handler: ((m: { payload?: unknown }) => void) | undefined;
    const client = {
      subscribe: vi.fn((type: string, h: (m: { payload?: unknown }) => void) => {
        expect(type).toBe(CACHE_EPOCH_WS_TYPE);
        handler = h;
        return () => {
          handler = undefined;
        };
      }),
    };
    const fn = vi.fn();
    onCacheEpochChange(fn);
    observeCacheEpoch("view.1");
    const off = wireCacheEpochPush(client);
    handler!({ payload: { epoch: "scope.9", reason: "addon.upgrade" } });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toMatchObject({ source: "push", previous: "view.1" });
    // the header that follows is the new baseline, not another change
    expect(observeCacheEpoch("view.2")).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(observeCacheEpoch("view.3")).toBe(true);
    off();
    expect(handler).toBeUndefined();
    expect(wireCacheEpochPush(undefined)).toBeTypeOf("function");
  });

  it("rebaselineCacheEpoch forgets the held token", () => {
    observeCacheEpoch("a");
    rebaselineCacheEpoch();
    expect(currentCacheEpoch()).toBeNull();
  });
});

describe("stale server state", () => {
  it("recognises 0A000 / 26000 in the shapes errors actually arrive in", () => {
    const msg = "ERROR: cached plan must not change result type (SQLSTATE 0A000)";
    expect(isStaleStateError(new Error(msg))).toBe(true);
    expect(isStaleStateError(msg)).toBe(true);
    expect(isStaleStateError(new MarketplaceError(500, msg))).toBe(true);
    // axios error with the host's JSON envelope
    expect(isStaleStateError({ response: { status: 500, data: { error: { code: "db_error", message: msg } } } })).toBe(true);
    expect(isStaleStateError({ response: { data: { message: msg } } })).toBe(true);
    expect(isStaleStateError(new Error('prepared statement "stmtcache_1" does not exist (SQLSTATE 26000)'))).toBe(true);
    expect(isStaleStateError({ code: "stale_state" })).toBe(true);
  });

  it("does not treat ordinary failures as stale", () => {
    for (const e of [
      new Error("Network Error"),
      new MarketplaceError(403, "forbidden"),
      { response: { status: 500, data: { error: { message: "duplicate key value" } } } },
      new Error("SQLSTATE 23505"),
      null,
      undefined,
    ]) {
      expect(isStaleStateError(e)).toBe(false);
    }
  });

  it("withStaleRetry retries exactly once and only for stale errors", async () => {
    const stale = new Error("cached plan must not change result type");
    const ok = vi.fn().mockRejectedValueOnce(stale).mockResolvedValueOnce("fine");
    await expect(withStaleRetry(ok, { delayMs: 0 })).resolves.toBe("fine");
    expect(ok).toHaveBeenCalledTimes(2);

    const always = vi.fn().mockRejectedValue(stale);
    await expect(withStaleRetry(always, { delayMs: 0 })).rejects.toBe(stale);
    expect(always).toHaveBeenCalledTimes(2); // one retry, never a loop

    const other = new Error("boom");
    const fails = vi.fn().mockRejectedValue(other);
    await expect(withStaleRetry(fails, { delayMs: 0 })).rejects.toBe(other);
    expect(fails).toHaveBeenCalledTimes(1);
  });
});

describe("attachCacheEpoch (axios-like)", () => {
  function fakeAxios() {
    let onOk: (r: any) => any;
    let onErr: (e: any) => any;
    const request = vi.fn();
    return {
      client: {
        interceptors: {
          response: {
            use: (a: any, b: any) => {
              onOk = a;
              onErr = b;
              return 7;
            },
            eject: vi.fn(),
          },
        },
        request,
      },
      ok: (r: any) => onOk(r),
      err: (e: any) => onErr(e),
      request,
    };
  }

  it("reports the epoch of successful and failed responses", async () => {
    const ax = fakeAxios();
    attachCacheEpoch(ax.client);
    const fn = vi.fn();
    onCacheEpochChange(fn);
    ax.ok({ headers: { "x-cache-epoch": "e.1" } });
    await ax.err({ response: { headers: { "x-cache-epoch": "e.2" } }, config: {} }).catch(() => {});
    expect(fn).toHaveBeenCalledTimes(1);
    expect(currentCacheEpoch()).toBe("e.2");
  });

  it("re-sends a request that failed with a stale plan, once", async () => {
    const ax = fakeAxios();
    attachCacheEpoch(ax.client, { delayMs: 0 });
    const config: Record<string, unknown> = { method: "post", url: "/addresses" };
    const stale = { config, response: { status: 500, data: { error: { message: "cached plan must not change result type (SQLSTATE 0A000)" } } } };
    ax.request.mockResolvedValueOnce({ data: "saved" });
    await expect(ax.err(stale)).resolves.toEqual({ data: "saved" });
    expect(ax.request).toHaveBeenCalledTimes(1);
    expect(config[STALE_RETRIED_FLAG]).toBe(true);
    // the retried request failing again with the same error is NOT retried again
    await expect(ax.err(stale)).rejects.toBe(stale);
    expect(ax.request).toHaveBeenCalledTimes(1);
  });

  it("does not retry other failures", async () => {
    const ax = fakeAxios();
    attachCacheEpoch(ax.client, { delayMs: 0 });
    const e = { config: {}, response: { status: 400, data: { message: "bad input" } } };
    await expect(ax.err(e)).rejects.toBe(e);
    expect(ax.request).not.toHaveBeenCalled();
  });

  it("returns an eject function", () => {
    const ax = fakeAxios();
    attachCacheEpoch(ax.client)();
    expect(ax.client.interceptors.response.eject).toHaveBeenCalledWith(7);
  });
});

describe("MarketplaceClient", () => {
  const json = (body: unknown, headers: Record<string, string> = {}, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

  it("reports X-Cache-Epoch from manifests/navigation answers and asks the browser to revalidate GETs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json([], { "X-Cache-Epoch": "m.1" }))
      .mockResolvedValueOnce(json([], { "X-Cache-Epoch": "m.2" }));
    const client = new MarketplaceClient({ baseUrl: "/api/metacore", fetch: fetchMock as any });
    const fn = vi.fn();
    onCacheEpochChange(fn);
    await client.manifests();
    await client.navigation();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].cache).toBe("no-cache");
    expect(fetchMock.mock.calls[1][1].cache).toBe("no-cache");
  });

  it("retries once when the server answers with a stale plan, then succeeds", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response("ERROR: cached plan must not change result type (SQLSTATE 0A000)", { status: 500 }))
        .mockResolvedValueOnce(json([{ key: "pos" }]));
      const client = new MarketplaceClient({ baseUrl: "/api/metacore", fetch: fetchMock as any });
      const p = client.manifests();
      await vi.advanceTimersByTimeAsync(250);
      await expect(p).resolves.toEqual([{ key: "pos" }]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry ordinary errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 403 }));
    const client = new MarketplaceClient({ baseUrl: "/api/metacore", fetch: fetchMock as any });
    await expect(client.manifests()).rejects.toBeInstanceOf(MarketplaceError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
