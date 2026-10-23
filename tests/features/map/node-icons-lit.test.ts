import { describe, it, expect } from "vitest";
import { litIconSvg, MAP_ICON_IDS } from "../../../src/features/map/node-icons";

const GLYPH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" style="color:var(--node-color,#38e8ff)"><circle cx="32" cy="32" r="29" stroke="currentColor"></circle><g fill="none" stroke="currentColor" stroke-width="3"><line x1="32" y1="26" x2="32" y2="45"></line><circle cx="32" cy="23" r="2.6" fill="currentColor" stroke="none"></circle></g></svg>`;

describe("litIconSvg", () => {
  const svg = litIconSvg(GLYPH, "#A78BFA");

  it("fills the disc with the type colour and draws the glyph in white", () => {
    expect(svg).toContain('r="29" fill="#A78BFA"');
    expect(svg).toContain('<line x1="32" y1="26" x2="32" y2="45"');
    expect(svg).not.toContain("currentColor");
    expect(svg).toContain('stroke="#ffffff"');
  });

  it("bakes in the orange ring at 16 px radius, 2.5 px stroke in the 88-unit / 36 px box", () => {
    expect(svg).toContain('stroke="#ff6b35"');
    expect(svg).toMatch(/r="39\.1\d*"/); // 16 * 88 / 36
    expect(svg).toMatch(/stroke-width="6\.1\d*"/); // 2.5 * 88 / 36
  });
});

it("registers a lit icon per node type", () => {
  expect(MAP_ICON_IDS).toEqual(
    expect.arrayContaining(["node-lit-repeater", "node-lit-companion", "node-lit-room_server", "node-lit-sensor"]),
  );
});
