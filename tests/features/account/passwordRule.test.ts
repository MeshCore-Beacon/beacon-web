import { describe, expect, it } from "vitest";
import { newPasswordOk, passwordTooLong } from "../../../src/features/account/passwordRule";

describe("newPasswordOk", () => {
  it("needs 12 characters, counted as characters and after NFC", () => {
    expect(newPasswordOk("a".repeat(11))).toBe(false);
    expect(newPasswordOk("a".repeat(12))).toBe(true);
    expect(newPasswordOk("éàùèâêîôûëïü")).toBe(true); // 12 characters, 24 bytes
    expect(newPasswordOk("😀".repeat(11))).toBe(false); // 11 characters, 22 UTF-16 units
    expect(newPasswordOk("😀".repeat(12))).toBe(true);
    expect(newPasswordOk("e\u0301".repeat(11))).toBe(false); // 22 code points, 11 characters after NFC
    expect(newPasswordOk("e\u0301".repeat(12))).toBe(true);
  });

  it("allows at most 128 bytes", () => {
    expect(newPasswordOk("a".repeat(128))).toBe(true);
    expect(newPasswordOk("a".repeat(129))).toBe(false);
    expect(newPasswordOk("é".repeat(64))).toBe(true); // 128 bytes
    expect(newPasswordOk("é".repeat(65))).toBe(false);
  });
});

describe("passwordTooLong", () => {
  it("is true only past 128 bytes", () => {
    expect(passwordTooLong("a".repeat(128))).toBe(false);
    expect(passwordTooLong("a".repeat(129))).toBe(true);
    expect(passwordTooLong("é".repeat(65))).toBe(true);
  });
});
