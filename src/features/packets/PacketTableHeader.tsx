import { GRID_TEMPLATE } from "./packet-grid";

// Sticky above the virtualizer's spacer, never inside measured item space.
export function PacketTableHeader() {
  return (
    <div
      className="hidden md:grid sticky top-0 z-10 gap-x-3 px-3 py-1.5 bg-bg-surface border-b border-border text-[9px] uppercase tracking-wider text-text-muted"
      style={{ gridTemplateColumns: GRID_TEMPLATE }}
    >
      <span aria-hidden />
      <span>Hash</span>
      <span>Type</span>
      <span>Route</span>
      <span>Obs</span>
      <span>Hops</span>
      <span>Hash Size</span>
      <span className="truncate" title="Summary and source / destination">Summary / Src → Dst</span>
      <span>IATA</span>
      <span className="text-right">Age</span>
    </div>
  );
}
