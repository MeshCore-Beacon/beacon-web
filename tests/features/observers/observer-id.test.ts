import { describe, it, expect } from "vitest";
import { OBSERVER_UUID } from "../../../src/features/observers/observer-id";

describe("OBSERVER_UUID", () => {
  it("matches a well-formed UUID, case-insensitively", () => {
    expect(OBSERVER_UUID.test("3fa85f64-5717-4562-b3fc-2c963f66afa6")).toBe(true);
    expect(OBSERVER_UUID.test("3FA85F64-5717-4562-B3FC-2C963F66AFA6")).toBe(true);
  });

  it("rejects the nil UUID and malformed strings", () => {
    expect(OBSERVER_UUID.test("00000000-0000-0000-0000-000000000000")).toBe(false);
    expect(OBSERVER_UUID.test("not-a-uuid")).toBe(false);
  });
});
