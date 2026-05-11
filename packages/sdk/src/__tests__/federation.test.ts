import { describe, expect, it } from "vitest";
import { withVersionParam, containerName } from "../federation";
import type { FrontendSpec } from "../types";

describe("withVersionParam", () => {
  it("appends ?v=<hash8> to a URL with no query", () => {
    expect(
      withVersionParam(
        "/api/addons/pos/frontend/remoteEntry.js",
        "sha256:abcdef1234",
      ),
    ).toBe("/api/addons/pos/frontend/remoteEntry.js?v=abcdef12");
  });

  it("appends &v=<hash8> when other query params exist", () => {
    expect(withVersionParam("/r.js?foo=1&bar=2", "abcdef1234")).toBe(
      "/r.js?foo=1&bar=2&v=abcdef12",
    );
  });

  it("replaces a prior v= entry instead of accumulating", () => {
    expect(withVersionParam("/r.js?v=oldhash&foo=1", "newhash99")).toBe(
      "/r.js?foo=1&v=newhash9",
    );
  });

  it("preserves the URL fragment", () => {
    expect(withVersionParam("/r.js#section", "abcdef1234")).toBe(
      "/r.js?v=abcdef12#section",
    );
  });

  it("is idempotent for the same hash", () => {
    const once = withVersionParam("/r.js", "abcdef1234");
    const twice = withVersionParam(once, "abcdef1234");
    expect(twice).toBe(once);
  });

  it("returns the URL unchanged for falsy hash", () => {
    expect(withVersionParam("/r.js", undefined)).toBe("/r.js");
    expect(withVersionParam("/r.js", "")).toBe("/r.js");
  });

  it("lower-cases hex digests and strips the algorithm prefix", () => {
    expect(withVersionParam("/r.js", "SHA256:ABCDEF1234")).toBe(
      "/r.js?v=abcdef12",
    );
  });
});

describe("containerName", () => {
  it("prefers the explicit container field", () => {
    const spec = {
      entry: "/r.js",
      format: "federation",
      container: "my_explicit_name",
    } as FrontendSpec;
    expect(containerName(spec, "tickets")).toBe("my_explicit_name");
  });

  it("derives metacore_<key> when container is unset", () => {
    const spec = {
      entry: "/r.js",
      format: "federation",
    } as FrontendSpec;
    expect(containerName(spec, "tickets")).toBe("metacore_tickets");
  });

  it("sanitizes non-alphanumeric chars in the key", () => {
    const spec = {
      entry: "/r.js",
      format: "federation",
    } as FrontendSpec;
    expect(containerName(spec, "kitchen-display.v2")).toBe(
      "metacore_kitchen_display_v2",
    );
  });

  it("throws when neither container nor addonKey are usable", () => {
    const spec = {
      entry: "/r.js",
      format: "federation",
    } as FrontendSpec;
    expect(() => containerName(spec)).toThrow(/cannot derive/i);
  });
});
