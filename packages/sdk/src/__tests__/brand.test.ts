import { describe, expect, it } from "vitest";
import { BRAND_PATH, BRAND_SPEC, brandAssetURL, brandStorageKey, fetchBrand, parseBrand, pickLogo } from "../brand";

describe("brandAssetURL", () => {
  it("joins origin and kind without a trailing slash", () => {
    expect(brandAssetURL("https://pitsline.asteby.com", "logo")).toBe(
      "https://pitsline.asteby.com/api/brand/logo",
    );
    expect(brandAssetURL("https://ops.asteby.com/", "icon")).toBe(
      "https://ops.asteby.com/api/brand/icon",
    );
  });

  it("defaults to the square icon", () => {
    expect(brandAssetURL("https://link.asteby.com")).toBe(
      "https://link.asteby.com/api/brand/icon",
    );
  });

  it("keeps the public path and spec stable", () => {
    expect(BRAND_PATH).toBe("/api/brand");
    expect(BRAND_SPEC).toBe(1);
  });
});

const base = {
  spec: 1,
  key: "demo",
  name: "Demo",
  assets: { icon: { url: "/api/brand/icon?v=abc", type: "image/svg+xml" } },
};

describe("parseBrand", () => {
  it("accepts a minimal spec-1 manifest and resolves relative URLs", () => {
    const m = parseBrand(base, "https://x.test/");
    expect(m?.assets.icon.url).toBe("https://x.test/api/brand/icon?v=abc");
    expect(m?.theme).toBeUndefined();
  });

  it("rejects other specs and missing icon", () => {
    expect(parseBrand({ ...base, spec: 2 })).toBeNull();
    expect(parseBrand({ ...base, assets: {} })).toBeNull();
    expect(parseBrand(null)).toBeNull();
  });

  it("sanitises colours and ignores unknown fields", () => {
    const m = parseBrand({
      ...base,
      color: "#ABC",
      extra: 1,
      theme: { primary: "red", accent: "#00FCFF", gradient: ["#00fcff", "#0033f0"], dark: { background: "#020846" } },
    });
    expect(m?.color).toBe("#aabbcc");
    expect(m?.theme?.primary).toBeUndefined();
    expect(m?.theme?.accent).toBe("#00fcff");
    expect(m?.theme?.gradient).toEqual(["#00fcff", "#0033f0"]);
    expect(m?.theme?.dark?.background).toBe("#020846");
    expect(m as unknown as Record<string, unknown>).not.toHaveProperty("extra");
  });
});

describe("fetchBrand", () => {
  it("fetches /api/brand on the origin", async () => {
    const calls: string[] = [];
    const f = (async (url: string) => {
      calls.push(url);
      return { ok: true, status: 200, json: async () => base };
    }) as unknown as typeof fetch;
    const m = await fetchBrand("https://x.test/", { fetch: f });
    expect(calls).toEqual(["https://x.test/api/brand"]);
    expect(m.key).toBe("demo");
  });

  it("throws on HTTP errors and invalid payloads", async () => {
    const bad = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
    await expect(fetchBrand("", { fetch: bad })).rejects.toThrow();
    const inv = (async () => ({ ok: true, status: 200, json: async () => ({}) })) as unknown as typeof fetch;
    await expect(fetchBrand("", { fetch: inv })).rejects.toThrow();
  });
});

describe("pickLogo / brandStorageKey", () => {
  const m = parseBrand({
    ...base,
    storage_namespace: "ns",
    assets: {
      icon: { url: "/i", type: "image/svg+xml" },
      logo: { url: "/l", type: "image/svg+xml" },
      logo_dark: { url: "/ld", type: "image/svg+xml" },
    },
  })!;
  it("falls back logo_dark -> logo -> icon", () => {
    expect(pickLogo(m, "dark").url).toBe("/ld");
    expect(pickLogo(m, "light").url).toBe("/l");
    expect(pickLogo({ ...m, assets: { icon: m.assets.icon } }, "dark").url).toBe("/i");
    expect(pickLogo(m, "light", "mark").url).toBe("/i");
    expect(pickLogo(m, "dark", "animated")).toBeNull();
  });
  it("namespaces storage keys", () => {
    expect(brandStorageKey(m, "draft")).toBe("ns:draft");
    expect(brandStorageKey({ key: "k" }, "draft")).toBe("k:draft");
  });
});
