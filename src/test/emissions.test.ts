import { describe, it, expect } from "vitest";
import { cell, findMissing } from "@/lib/emissions";

const row = { year: "2023", scope1: 100, scope2_location: null, scope2_market: null, scope2_unspecified: null, scope3: null, unit: "tCO2e", page_reference: null };

describe("missing data", () => {
  it("never fills missing values with 0", () => {
    expect(cell(null)).toBe("MISSING");
    expect(cell(0)).toBe(0);
  });
  it("flags missing Scope 2 and Scope 3 but not reported Scope 1", () => {
    const fields = findMissing([row]).map((m) => m.field);
    expect(fields).toEqual(["Scope 3", "Scope 2"]);
  });
  it("does not flag Scope 2 when only market-based is reported", () => {
    const fields = findMissing([{ ...row, scope2_market: 50 }]).map((m) => m.field);
    expect(fields).not.toContain("Scope 2");
  });
});
