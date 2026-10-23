const graphemes = new Intl.Segmenter();
const DRAWN_AS_EMOJI = /\p{Emoji_Presentation}|️/u; // a bare © or ☠ keeps the text font's own glyph
const PLAIN_ASCII = /^[\x20-\x7e\n\r\t]*$/;

// Splits text into runs of plain text and single emoji, so each emoji can get room to paint (see .emoji-glyph).
export function splitEmoji(text: string): { text: string; emoji: boolean }[] {
  if (PLAIN_ASCII.test(text)) return [{ text, emoji: false }];
  const parts: { text: string; emoji: boolean }[] = [];
  for (const { segment } of graphemes.segment(text)) {
    const last = parts.at(-1);
    if (DRAWN_AS_EMOJI.test(segment)) parts.push({ text: segment, emoji: true });
    else if (last && !last.emoji) last.text += segment;
    else parts.push({ text: segment, emoji: false });
  }
  return parts;
}
