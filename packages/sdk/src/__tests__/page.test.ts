import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_BUDGET_KB,
  PAGE_SHARES,
  definePage,
  effectivePageLayout,
  findPage,
  isAddonPage,
  isPageShare,
  pageBudgetKB,
  pageMountPath,
  resolveAddonUrl,
  resolvePageModule,
  type AddonPageProps,
  type FrontendPage,
} from "../page";
import { MaxPageBudgetKB } from "../generated/manifest-v3";

const tower: FrontendPage = {
  key: "control_tower",
  path: "control-tower",
  expose: "./pages/control-tower",
  title: "shipping.pages.control_tower",
};
const kiosk: FrontendPage = {
  key: "kiosk",
  path: "kiosk",
  expose: "./pages/kiosk",
  title: "shipping.pages.kiosk",
  layout: "immersive",
};
const daily: FrontendPage = {
  key: "daily",
  path: "control-tower/daily",
  expose: "./pages/daily",
  title: "shipping.pages.daily",
};

describe("definePage", () => {
  it("tags the component and keeps its identity", () => {
    function Tower(_: AddonPageProps) {
      return null;
    }
    const page = definePage(Tower);
    expect(page).toBe(Tower);
    expect(isAddonPage(page)).toBe(true);
    expect(isAddonPage(() => null)).toBe(false);
    expect(page.displayName).toBe("Tower");
  });

  it("rejects non-components", () => {
    expect(() => definePage(42 as never)).toThrow(/React component/);
  });
});

describe("resolvePageModule", () => {
  const C = definePage(() => null);
  it("accepts default, nested default and bare components", () => {
    expect(resolvePageModule({ default: C })).toBe(C);
    expect(resolvePageModule({ default: { default: C } })).toBe(C);
    expect(resolvePageModule(C)).toBe(C);
  });
  it("accepts memo/forwardRef objects", () => {
    const memo = { $$typeof: Symbol.for("react.memo"), type: C };
    expect(resolvePageModule({ default: memo })).toBe(memo);
  });
  it("explains a missing default export", () => {
    expect(() => resolvePageModule({ Tower: C }, "./pages/x")).toThrow(/\.\/pages\/x.*definePage/);
  });
});

describe("layout and mount path (kernel EffectiveLayout)", () => {
  it("page layout wins, then addon layout, then shell", () => {
    expect(effectivePageLayout(kiosk, "shell")).toBe("immersive");
    expect(effectivePageLayout(tower, "immersive")).toBe("immersive");
    expect(effectivePageLayout(tower, undefined)).toBe("shell");
  });
  it("mounts embedded under /a and full screen under /addons", () => {
    expect(pageMountPath("shipping", tower)).toBe("/a/shipping/control-tower");
    expect(pageMountPath("shipping", kiosk)).toBe("/addons/shipping/kiosk");
  });
  it("finds pages by path ignoring slashes", () => {
    expect(findPage([tower, kiosk], "/kiosk/")).toBe(kiosk);
    expect(findPage(undefined, "x")).toBeUndefined();
  });
});

describe("resolveAddonUrl", () => {
  const frontend = { layout: "shell", pages: [tower, kiosk, daily] };
  it("routes a page by its layout before loading the remote", () => {
    expect(resolveAddonUrl("addon://shipping/control-tower", frontend)).toMatchObject({
      addonKey: "shipping",
      page: tower,
      layout: "shell",
      href: "/a/shipping/control-tower",
    });
    expect(resolveAddonUrl("addon://shipping/kiosk", frontend)?.href).toBe("/addons/shipping/kiosk");
  });
  it("keeps deep links and query, longest page path wins", () => {
    const r = resolveAddonUrl("addon://shipping/control-tower/daily/2026-10-17?carrier=dhl", frontend);
    expect(r?.page).toBe(daily);
    expect(r?.href).toBe("/a/shipping/control-tower/daily/2026-10-17?carrier=dhl");
    expect(resolveAddonUrl("addon://shipping/control-tower/x", frontend)?.page).toBe(tower);
  });
  it("falls back to the addon layout (legacy registerRoute addons stay full screen)", () => {
    expect(resolveAddonUrl("addon://pos/terminal", {})?.href).toBe("/addons/pos/terminal");
    expect(resolveAddonUrl("addon://visor/home", { layout: "shell" })?.href).toBe("/a/visor/home");
  });
  it("ignores non addon URLs", () => {
    expect(resolveAddonUrl("/m/Shipment", frontend)).toBeNull();
  });
});

describe("shares and budget", () => {
  it("PAGE_SHARES is the kernel closed set", () => {
    expect(Object.keys(PAGE_SHARES).sort()).toEqual(
      ["@asteby/metacore-charts", "@asteby/metacore-maps", "maplibre-gl", "recharts"],
    );
    expect(isPageShare("maplibre-gl")).toBe(true);
    expect(isPageShare("leaflet")).toBe(false);
  });
  it("caps budget_kb at the kernel max", () => {
    expect(DEFAULT_PAGE_BUDGET_KB).toBe(MaxPageBudgetKB);
    expect(pageBudgetKB({})).toBe(150);
    expect(pageBudgetKB({ budget_kb: 120 })).toBe(120);
    expect(pageBudgetKB({ budget_kb: 999 })).toBe(150);
  });
});
