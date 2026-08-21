import { describe, expect, it } from "vitest";
import { BRAND_PATH, BRAND_SPEC, brandAssetURL } from "../brand";

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
