import { describe, expect, it } from "vitest";
import { formatTemp, fromDisplayTemp, tempSymbol, toDisplayTemp } from "../../src/lib/units";

describe("units", () => {
  it("converts Celsius to the display unit", () => {
    expect(toDisplayTemp(35, "f")).toBeCloseTo(95);
    expect(toDisplayTemp(35, "c")).toBe(35);
  });

  it("converts a display value back to Celsius", () => {
    expect(fromDisplayTemp(95, "f")).toBeCloseTo(35);
    expect(fromDisplayTemp(-40, "f")).toBeCloseTo(-40);
    expect(fromDisplayTemp(12.5, "c")).toBe(12.5);
  });

  it("names the symbol", () => {
    expect(tempSymbol("c")).toBe("°C");
    expect(tempSymbol("f")).toBe("°F");
  });

  it("formats with the symbol", () => {
    expect(formatTemp(16.5, "c")).toBe("16.5 °C");
    expect(formatTemp(16.5, "f")).toBe("61.7 °F");
    expect(formatTemp(16.5, "f", 0)).toBe("62 °F");
  });
});
