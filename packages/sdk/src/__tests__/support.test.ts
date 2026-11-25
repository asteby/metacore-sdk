import { describe, expect, it, vi } from "vitest";
import {
  applySupportEvent,
  supportErrorCode,
  createSupportApi,
  isAttachmentExpired,
  type SupportCallbackEvent,
  type SupportCase,
  type SupportMessageRequest,
} from "../support.js";

const base: SupportCase = { folio: "OPS-000123", subject: "Stock", status: "open", messages: [] };
const ev = (over: Partial<SupportCallbackEvent>): SupportCallbackEvent => ({
  event: "desk_message",
  ticket_folio: "OPS-000123",
  issue_url: "",
  issue_number: 0,
  comment: "",
  solution: "",
  delivery_id: "d1",
  timestamp: 1764065200,
  ...over,
});

describe("applySupportEvent", () => {
  it("anade el mensaje del agente una sola vez (idempotente)", () => {
    const e = ev({ body: "Mande la sucursal", author_name: "Soporte", message_id: "dm_01" });
    const once = applySupportEvent(base, e);
    expect(once.messages).toHaveLength(1);
    expect(once.messages[0]).toMatchObject({ id: "dm_01", author_type: "agent", author_name: "Soporte" });
    expect(applySupportEvent(once, e).messages).toHaveLength(1);
  });
  it("ai_action es un mensaje de la IA", () => {
    expect(applySupportEvent(base, ev({ event: "ai_action", body: "Listo", author_name: "Aby" })).messages[0]?.author_type).toBe("ai");
  });
  it("resolved, closed y reopened cambian el estado", () => {
    const r = applySupportEvent(base, ev({ event: "desk_resolved", solution: "Conciliado" }));
    expect(r).toMatchObject({ status: "resolved", solution: "Conciliado" });
    expect(applySupportEvent(r, ev({ event: "desk_reopened" })).status).toBe("open");
    expect(applySupportEvent(base, ev({ event: "issue_closed" })).status).toBe("closed");
  });
  it("ignora eventos de otro caso y eventos desconocidos", () => {
    expect(applySupportEvent(base, ev({ ticket_folio: "OTRO", body: "x" }))).toBe(base);
    expect(applySupportEvent(base, ev({ event: "algo_nuevo" }))).toBe(base);
  });
});

describe("isAttachmentExpired", () => {
  it("usa la marca del servidor o expires_at", () => {
    const now = Date.parse("2026-11-25T12:00:00Z");
    expect(isAttachmentExpired({ expired: true }, now)).toBe(true);
    expect(isAttachmentExpired({ expires_at: "2026-11-25T11:00:00Z" }, now)).toBe(true);
    expect(isAttachmentExpired({ expires_at: "2026-11-25T13:00:00Z" }, now)).toBe(false);
    expect(isAttachmentExpired({}, now)).toBe(false);
  });
});

describe("createSupportApi", () => {
  const ok = (data: unknown, cursor?: string) => ({
    data,
    headers: { get: (n: string) => (n.toLowerCase() === "x-next-cursor" ? (cursor ?? null) : null) },
  });

  it("getCase y sendMessage usan rutas bajo basePath y query sin undefined", async () => {
    const transport = vi.fn().mockResolvedValue(ok({}));
    const api = createSupportApi(transport as never, { basePath: "/x/support/" });
    await api.getCase("OPS 1", { limit: 20, before: "cur" });
    await api.sendMessage("OPS-1", { clientMessageId: "c1", body: "hola" });
    expect(transport).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ method: "GET", path: "/x/support/cases/OPS%201", query: { limit: 20, before: "cur" } }),
    );
    expect(transport).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ method: "POST", path: "/x/support/cases/OPS-1/messages", body: { client_message_id: "c1", body: "hola", attachments: undefined } }),
    );
  });

  it("listCases y listMessages exponen el cursor de X-Next-Cursor", async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(ok([{ folio: "A" }], "next1"))
      .mockResolvedValueOnce(ok([{ id: "m" }]))
      .mockResolvedValueOnce(ok([{ id: "m0" }], "older"));
    const api = createSupportApi(transport as never);
    const first = await api.listCases({ status: "open", limit: 10 });
    expect(first).toEqual({ items: [{ folio: "A" }], nextCursor: "next1" });
    expect(transport.mock.calls[0]?.[0]).toMatchObject({ path: "/api/support/cases", query: { status: "open", limit: 10, cursor: undefined } });
    expect((await api.listCases({ cursor: "next1" })).nextCursor).toBeUndefined();
    const older = await api.listMessages("OPS-1", { before: "c", limit: 5 });
    expect(older.nextCursor).toBe("older");
    expect(transport.mock.calls[2]?.[0]).toMatchObject({ path: "/api/support/cases/OPS-1/messages", query: { limit: 5, before: "c" } });
  });

  it("reopen manda el cuerpo opcional", async () => {
    const transport = vi.fn().mockResolvedValue(ok({ folio: "OPS-1" }));
    const api = createSupportApi(transport as never);
    await api.reopen("OPS-1");
    await api.reopen("OPS-1", { body: "sigue fallando", clientMessageId: "r1" });
    expect(transport.mock.calls[0]?.[0]).toMatchObject({ method: "POST", path: "/api/support/cases/OPS-1/reopen" });
    expect(transport.mock.calls[1]?.[0].body).toEqual({ client_message_id: "r1", body: "sigue fallando" });
  });

  it("createCase envia el canal", async () => {
    const transport = vi.fn().mockResolvedValue(ok({}));
    await createSupportApi(transport as never).createCase({ subject: "s", description: "d", channel: "addon_soporte", severity: "high" });
    expect(transport.mock.calls[0]?.[0].body).toMatchObject({ channel: "addon_soporte", severity: "high" });
  });

  it("subscribe usa la fuente inyectada o es un no-op", () => {
    const off = vi.fn();
    const events = vi.fn().mockReturnValue(off);
    expect(createSupportApi(vi.fn() as never, { events }).subscribe("F", () => {})).toBe(off);
    expect(() => createSupportApi(vi.fn() as never).subscribe("F", () => {})()).not.toThrow();
  });
});

describe("supportErrorCode", () => {
  it("lee {error:{code}} directo o dentro de body/data/response", () => {
    const body = { error: { code: "case_resolved", message: "x" } };
    expect(supportErrorCode(body)).toBe("case_resolved");
    expect(supportErrorCode({ status: 409, body })).toBe("case_resolved");
    expect(supportErrorCode({ response: { data: { error: { code: "rate_limited" } } } })).toBe("rate_limited");
    expect(supportErrorCode(new Error("boom"))).toBeUndefined();
    expect(supportErrorCode(null)).toBeUndefined();
  });
});

describe("tipos generados", () => {
  it("un fixture de mensaje v2 encaja en SupportMessageRequest", () => {
    const m: SupportMessageRequest = {
      ticket: { folio: "OPS-000123" },
      author: { type: "reporter", name: "Ana" },
      body: "x",
      client_message_id: "cm_01",
      attachments: [{ url: "https://x", name: "b.pdf", mime_type: "application/pdf", size: 1 }],
    };
    expect(m.attachments[0]?.name).toBe("b.pdf");
  });
});
