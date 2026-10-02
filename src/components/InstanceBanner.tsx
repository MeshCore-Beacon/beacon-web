// [label](url) or a bare URL; trailing punctuation and closing parens stay outside a bare link
const LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s()]*[^\s().,;:!?])/g;

// Deployment-wide notice set by VITE_BANNER, e.g. flagging the dev instance.
export function InstanceBanner({ text }: { text: string }) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parts = [];
  let last = 0;
  for (const m of trimmed.matchAll(LINK_PATTERN)) {
    parts.push(trimmed.slice(last, m.index));
    const href = m[2] ?? m[3];
    parts.push(<a key={m.index} href={href} className="underline underline-offset-2 hover:text-text-bright">{m[1] ?? href}</a>);
    last = m.index + m[0].length;
  }
  parts.push(trimmed.slice(last));
  return (
    <div role="note" className="shrink-0 border-b border-warn/30 bg-warn/10 px-4 py-1.5 text-center font-mono text-[12px] text-warn">
      {parts}
    </div>
  );
}
