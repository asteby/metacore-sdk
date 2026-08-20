import { describe, expect, it } from "vitest";
import type { ComponentType } from "react";
import {
  registerActionComponent,
  getActionComponent,
  unregisterActionComponent,
  unregisterActionComponentsByOwner,
  hasActionComponent,
} from "../action-registry";

const A: ComponentType<never> = () => null;
const B: ComponentType<never> = () => null;

describe("unregisterActionComponentsByOwner", () => {
  it("drops only components tagged with that owner", () => {
    registerActionComponent("Sale", "void", A, "pos");
    registerActionComponent("Ticket", "bump", B, "kds");
    expect(hasActionComponent("Sale", "void")).toBe(true);
    expect(unregisterActionComponentsByOwner("pos")).toBe(1);
    expect(getActionComponent("Sale", "void")).toBeUndefined();
    expect(getActionComponent("Ticket", "bump")).toBe(B);
    unregisterActionComponent("Ticket", "bump");
  });

  it("leaves unscoped registrations in place", () => {
    registerActionComponent("Legacy", "x", A);
    expect(unregisterActionComponentsByOwner("pos")).toBe(0);
    expect(hasActionComponent("Legacy", "x")).toBe(true);
    unregisterActionComponent("Legacy", "x");
  });
});
