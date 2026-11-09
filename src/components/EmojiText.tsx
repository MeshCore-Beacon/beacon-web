import { splitEmoji } from "../lib/emoji";

// user-written text (names, messages): each emoji gets its own span so it can't paint over the next letter
export function EmojiText({ text }: { text: string }) {
  const parts = splitEmoji(text);
  if (!parts.some((part) => part.emoji)) return text;
  return parts.map((part, i) => (part.emoji ? <span key={i} className="emoji-glyph">{part.text}</span> : part.text));
}
