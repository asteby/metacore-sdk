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

const spec = (over: Partial<FrontendSpec> = {}, n = 0) =>
  ({ entry: `/r${n}.js`, format: "federation", container: `c_${n}`, ...over }) as FrontendSpec;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as any).window;
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

  it("requireIntegrity con integrity carga", async () => {
    const { Comp } = stubContainer("c_3");
    await expect(
      loadFederatedAddon(spec({ integrity: "sha384-abc" }, 3), "k", undefined, {
        requireIntegrity: true,
      }),
    ).resolves.toBe(Comp);
  });

  it("requireIntegrity no se satisface con una carga previa sin integrity (caché)", async () => {
    stubContainer("c_4");
    await loadFederatedAddon(spec({}, 4), "k");
    await expect(
      loadFederatedAddon(spec({}, 4), "k", undefined, { requireIntegrity: true }),
    ).rejects.toThrow(/requireIntegrity/);
  });

  it("timeoutMs rechaza un remoto colgado y libera la caché para reintentar", async () => {
    let hang = true;
    const { Comp } = stubContainer("c_5", {
      init: () => (hang ? new Promise<void>(() => {}) : Promise.resolve()),
    });
    const p = loadFederatedAddon(spec({}, 5), "k", undefined, { timeoutMs: 500 });
    const caught = p.catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(501);
    expect((await caught).message).toMatch(/did not load within 500 ms/);
    hang = false;
    await expect(
      loadFederatedAddon(spec({}, 5), "k", undefined, { timeoutMs: 500 }),
    ).resolves.toBe(Comp);
  });

  it("timeoutMs no afecta a una carga que termina a tiempo", async () => {
    const { Comp } = stubContainer("c_6");
    await expect(
      loadFederatedAddon(spec({}, 6), "k", undefined, { timeoutMs: 500 }),
    ).resolves.toBe(Comp);
    await vi.advanceTimersByTimeAsync(1000); // sin rechazos tardíos
  });
});
