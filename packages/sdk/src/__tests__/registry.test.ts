import { describe, expect, it } from "vitest";
import type { ComponentType } from "react";
import { Registry } from "../registry";

// Dummy components — Registry doesn't render, it just stores/sorts.
const A: ComponentType<unknown> = () => null;
const B: ComponentType<unknown> = () => null;
const C: ComponentType<unknown> = () => null;
const D: ComponentType<unknown> = () => null;

describe("Registry.registerSlot priority ordering", () => {
  it("renders higher priority first (DESC) — canonical contract", () => {
    const r = new Registry();
    r.registerSlot({ name: "dashboard.widgets", component: A, priority: 1 });
    r.registerSlot({ name: "dashboard.widgets", component: B, priority: 5 });
    r.registerSlot({ name: "dashboard.widgets", component: C, priority: 3 });

    const items = r.getSlot("dashboard.widgets");
    expect(items.map((i) => i.priority)).toEqual([5, 3, 1]);
    expect(items.map((i) => i.component)).toEqual([B, C, A]);
  });

  it("treats missing priority as 0 (renders after positive priorities)", () => {
    const r = new Registry();
    r.registerSlot({ name: "s", component: A });
    r.registerSlot({ name: "s", component: B, priority: 10 });
    r.registerSlot({ name: "s", component: C, priority: -5 });

    const items = r.getSlot("s");
    expect(items.map((i) => i.component)).toEqual([B, A, C]);
  });

  it("preserves insertion order on ties (Array.sort is stable on V8)", () => {
    const r = new Registry();
    r.registerSlot({ name: "s", component: A, priority: 1 });
    r.registerSlot({ name: "s", component: B, priority: 1 });
    r.registerSlot({ name: "s", component: C, priority: 2 });
    r.registerSlot({ name: "s", component: D, priority: 1 });

    const items = r.getSlot("s");
    expect(items.map((i) => i.component)).toEqual([C, A, B, D]);
  });

  it("keeps slots isolated by name", () => {
    const r = new Registry();
    r.registerSlot({ name: "a", component: A, priority: 1 });
    r.registerSlot({ name: "b", component: B, priority: 99 });

    expect(r.getSlot("a")).toHaveLength(1);
    expect(r.getSlot("b")).toHaveLength(1);
    expect(r.getSlot("missing")).toEqual([]);
  });

  it("emits a slot event on every registration", () => {
    const r = new Registry();
    const seen: string[] = [];
    r.subscribe((e) => {
      if (e.type === "slot") seen.push(e.contribution.name);
    });
    r.registerSlot({ name: "x", component: A, priority: 1 });
    r.registerSlot({ name: "y", component: B, priority: 2 });
    expect(seen).toEqual(["x", "y"]);
  });
});

describe("Registry.scope + unbind", () => {
  it("drops only the scoped addon's contributions", () => {
    const r = new Registry();
    r.scope("pos").registerRoute({ path: "/pos", component: A });
    r.scope("pos").registerAction({ model: "Sale", action: "void", component: A as never });
    r.scope("pos").registerSlot({ name: "dashboard.widgets", component: A, priority: 1 });
    r.scope("kds").registerRoute({ path: "/kds", component: B });
    r.scope("kds").registerSlot({ name: "dashboard.widgets", component: B, priority: 2 });

    expect(r.getRoutes().map((x) => x.path)).toEqual(["/pos", "/kds"]);
    const removed = r.unbind("pos");
    expect(removed).toBe(3);
    expect(r.getRoutes().map((x) => x.path)).toEqual(["/kds"]);
    expect(r.getSlot("dashboard.widgets").map((s) => s.component)).toEqual([B]);
    expect(r.getAction("Sale", "void")).toBeUndefined();
  });

  it("is idempotent and emits a single unbind event per actual removal", () => {
    const r = new Registry();
    const events: string[] = [];
    r.subscribe((e) => events.push(e.type));
    r.scope("pos").registerModal({ slug: "pos.pay", component: A as never });
    expect(r.unbind("pos")).toBe(1);
    expect(r.unbind("pos")).toBe(0);
    expect(events.filter((t) => t === "unbind")).toEqual(["unbind"]);
  });

  it("leaves unscoped (legacy) contributions in place", () => {
    const r = new Registry();
    r.registerRoute({ path: "/legacy", component: A });
    r.scope("pos").registerRoute({ path: "/pos", component: B });
    r.unbind("pos");
    expect(r.getRoutes().map((x) => x.path)).toEqual(["/legacy"]);
  });
});
