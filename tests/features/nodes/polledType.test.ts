import { describe, expect, it } from "vitest";
import { isPolledNodeType } from "../../../src/features/nodes/polledType";

describe("isPolledNodeType", () => {
  it("accepts repeaters and room servers, any case", () => {
    expect(isPolledNodeType("repeater")).toBe(true);
    expect(isPolledNodeType("Room_Server")).toBe(true);
  });
  it("rejects other types and missing names", () => {
    expect(isPolledNodeType("companion")).toBe(false);
    expect(isPolledNodeType(undefined)).toBe(false);
    expect(isPolledNodeType("")).toBe(false);
  });
});
