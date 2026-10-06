import { describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import { Registry } from "../registry";
import {
  adaptActionProps,
  getActionComponent,
  getModalComponent,
  listRecordActions,
  registerModalComponent,
  registerRecordAction,
} from "../action-registry";
import { slotStore } from "../slot-store";

const C: ComponentType<any> = () => null;

describe("Registry escribe en los stores canónicos", () => {
  it("registerModal publica el slug con su addon dueño (antes nadie lo leía)", () => {
    const reg = new Registry();
    reg.scope("fiscal_mexico").registerModal({ slug: "fiscal_mexico.import_cfdi", component: C });
    expect(getModalComponent("fiscal_mexico.import_cfdi")).toMatchObject({ owner: "fiscal_mexico", component: C });
    reg.unbind("fiscal_mexico");
    expect(getModalComponent("fiscal_mexico.import_cfdi")).toBeUndefined();
  });

  it("registerAction deja el componente al dispatcher sin puente del host", () => {
    const reg = new Registry();
    reg.scope("pos").registerAction({ model: "POSSession", action: "close", component: C });
    expect(getActionComponent("POSSession", "close")).toBeDefined();
    reg.unbind("pos");
    expect(getActionComponent("POSSession", "close")).toBeUndefined();
  });

  it("registerSlot llega al slotStore que pinta runtime-react", () => {
    const reg = new Registry();
    reg.scope("returns").registerSlot({ name: "invoice.footer", component: C, priority: 2 });
    expect(slotStore.get("invoice.footer").map((e) => e.owner)).toEqual(["returns"]);
    reg.unbind("returns");
    expect(slotStore.get("invoice.footer")).toEqual([]);
  });

  it("registerRecordAction queda con dueño y unbind la quita aunque no haya otra contribución", () => {
    const reg = new Registry();
    const events: string[] = [];
    reg.subscribe((e) => events.push(e.type));
    reg.scope("link").registerRecordAction({ id: "link.send", label: "Enviar", run: () => {} });
    expect(listRecordActions().map((a) => [a.contribution.id, a.owner])).toEqual([["link.send", "link"]]);
    reg.unbind("link");
    expect(listRecordActions()).toEqual([]);
    expect(events).toContain("unbind");
  });
});

describe("registerModalComponent", () => {
  it("deduce el dueño del slug y el disposer no borra un reemplazo", () => {
    const off = registerModalComponent({ slug: "returns.settle", load: async () => ({ default: C }) });
    expect(getModalComponent("returns.settle")?.owner).toBe("returns");
    const off2 = registerModalComponent({ slug: "returns.settle", component: C });
    off();
    expect(getModalComponent("returns.settle")?.component).toBe(C);
    off2();
    expect(getModalComponent("returns.settle")).toBeUndefined();
  });

  it("exige component o load", () => {
    expect(() => registerModalComponent({ slug: "x.y" })).toThrow();
  });
});

describe("listRecordActions", () => {
  it("snapshot estable entre lecturas y nuevo al cambiar", () => {
    const a = listRecordActions();
    expect(listRecordActions()).toBe(a);
    const off = registerRecordAction({ id: "core.print", run: () => {} });
    const b = listRecordActions();
    expect(b).not.toBe(a);
    off();
    expect(listRecordActions()).toEqual([]);
  });
});

describe("adaptActionProps", () => {
  it("entrega recordId/payload/close y close(ok) dispara onSuccess", () => {
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();
    const p = adaptActionProps({
      open: true,
      onOpenChange,
      onSuccess,
      action: { key: "k", label: "K", icon: "Zap" },
      model: "M",
      record: { id: 7, name: "x" },
    });
    expect(p.recordId).toBe("7");
    expect(p.payload).toEqual({ id: 7, name: "x" });
    p.close({ ok: true });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    p.close();
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});

