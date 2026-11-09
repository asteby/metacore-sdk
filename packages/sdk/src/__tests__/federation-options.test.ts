import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadFederatedAddon } from "../federation";
import type { FrontendSpec } from "../types";

// El contenedor ya está registrado en `window`, así que el loader no inyecta
// ningún <script>: se prueba solo la política (integrity / timeout / caché).
function stubContainer(name: string, impl: Partial<{ init: () => Promise<void> }> = {}) {
  const Comp = () => null;
  const container = {
    init: impl.init ?? (async () => {}),
    get: async () => () => ({ default: Comp }),
  };
  (globalThis as any).window = { [name]: container };
  return { container, Comp };
}

// Simula la inyeccion de <script>: cada appendChild cuenta un script y, al
// "descargarse", registra el contenedor en `window` y dispara onload.
function fakeDom(name: string, init: () => Promise<void> = async () => {}) {
  const Comp = () => null;
  const scripts: any[] = [];
  const container = { init, get: async () => () => ({ default: Comp }) };
  (globalThis as any).window = {};
  (globalThis as any).document = {
    createElement: () => ({}),
    head: { appendChild: (s: any) => scripts.push(s) },
  };
  const finish = () => {
    (globalThis as any).window[name] = container;
    scripts.forEach((s) => s.onload?.());
  };
  return { scripts, finish, Comp, container };
}


const spec = (over: Partial<FrontendSpec> = {}, n = 0) =>
  ({ entry: `/r${n}.js`, format: "federation", container: `c_${n}`, ...over }) as FrontendSpec;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as any).window;
  delete (globalThis as any).document;
});

describe("loadFederatedAddon options", () => {
  it("por omisión carga sin integrity (comportamiento histórico)", async () => {
    const { Comp } = stubContainer("c_1");
    await expect(loadFederatedAddon(spec({}, 1), "k")).resolves.toBe(Comp);
  });

  it("requireIntegrity sin integrity rechaza y no toca el contenedor", async () => {
    const init = vi.fn(async () => {});
    stubContainer("c_2", { init });
    await expect(
      loadFederatedAddon(spec({}, 2), "k", undefined, { requireIntegrity: true }),
    ).rejects.toThrow(/requireIntegrity/);
    expect(init).not.toHaveBeenCalled();
  });

  it("requireIntegrity con integrity carga inyectando el script con SRI", async () => {
    const d = fakeDom("c_3");
    const p = loadFederatedAddon(spec({ integrity: "sha384-abc" }, 3), "k", undefined, {
      requireIntegrity: true,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(d.scripts).toHaveLength(1);
    expect(d.scripts[0].integrity).toBe("sha384-abc");
    d.finish();
    await expect(p).resolves.toBe(d.Comp);
  });

  it("requireIntegrity no se satisface con un contenedor previo cargado sin integrity", async () => {
    const d = fakeDom("c_4");
    const first = loadFederatedAddon(spec({}, 4), "k");
    await vi.advanceTimersByTimeAsync(0);
    d.finish();
    await expect(first).resolves.toBe(d.Comp);
    await expect(
      loadFederatedAddon(spec({ integrity: "sha384-AAAA" }, 4), "k", undefined, {
        requireIntegrity: true,
      }),
    ).rejects.toThrow(/without verified integrity/);
    await expect(
      loadFederatedAddon(spec({}, 4), "k", undefined, { requireIntegrity: true }),
    ).rejects.toThrow(/requireIntegrity/);
  });

  it("requireIntegrity rechaza un contenedor ajeno ya presente en window", async () => {
    stubContainer("c_7");
    await expect(
      loadFederatedAddon(spec({ integrity: "sha384-abc" }, 7), "k", undefined, {
        requireIntegrity: true,
      }),
    ).rejects.toThrow(/without verified integrity/);
  });

  it("reintento tras timeout con el script en vuelo no inyecta un segundo script ni repite init", async () => {
    const init = vi.fn(async () => {});
    const d = fakeDom("c_8", init);
    const p1 = loadFederatedAddon(spec({}, 8), "k", undefined, { timeoutMs: 100 });
    const c1 = p1.catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(101);
    expect((await c1).message).toMatch(/did not load within/);
    const p2 = loadFederatedAddon(spec({}, 8), "k", undefined, { timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(d.scripts).toHaveLength(1);
    d.finish();
    await expect(p2).resolves.toBe(d.Comp);
    expect(init).toHaveBeenCalledTimes(1);
  });

  it("timeoutMs rechaza un init lento y el reintento reutiliza el mismo init (no lo repite)", async () => {
    let release!: () => void;
    const init = vi.fn(() => new Promise<void>((r) => (release = r)));
    const { Comp } = stubContainer("c_5", { init });
    const p = loadFederatedAddon(spec({}, 5), "k", undefined, { timeoutMs: 500 });
    const caught = p.catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(501);
    expect((await caught).message).toMatch(/did not load within 500 ms/);
    const retry = loadFederatedAddon(spec({}, 5), "k", undefined, { timeoutMs: 500 });
    await vi.advanceTimersByTimeAsync(0);
    release();
    await expect(retry).resolves.toBe(Comp);
    expect(init).toHaveBeenCalledTimes(1);
  });

  it("timeoutMs no afecta a una carga que termina a tiempo", async () => {
    const { Comp } = stubContainer("c_6");
    await expect(
      loadFederatedAddon(spec({}, 6), "k", undefined, { timeoutMs: 500 }),
    ).resolves.toBe(Comp);
    await vi.advanceTimersByTimeAsync(1000); // sin rechazos tardíos
  });
});
