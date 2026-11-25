import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EmbedHttpError,
  createEmbedTransport,
  createSupportApi,
  projectSupportEvent,
  supportErrorCode,
  type SupportCallbackEvent,
} from "../support.js";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers });

const session = (token: string, ttlMs: number, extra: object = {}) => ({
  session: token,
  expires_at: new Date(Date.now() + ttlMs).toISOString(),
  visitor_token: "sup_vt_x",
  visitor: { kind: "anonymous" },
  profile: { version: 3 },
  ...extra,
});

const base = { baseUrl: "https://hub.example", channel: "sch_A", parentOrigin: "https://tienda.example", sessionPath: "/v1/support/embed/sessions" };
const auth = (f: ReturnType<typeof vi.fn<typeof fetch>>, i: number) => (f.mock.calls[i]![1]!.headers as Record<string, string>).Authorization;

describe("createEmbedTransport", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] }));
  afterEach(() => vi.useRealTimers());

  it("abre sesion con canal, origen y token de visitante, y firma las peticiones", async () => {
    let stored: string | null = "sup_vt_old";
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(201, session("asteby1.s1", 900_000)))
      .mockResolvedValueOnce(json(200, [{ folio: "T-1" }], { "X-Next-Cursor": "c2" }));
    const e = createEmbedTransport({
      ...base,
      fetch: f,
      identity: () => "jwt.firmado",
      locale: "es-MX",
      visitorToken: { get: () => stored, set: (t) => void (stored = t), clear: () => void (stored = null) },
    });
    const info = await e.start();
    const open = JSON.parse(String(f.mock.calls[0]![1]!.body));
    expect(open).toEqual({ channel: "sch_A", parent_origin: "https://tienda.example", visitor_token: "sup_vt_old", identity: "jwt.firmado", locale: "es-MX" });
    expect(info.identified).toBe(true);
    expect(stored).toBe("sup_vt_x");
    // El token de sesion no aparece en lo que ve el frame.
    expect(JSON.stringify(info)).not.toContain("asteby1");

    const api = createSupportApi(e.transport, { basePath: "/v1/support/embed" });
    const page = await api.listCases({ limit: 5 });
    expect(page.nextCursor).toBe("c2");
    const [url, init] = f.mock.calls[1]!;
    expect(url).toBe("https://hub.example/v1/support/embed/cases?limit=5");
    expect(auth(f, 1)).toBe("Bearer asteby1.s1");
    expect(init!.credentials).toBe("omit");
    e.stop();
  });

  it("renueva al 80 % del TTL antes de que venza y usa la sesion nueva", async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(201, session("s1", 100_000)))
      .mockResolvedValueOnce(json(201, session("s2", 100_000)))
      .mockResolvedValue(json(200, []));
    const onSession = vi.fn();
    const e = createEmbedTransport({ ...base, fetch: f, onSession });
    await e.start();
    expect(f).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(79_000);
    expect(f).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(f).toHaveBeenCalledTimes(2);
    expect(onSession).toHaveBeenCalledTimes(2);
    await createSupportApi(e.transport, { basePath: "/v1/support/embed" }).listCases();
    expect(auth(f, 2)).toBe("Bearer s2");
    e.stop();
  });

  it("si la sesion paso del 80 % la renueva antes de la peticion (una sola apertura concurrente)", async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(201, session("s1", 100_000)))
      .mockResolvedValueOnce(json(201, session("s2", 100_000)))
      .mockResolvedValue(json(200, []));
    const e = createEmbedTransport({ ...base, fetch: f });
    await e.start();
    e.stop(); // sin temporizador: la renovacion debe venir de la peticion
    vi.setSystemTime(Date.now() + 85_000);
    const api = createSupportApi(e.transport, { basePath: "/b" });
    await Promise.all([api.listCases(), api.listCases()]);
    expect(f.mock.calls.filter((c) => String(c[0]).endsWith("/sessions"))).toHaveLength(2);
    e.stop();
  });

  it("ante 401 session_expired abre una sesion nueva y reintenta una vez", async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(201, session("s1", 900_000)))
      .mockResolvedValueOnce(json(401, { error: { code: "session_expired", message: "x" } }))
      .mockResolvedValueOnce(json(201, session("s2", 900_000)))
      .mockResolvedValueOnce(json(200, []));
    const e = createEmbedTransport({ ...base, fetch: f });
    await createSupportApi(e.transport, { basePath: "/b" }).listCases();
    expect(auth(f, 3)).toBe("Bearer s2");
    e.stop();
  });

  it("rechazo de origen: el error conserva el codigo para la UI y no hay peticiones de datos", async () => {
    const f = vi.fn<typeof fetch>().mockImplementation(async () => json(403, { error: { code: "origin_not_allowed", message: "no" } }));
    const e = createEmbedTransport({ ...base, fetch: f });
    const err = await e.start().catch((x) => x);
    expect(err).toBeInstanceOf(EmbedHttpError);
    expect(err.status).toBe(403);
    expect(supportErrorCode(err)).toBe("origin_not_allowed");
    await expect(createSupportApi(e.transport, { basePath: "/b" }).listCases()).rejects.toBeInstanceOf(EmbedHttpError);
    expect(f.mock.calls.every((c) => String(c[0]).endsWith("/sessions"))).toBe(true);
  });

  it("adapta crear caso y enviar mensaje a la API del widget; already_resolved pasa a case_resolved", async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(201, session("s1", 900_000)))
      .mockResolvedValueOnce(json(201, { case_id: "c1", folio: "T-1", subject: "s", status: "open", messages: [] }))
      .mockResolvedValueOnce(json(202, undefined))
      .mockResolvedValueOnce(json(409, { error: { code: "already_resolved", message: "x" } }));
    const e = createEmbedTransport({ ...base, fetch: f, newId: () => "cm_1" });
    const api = createSupportApi(e.transport, { basePath: "/v1/support/embed" });
    await api.createCase({ subject: "s", description: "hola" });
    expect(JSON.parse(String(f.mock.calls[1]![1]!.body))).toMatchObject({ subject: "s", body: "hola", client_message_id: "cm_1" });
    const m = await api.sendMessage("c1", { clientMessageId: "cm_2", body: "otra" });
    expect(m).toMatchObject({ id: "cm_2", author_type: "reporter", body: "otra" });
    const err = await api.sendMessage("c1", { clientMessageId: "cm_3", body: "x" }).catch((x) => x);
    expect(supportErrorCode(err)).toBe("case_resolved");
    e.stop();
  });

  it("logout borra el token de visitante y olvida la sesion", async () => {
    let stored: string | null = null;
    const f = vi.fn<typeof fetch>().mockImplementation(async () => json(201, session("s1", 900_000)));
    const e = createEmbedTransport({ ...base, fetch: f, visitorToken: { get: () => stored, set: (t) => void (stored = t), clear: () => void (stored = null) } });
    await e.start();
    expect(stored).toBe("sup_vt_x");
    e.logout();
    expect(stored).toBeNull();
    expect(e.info()).toBeUndefined();
  });

  it("rechaza una baseUrl que no sea http(s) y una respuesta de sesion invalida", async () => {
    expect(() => createEmbedTransport({ ...base, baseUrl: "javascript:alert(1)" })).toThrow();
    const f = vi.fn<typeof fetch>().mockImplementation(async () => json(201, { session: "" }));
    await expect(createEmbedTransport({ ...base, fetch: f }).start()).rejects.toBeInstanceOf(EmbedHttpError);
  });

  it("lee el SSE con fetch y entrega solo los eventos validos", async () => {
    vi.useRealTimers();
    const enc = new TextEncoder();
    const sse = new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(enc.encode('data: {"event":"desk_message","ticket_folio":"T-1","body":"hola"}\n\n: ping\n\ndata: no-json\n\n'));
          c.close();
        },
      }),
      { status: 200 },
    );
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(201, session("s1", 900_000)))
      .mockResolvedValueOnce(sse)
      .mockImplementation(() => new Promise(() => {}));
    const e = createEmbedTransport({ ...base, fetch: f });
    const got: SupportCallbackEvent[] = [];
    const off = e.events("/v1/support/embed")("c1", (ev) => got.push(ev));
    await vi.waitFor(() => expect(got).toHaveLength(1));
    expect(got[0]).toMatchObject({ event: "desk_message", body: "hola" });
    expect(String(f.mock.calls[1]![0])).toBe("https://hub.example/v1/support/embed/cases/c1/events");
    off();
    e.stop();
  });
});

describe("projectSupportEvent", () => {
  const ev = (over: Partial<SupportCallbackEvent>): SupportCallbackEvent =>
    ({ event: "desk_message", ticket_folio: "T", issue_url: "", issue_number: 0, comment: "", solution: "", delivery_id: "d1", timestamp: 1764065200, ...over }) as SupportCallbackEvent;

  it("sigue la proyeccion del kernel: autor, cuerpo y estado por evento", () => {
    expect(projectSupportEvent(ev({ body: "a" }))).toMatchObject({ known: true, message: { id: "d1", author_type: "agent", body: "a" } });
    expect(projectSupportEvent(ev({ event: "issue_commented", comment: "c" })).message).toMatchObject({ author_type: "agent", body: "c" });
    expect(projectSupportEvent(ev({ event: "ai_action", body: "ia" })).message?.author_type).toBe("ai");
    expect(projectSupportEvent(ev({ event: "desk_resolved", solution: "listo" }))).toMatchObject({ status: "resolved", message: { author_type: "system", body: "listo" } });
    expect(projectSupportEvent(ev({ event: "issue_closed", comment: "cerrado" }))).toMatchObject({ status: "closed", message: { body: "cerrado" } });
    expect(projectSupportEvent(ev({ event: "desk_reopened" }))).toEqual({ known: true, status: "open", message: undefined });
  });

  it("visitor_erased es conocido y no proyecta; lo desconocido no es conocido", () => {
    expect(projectSupportEvent(ev({ event: "visitor_erased" }))).toEqual({ known: true });
    expect(projectSupportEvent(ev({ event: "algo_nuevo" }))).toEqual({ known: false });
  });
});
