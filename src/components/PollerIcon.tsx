// Poller "pulse" glyph. Matches the map's poller pip (POLLER_COLOR #ffb454 in
// features/map/node-icons.ts), kept as a literal hex so the nodes bundle doesn't pull in map code.
export function PollerIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" aria-hidden="true" className={className}>
      <path d="M2 12H7L10 5L14.5 19L17.5 12H22" stroke="#ffb454" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
