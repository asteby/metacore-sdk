import { describe, expect, it } from "vitest";
import { dataEventMatches, type DataEvent } from "../realtime.js";

const event = (over: Partial<DataEvent> = {}): DataEvent => ({
  org_id: "org-1",
  addon: "customers",
  model: "SalesOrder",
  table: "sales_orders",
  action: "updated",
  id: "row-1",
  at: "2026-08-31T00:00:00Z",
  ...over,
});

describe("dataEventMatches", () => {
  it("matches by model key, table name and qualified addon.Model (case-insensitive)", () => {
    expect(dataEventMatches({ models: ["salesorder"] }, event())).toBe(true);
    expect(dataEventMatches({ models: ["SALES_ORDERS"] }, event())).toBe(true);
    expect(dataEventMatches({ models: ["customers.SalesOrder"] }, event())).toBe(true);
    expect(dataEventMatches({ models: ["Product"] }, event())).toBe(false);
  });

  it("'*' matches every model", () => {
    expect(dataEventMatches({ models: ["*"] }, event({ model: "Anything" }))).toBe(true);
  });

  it("delivers nothing without models (except resync)", () => {
    expect(dataEventMatches({}, event())).toBe(false);
    expect(dataEventMatches({ models: [] }, event())).toBe(false);
    expect(dataEventMatches({}, event({ action: "resync", id: "" }))).toBe(true);
  });

  it("filters by action when events is set, but resync always passes", () => {
    const opts = { models: ["SalesOrder"], events: ["created"] as const };
    expect(dataEventMatches({ ...opts, events: [...opts.events] }, event({ action: "created" }))).toBe(true);
    expect(dataEventMatches({ ...opts, events: [...opts.events] }, event({ action: "updated" }))).toBe(false);
    expect(
      dataEventMatches({ ...opts, events: [...opts.events] }, event({ action: "resync", id: "" })),
    ).toBe(true);
  });

  it("resync only reaches subscribers of that model when models are given", () => {
    expect(
      dataEventMatches({ models: ["Product"] }, event({ action: "resync", model: "salesorder", id: "" })),
    ).toBe(false);
    expect(
      dataEventMatches({ models: ["SalesOrder"] }, event({ action: "resync", model: "salesorder", id: "" })),
    ).toBe(true);
  });

  it("ignores blank tokens", () => {
    expect(dataEventMatches({ models: ["  ", ""] }, event())).toBe(false);
  });
});
