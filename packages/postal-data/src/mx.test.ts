import { describe, expect, it } from "vitest";
import { lookupMxPostalCode } from "./mx";
import catalog from "./data/mx.json";

describe("catálogo local de códigos postales de México (respaldo de OPS)", () => {
  it("06600 es Ciudad de México, Cuauhtémoc, con la colonia Juárez", async () => {
    const info = await lookupMxPostalCode("06600");
    expect(info).toMatchObject({ province: "Ciudad de México", city: "Cuauhtémoc" });
    expect(info?.neighborhoods).toContain("Juárez");
  });

  it("resuelve CP de otros estados con los nombres del paquete de región de OPS", async () => {
    expect(await lookupMxPostalCode("44100")).toMatchObject({ province: "Jalisco", city: "Guadalajara" });
    expect(await lookupMxPostalCode(" 64000 ")).toMatchObject({ province: "Nuevo León", city: "Monterrey" });
    expect((await lookupMxPostalCode("11000"))?.province).toBe("Ciudad de México");
    expect((await lookupMxPostalCode("01000"))?.province).toBe("Ciudad de México");
  });

  it("un CP desconocido (03999) o inválido da null, sin inventar", async () => {
    for (const zip of ["03999", "00000", "0660", "066000", "abcde", "", "06 600", "06600-1", "__proto__", "constructor"]) {
      expect(await lookupMxPostalCode(zip)).toBeNull();
    }
  });

  it("el catálogo trae la atribución CC BY 4.0 y los 32 estados", () => {
    expect(catalog.license).toMatch(/CC BY 4\.0/);
    expect(catalog.attribution).toMatch(/GeoNames/);
    expect(catalog.states).toHaveLength(32);
    expect(catalog.states).not.toContain("Distrito Federal");
    expect(Object.keys(catalog.zips).length).toBeGreaterThan(32000);
  });
});
