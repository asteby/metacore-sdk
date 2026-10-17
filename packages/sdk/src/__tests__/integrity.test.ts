import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RemoteIntegrityError,
  __resetRemoteIntegrityCache,
  computeIntegrity,
  ensureRemoteIntegrity,
  matchesIntegrity,
  parseIntegrity,
} from "../integrity";

const BODY = "export const init = () => {}\n";
const sri = (alg: "sha256" | "sha384" | "sha512", body = BODY) =>
  `${alg}-${createHash(alg).update(body).digest("base64")}`;

afterEach(() => {
  vi.unstubAllGlobals();
  __resetRemoteIntegrityCache();
});

describe("SRI helpers", () => {
  it("computes the same digest as `openssl dgst -sha384 -binary | base64`", async () => {
    expect(await computeIntegrity(BODY)).toBe(sri("sha384"));
    expect(await computeIntegrity(new TextEncoder().encode(BODY), "sha256")).toBe(sri("sha256"));
  });

  it("keeps only the strongest algorithm", () => {
    const parsed = parseIntegrity(`${sri("sha256")} ${sri("sha512")} md5-xyz`);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].algorithm).toBe("sha512");
    expect(parseIntegrity("")).toEqual([]);
  });

  it("matches and mismatches", async () => {
    expect(await matchesIntegrity(BODY, sri("sha384"))).toBe(true);
    expect(await matchesIntegrity(BODY + " ", sri("sha384"))).toBe(false);
    expect(await matchesIntegrity(BODY, "garbage")).toBe(false);
  });
});

describe("ensureRemoteIntegrity (no DOM)", () => {
  const stubFetch = (body: string, status = 200) => {
    const fetchMock = vi.fn(async () => new Response(body, { status }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  it("is a no-op without integrity", async () => {
    const f = stubFetch(BODY);
    await ensureRemoteIntegrity("/r.js", undefined);
    expect(f).not.toHaveBeenCalled();
  });

  it("passes matching bytes and memoizes", async () => {
    const f = stubFetch(BODY);
    await ensureRemoteIntegrity("/r.js", sri("sha384"));
    await ensureRemoteIntegrity("/r.js", sri("sha384"));
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("rejects tampered bytes with RemoteIntegrityError", async () => {
    stubFetch("alert('pwned')");
    const err = await ensureRemoteIntegrity("/r.js", sri("sha384")).catch((e) => e);
    expect(err).toBeInstanceOf(RemoteIntegrityError);
    expect(err.message).toMatch(/integrity check failed for \/r\.js/);
  });

  it("does not cache failures, so a retry re-checks", async () => {
    stubFetch("", 503);
    await expect(ensureRemoteIntegrity("/r.js", sri("sha384"))).rejects.toThrow(/503/);
    const f = stubFetch(BODY);
    await ensureRemoteIntegrity("/r.js", sri("sha384"));
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("rejects unsupported metadata instead of silently skipping", async () => {
    await expect(ensureRemoteIntegrity("/r.js", "md5-abc")).rejects.toBeInstanceOf(
      RemoteIntegrityError,
    );
  });
});
