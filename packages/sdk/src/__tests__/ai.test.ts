import { describe, expect, it, vi } from "vitest";
import { AICompleteError, AI_STATUSES, createAIClient, isAIDegraded, type AIResult } from "../ai";
import { HostApiError, type HostApi } from "../host";

function fakeApi(post: (path: string, body: unknown) => Promise<unknown>, get?: (path: string, opts?: unknown) => Promise<unknown>): HostApi {
  return {
    get: (get ?? (() => Promise.reject(new Error("no get")))) as HostApi["get"],
    post: ((path: string, body?: unknown) => post(path, body)) as HostApi["post"],
    put: () => Promise.reject(new Error("no put")),
    patch: () => Promise.reject(new Error("no patch")),
    delete: () => Promise.reject(new Error("no delete")),
    q: () => Promise.reject(new Error("no q")),
    capability: () => Promise.reject(new Error("no capability")),
  } as HostApi;
}

const ok: AIResult = { status: "ok", content: "urgente", usage: { input_tokens: 3, output_tokens: 1 }, cost_sparks: 2 };

describe("createAIClient", () => {
  it("posts the addon, the request and a generated idempotency key", async () => {
    const post = vi.fn().mockResolvedValue(ok);
    const ai = createAIClient(fakeApi(post), "tickets", { newKey: () => "k-1" });
    const res = await ai.complete({ feature: "ticket_triage", prompt: "cliente molesto", tier: "fast" });
    expect(res).toEqual(ok);
    expect(post).toHaveBeenCalledWith("/ai/complete", {
      addon: "tickets",
      feature: "ticket_triage",
      prompt: "cliente molesto",
      tier: "fast",
      idempotency_key: "k-1",
    });
  });

  it("keeps a caller idempotency key", async () => {
    const post = vi.fn().mockResolvedValue(ok);
    await createAIClient(fakeApi(post), "tickets").complete({ feature: "x", prompt: "y", idempotency_key: "ticket:1" });
    expect(post.mock.calls[0][1]).toMatchObject({ idempotency_key: "ticket:1" });
  });

  it("returns degraded statuses as results (no Pulse never throws)", async () => {
    const pulse: AIResult = { status: "insufficient_pulse", message: "Pulse agotado", usage: { input_tokens: 0, output_tokens: 0 }, cost_sparks: 0 };
    const res = await createAIClient(fakeApi(() => Promise.resolve(pulse)), "tickets").complete({ feature: "x", prompt: "y" });
    expect(res.status).toBe("insufficient_pulse");
    expect(isAIDegraded(res)).toBe(true);
  });

  it("turns host and network failures into an unavailable result", async () => {
    for (const err of [new HostApiError("bad gateway", 502, { code: "unavailable" }), new Error("Network error")]) {
      const res = await createAIClient(fakeApi(() => Promise.reject(err)), "tickets").complete({ feature: "x", prompt: "y" });
      expect(res.status).toBe("unavailable");
      expect(res.cost_sparks).toBe(0);
    }
  });

  it("throws AICompleteError only for caller bugs", async () => {
    const forbidden = createAIClient(fakeApi(() => Promise.reject(new HostApiError("not granted", 403, { code: "forbidden" }))), "tickets");
    await expect(forbidden.complete({ feature: "x", prompt: "y" })).rejects.toBeInstanceOf(AICompleteError);
    const invalid = createAIClient(fakeApi(() => Promise.reject(new HostApiError("feature required", 400, { code: "invalid_input" }))), "tickets");
    await expect(invalid.complete({ feature: "", prompt: "y" })).rejects.toMatchObject({ code: "invalid_input", status: 400 });
  });

  it("rethrows when the caller aborted", async () => {
    const ctl = new AbortController();
    ctl.abort();
    const abortErr = new DOMException("aborted", "AbortError");
    const ai = createAIClient(fakeApi(() => Promise.reject(abortErr)), "tickets");
    await expect(ai.complete({ feature: "x", prompt: "y" }, { signal: ctl.signal })).rejects.toBe(abortErr);
  });

  it("reads the addon usage", async () => {
    const get = vi.fn().mockResolvedValue({ success: true, data: { addon: "tickets", period: "2026-11", spent_sparks: 6, monthly_sparks_cap: 300, features: [] } });
    const usage = await createAIClient(fakeApi(() => Promise.resolve(ok), get), "tickets").usage();
    expect(usage.spent_sparks).toBe(6);
    expect(get).toHaveBeenCalledWith("/ai/usage", { params: { addon: "tickets" } });
  });

  it("requires the addon key and mirrors the kernel statuses", () => {
    expect(() => createAIClient(fakeApi(() => Promise.resolve(ok)), "")).toThrow();
    expect(AI_STATUSES).toEqual([
      "ok", "insufficient_pulse", "quota_exceeded", "budget_exceeded", "rate_limited", "disabled", "no_wallet", "unavailable", "invalid_output",
    ]);
  });
});
