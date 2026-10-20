import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { EmojiText } from "../../src/components/EmojiText";

const glyphs = (text: string) => {
  const { container } = render(<p><EmojiText text={text} /></p>);
  const p = container.querySelector("p")!;
  return { text: p.textContent, wrapped: [...p.querySelectorAll(".emoji-glyph")].map((s) => s.textContent) };
};

describe("EmojiText", () => {
  it("leaves plain names as bare text", () => {
    const { container } = render(<p><EmojiText text="VE3EJP Repeater" /></p>);
    expect(container.querySelector("p")!.innerHTML).toBe("VE3EJP Repeater");
  });

  it("wraps an emoji-presentation sequence and keeps the text around it", () => {
    expect(glyphs("☠️Grunt031 Solar 1W")).toEqual({ text: "☠️Grunt031 Solar 1W", wrapped: ["☠️"] });
    expect(glyphs("🍓Strawberry")).toEqual({ text: "🍓Strawberry", wrapped: ["🍓"] });
  });

  it("wraps neighbouring emoji one by one, each with its own room", () => {
    expect(glyphs("❄️🧊TP-Subcooled").wrapped).toEqual(["❄️", "🧊"]);
  });

  it("keeps joined, flag and skin-tone sequences whole", () => {
    expect(glyphs("👨‍👩‍👧 🇨🇦 👍🏽 1️⃣").wrapped).toEqual(["👨‍👩‍👧", "🇨🇦", "👍🏽", "1️⃣"]);
  });

  it("leaves symbols that draw as text in the name's own font alone", () => {
    expect(glyphs("☠︎ ☠ © ™ #1").wrapped).toEqual([]);
  });

  it("keeps line breaks in message text", () => {
    expect(glyphs("🟠\nDWD aktuell").text).toBe("🟠\nDWD aktuell");
  });
});
