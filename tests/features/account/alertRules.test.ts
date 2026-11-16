import { describe, expect, it } from "vitest";
import { inputsFor, parseInputs } from "../../../src/features/account/alertRules";
import type { AlertRule } from "../../../src/features/account/types";

const rule = (threshold: number | null, thresholdHigh: number | null) => ({ threshold, thresholdHigh }) as AlertRule;

describe("temperature alert limits", () => {
  it("parses whole degrees F into tenths of a degree C", () => {
    expect(parseInputs("temperature", { a: "14", b: "95" }, "f")).toEqual({ ok: true, threshold: -100, thresholdHigh: 350 });
  });

  it("fills whole degrees F from tenths of a degree C", () => {
    expect(inputsFor("temperature", rule(-100, 350), "f")).toEqual({ a: "14", b: "95" });
  });

  it("round trips every whole degree F in range", () => {
    for (let f = -58; f <= 302; f++) {
      const parsed = parseInputs("temperature", { a: String(f), b: "" }, "f");
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      expect(inputsFor("temperature", rule(parsed.threshold, null), "f").a).toBe(String(f));
    }
  });

  it("rejects F limits outside -50 to 150 C", () => {
    expect(parseInputs("temperature", { a: "-59", b: "" }, "f")).toEqual({ ok: false, error: "temperature_range" });
    expect(parseInputs("temperature", { a: "303", b: "" }, "f")).toEqual({ ok: false, error: "temperature_range" });
  });

  it("rejects F limits less than 2 C apart", () => {
    expect(parseInputs("temperature", { a: "70", b: "72" }, "f")).toEqual({ ok: false, error: "temperature_width" });
  });

  it("keeps Celsius parsing at one decimal", () => {
    expect(parseInputs("temperature", { a: "-10.0", b: "40.0" }, "c")).toEqual({ ok: true, threshold: -100, thresholdHigh: 400 });
    expect(inputsFor("temperature", rule(-100, 400), "c")).toEqual({ a: "-10.0", b: "40.0" });
  });
});
