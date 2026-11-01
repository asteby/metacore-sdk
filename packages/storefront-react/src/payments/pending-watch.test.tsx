// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { firstSeenAt, formatCountdown, nextCheckDelay, pendingPhase, usePendingPaymentWatch, watchesAttempt, type PendingWatch, type PendingWatchOptions } from "./pending-watch.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("lógica pura de la vigilancia", () => {
  it("solo se vigilan intentos que el banco puede resolver en cualquier momento (no fichas ni revisión de la tienda)", () => {
    for (const attempt of ["requires_action", "processing", "unconfirmed", ""]) expect(watchesAttempt({ attempt, checkoutStatus: "pending", voucherUrl: null })).toBe(true);
    expect(watchesAttempt({ attempt: "pending", checkoutStatus: "pending", voucherUrl: null })).toBe(true);
    expect(watchesAttempt({ attempt: "review", checkoutStatus: "pending", voucherUrl: null })).toBe(false);
    expect(watchesAttempt({ attempt: "requires_action", checkoutStatus: "pending", voucherUrl: "https://x.test/f" })).toBe(false);
    expect(watchesAttempt({ attempt: "requires_action", checkoutStatus: "cancelled", voucherUrl: null })).toBe(false);
  });

  it("pending → timeout: «confirmando» durante la gracia y «sigue abierta» después", () => {
    expect(pendingPhase(0, 149_999, 150_000)).toBe("confirming");
    expect(pendingPhase(0, 150_000, 150_000)).toBe("stuck");
  });

  it("espera creciente entre revisiones; la última se repite", () => {
    expect([0, 1, 2, 3, 4, 9].map((n) => nextCheckDelay(n))).toEqual([5000, 10000, 15000, 30000, 30000, 30000]);
  });

  it("recargar no reinicia la espera; una marca del futuro no cuenta", () => {
    const s = memory();
    expect(firstSeenAt("chk", 1000, s)).toBe(1000);
    expect(firstSeenAt("chk", 90_000, s)).toBe(1000);
    s.setItem("sf:pay:pending-seen:otro", "999999");
    expect(firstSeenAt("otro", 5000, s)).toBe(5000);
    expect(firstSeenAt("sin", 7, null)).toBe(7);
  });

  it("cuenta atrás m:ss", () => {
    expect(formatCountdown(30_000)).toBe("0:30");
    expect(formatCountdown(65_400)).toBe("1:06");
    expect(formatCountdown(-5)).toBe("0:00");
  });
});

describe("usePendingPaymentWatch", () => {
  let root: Root | null = null;
  let host: HTMLElement;
  let state: PendingWatch;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    host = document.createElement("div");
    document.body.appendChild(host);
  });
  afterEach(async () => {
    await act(async () => root?.unmount());
    root = null;
    host.remove();
    vi.useRealTimers();
  });

  // `key` es prop de React: el checkout va como `key` de la vigilancia vía este envoltorio.
  function Host(props: Omit<PendingWatchOptions, "key"> & { checkout: string }) {
    const { checkout, ...rest } = props;
    state = usePendingPaymentWatch({ ...rest, key: checkout });
    return null;
  }
  const render = (props: Omit<PendingWatchOptions, "key">) =>
    act(async () => {
      root ??= createRoot(host);
      root.render(createElement(Host, { checkout: "chk_1", ...props }));
    });

  it("revisa sola con espera creciente y pasa a «sigue abierta» tras la gracia", async () => {
    const check = vi.fn();
    await render({ check, checking: false, enabled: true, storage: memory(), graceMs: 60_000 });
    expect(state.phase).toBe("confirming");
    expect(state.nextCheckInMs).toBe(5000);
    await act(async () => vi.advanceTimersByTime(5000));
    expect(check).toHaveBeenCalledTimes(1);
    // La revisión corre y termina: la siguiente espera 10 s.
    await render({ check, checking: true, enabled: true, storage: memory(), graceMs: 60_000 });
    await render({ check, checking: false, enabled: true, storage: memory(), graceMs: 60_000 });
    expect(state.nextCheckInMs).toBe(10_000);
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(state.phase).toBe("stuck");
  });

  it("el botón nunca se queda girando: una revisión que tarda de más deja de bloquear y se avisa", async () => {
    const check = vi.fn();
    await render({ check, checking: false, enabled: true, storage: memory(), slowMs: 20_000 });
    await act(async () => state.checkNow());
    await render({ check, checking: true, enabled: true, storage: memory(), slowMs: 20_000 });
    expect(state.busy).toBe(true);
    expect(state.slow).toBe(false);
    await act(async () => vi.advanceTimersByTime(21_000));
    expect(state.busy).toBe(false);
    expect(state.slow).toBe(true);
    // Se puede volver a intentar.
    await act(async () => state.checkNow());
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("sin vigilancia (ficha, revisión): no revisa sola ni cambia de fase", async () => {
    const check = vi.fn();
    await render({ check, checking: false, enabled: false, storage: memory(), graceMs: 1000 });
    await act(async () => vi.advanceTimersByTime(120_000));
    expect(check).not.toHaveBeenCalled();
    expect(state.phase).toBe("confirming");
    expect(state.nextCheckInMs).toBeNull();
  });

  it("con la pestaña oculta no revisa; al volver, sí", async () => {
    const check = vi.fn();
    const vis = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await render({ check, checking: false, enabled: true, storage: memory() });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(check).not.toHaveBeenCalled();
    expect(state.nextCheckInMs).toBeNull();
    vis.mockReturnValue("visible");
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => vi.advanceTimersByTime(1000));
    expect(check).toHaveBeenCalledTimes(1);
    vis.mockRestore();
  });
});
