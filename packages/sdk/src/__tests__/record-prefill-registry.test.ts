import { describe, expect, it } from "vitest";
import {
  getRecordPrefills,
  registerRecordPrefill,
  unregisterRecordPrefillsByOwner,
} from "../record-prefill-registry";
import { Registry } from "../registry";

const Dummy = () => null;

describe("record prefill registry", () => {
  it("filtra por modelo (con o sin prefijo de addon) y modo", () => {
    registerRecordPrefill({ id: "t.a", models: ["customers.Customer"], component: Dummy, modes: ["create"] }, "t");
    expect(getRecordPrefills("Customer", "create").map((c) => c.id)).toContain("t.a");
    expect(getRecordPrefills("Customer", "edit").map((c) => c.id)).not.toContain("t.a");
    expect(getRecordPrefills("Supplier", "create").map((c) => c.id)).not.toContain("t.a");
    unregisterRecordPrefillsByOwner("t");
  });

  it("unbind del addon (desinstalar) quita sus prefills", () => {
    const r = new Registry();
    r.scope("fiscal_mexico").registerRecordPrefill({ id: "fiscal_mexico.csf", models: ["Customer"], component: Dummy });
    expect(getRecordPrefills("Customer", "create")).toHaveLength(1);
    expect(r.unbind("fiscal_mexico")).toBe(1);
    expect(getRecordPrefills("Customer", "create")).toHaveLength(0);
  });

  it("ordena por prioridad", () => {
    registerRecordPrefill({ id: "p.low", models: ["Product"], component: Dummy, priority: 1 }, "p");
    registerRecordPrefill({ id: "p.high", models: ["Product"], component: Dummy, priority: 9 }, "p");
    expect(getRecordPrefills("Product", "create").map((c) => c.id)).toEqual(["p.high", "p.low"]);
    unregisterRecordPrefillsByOwner("p");
  });
});
