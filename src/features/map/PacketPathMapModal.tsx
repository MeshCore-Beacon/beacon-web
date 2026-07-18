import { useEffect, useMemo, useState } from "react";
import type { PacketDetail } from "../../types/api";
import { ModalOverlay } from "../../components/ModalOverlay";
import { CloseButton } from "../../components/CloseButton";
import { CopyLinkButton } from "../../components/CopyLinkButton";
import { formatPropagation } from "../../lib/formatters";
import { buildPacketPaths } from "./packet-path";
import { PacketPathMap } from "./PacketPathMap";
import { DEFAULT_STYLE_ID, MAP_STYLE_STORAGE_KEY } from "./types";

// Closable mini-map of a packet's resolved path(s). "All paths" overlays every observation's route;
// clicking an observer isolates its path. Lives over the analyzer (no tab switch), so closing it
// returns the user exactly where they were.
function Row({ active, color, label, meta, onClick }: {
  active: boolean; color?: string; label: string; meta?: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] font-mono border-l-2 transition-colors ${
        active ? "border-l-secondary bg-secondary/5 text-text-bright" : "border-l-transparent text-text-normal hover:bg-text-normal/3"
      }`}
    >
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={color ? { backgroundColor: color } : undefined} />
      <span className="truncate">{label}</span>
      {meta != null && <span className="ml-auto text-text-dim">{meta}</span>}
    </button>
  );
}

export function PacketPathMapModal({ detail, onClose, initialSelectedKey }: {
  detail: PacketDetail;
  onClose: () => void;
  initialSelectedKey?: string | null;
}) {
  const paths = useMemo(() => buildPacketPaths(detail), [detail]);
  const [selectedKey, setSelectedKey] = useState<string | null>(
    // deep-link value that matches a known path isolates it; anything else (incl. "all") shows All
    () => (initialSelectedKey && paths.some((p) => p.key === initialSelectedKey) ? initialSelectedKey : null),
  );
  const styleId = useMemo(() => localStorage.getItem(MAP_STYLE_STORAGE_KEY) ?? DEFAULT_STYLE_ID, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <ModalOverlay label="Packet path map" onClose={onClose}>
      <div className="h-full w-full md:w-[860px] md:max-w-[92vw] bg-bg-surface flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle shrink-0">
          <span className="text-[13px] font-mono font-medium text-text-dim uppercase tracking-wider">Packet Path</span>
          <div className="flex items-center gap-1.5">
            <CopyLinkButton
              params={() => ({ tab: "Packets", hash: detail.packetHash, path: selectedKey ?? "all" })}
              ariaLabel="Copy path link"
            />
            <CloseButton onClose={onClose} label="Close path map" className="-mr-1" />
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          <div className="h-[55vh] md:h-auto md:flex-1 min-h-0 bg-bg-base">
            <PacketPathMap paths={paths} selectedKey={selectedKey} styleId={styleId} />
          </div>
          <div className="md:w-[220px] md:border-l border-t md:border-t-0 border-border flex flex-col min-h-0 overflow-y-auto">
            <div className="sticky top-0 bg-bg-surface z-10 border-b border-border-subtle">
              <Row active={selectedKey === null} label="All paths" onClick={() => setSelectedKey(null)} />
            </div>
            {paths.map((p) => (
              <Row
                key={p.key}
                active={selectedKey === p.key}
                color={p.color}
                label={p.label}
                meta={formatPropagation(p.propagationMs)}
                onClick={() => setSelectedKey(p.key)}
              />
            ))}
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
