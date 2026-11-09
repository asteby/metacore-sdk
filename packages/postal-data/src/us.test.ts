import { describe, expect, it } from "vitest";
import { lookupUsPostalCode } from "./us";

describe("catálogo de ZIP de EE. UU.", () => {
  it("un ZIP válido da estado (nombre completo) y ciudad", async () => {
    expect(await lookupUsPostalCode("10001")).toEqual({ province: "New York", city: "New York" });
    expect(await lookupUsPostalCode("78701")).toEqual({ province: "Texas", city: "Austin" });
    expect(await lookupUsPostalCode("20001")).toMatchObject({ province: "District of Columbia" });
  });
  it("ZIP+4 usa los 5 primeros dígitos", async () => {
    expect(await lookupUsPostalCode(" 10001-1234 ")).toEqual({ province: "New York", city: "New York" });
  });
  it("inválido o desconocido da null", async () => {
    for (const z of ["", "1000", "100011", "abcde", "10001-12", "00000", "constructor"]) expect(await lookupUsPostalCode(z)).toBeNull();
  });
});
