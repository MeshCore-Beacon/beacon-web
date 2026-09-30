import { lazy, Suspense, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PacketDetail } from "../../types/api";
import { ModalOverlay } from "../../components/ModalOverlay";
import { CloseButton } from "../../components/CloseButton";
import { CopyLinkButton } from "../../components/CopyLinkButton";
import { formatPropagation } from "../../lib/formatters";
import { buildPacketPaths } from "./packet-path";
import { DEFAULT_STYLE_ID, MAP_STYLE_STORAGE_KEY } from "./types";

const PacketPathMap = lazy(() => import("./PacketPathMap").then(module => ({ default: module.PacketPathMap })));

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

export function PacketPathMapModal({ detail, onClose, initialSelectedKey, inactive = false }: {
  detail: PacketDetail;
  onClose: () => void;
  initialSelectedKey?: string | null;
  inactive?: boolean;
}) {
  const { t } = useTranslation();
  const paths = useMemo(() => buildPacketPaths(detail), [detail]);
  const [selectedKey, setSelectedKey] = useState<string | null>(
    () => initialSelectedKey && initialSelectedKey !== "all" ? initialSelectedKey : null,
  );
  const unavailable = selectedKey != null && !paths.some(p => p.key === selectedKey);
  const styleId = useMemo(() => localStorage.getItem(MAP_STYLE_STORAGE_KEY) ?? DEFAULT_STYLE_ID, []);

  return (
    <ModalOverlay label={t("investigation.mapDialog")} onClose={onClose} inactive={inactive}>
      <div className="h-full w-full md:w-[860px] md:max-w-[92vw] bg-bg-surface flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle shrink-0">
          <span className="text-[13px] font-mono font-medium text-text-dim uppercase tracking-wider">{t("investigation.mapTitle")}</span>
          <div className="flex items-center gap-1.5">
            <CopyLinkButton
              preserveParams={["regions", "iata", "region"]}
              params={() => ({ tab: "Packets", hash: detail.packetHash, path: selectedKey ?? "all" })}
              label={t("investigation.copy")} copiedLabel={t("observerPage.copied")} ariaLabel={t("investigation.copyPath")}
            />
            <CloseButton onClose={onClose} label={t("investigation.closeMap")} className="-mr-1" />
          </div>
        </div>

        <p className="border-b border-border-subtle px-3 py-2 text-xs text-text-muted">{t("investigation.mapNote")}</p>
        {unavailable && <p role="status" className="px-3 py-2 text-sm text-warn">{t("investigation.unavailableMap")}</p>}
        {paths.length === 0 && !unavailable && <p role="status" className="px-3 py-2 text-sm text-text-muted">{t("investigation.unmappable")}</p>}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          <div className="h-[55vh] max-md:shrink-0 md:h-auto md:flex-1 min-h-0 bg-bg-base">
            <Suspense fallback={<p role="status" className="p-4 text-sm text-text-muted">{t("common.loading")}</p>}>
              <PacketPathMap paths={paths} selectedKey={selectedKey} styleId={styleId} />
            </Suspense>
          </div>
          <div className="md:w-[220px] md:border-l border-t md:border-t-0 border-border flex flex-col min-h-0 overflow-y-auto">
            <div className="sticky top-0 bg-bg-surface z-10 border-b border-border-subtle">
              <Row active={selectedKey === null} label={t("investigation.allPaths")} onClick={() => setSelectedKey(null)} />
            </div>
            {paths.map((p) => (
              <Row
                key={p.key}
                active={selectedKey === p.key}
                color={p.color}
                label={p.key === "trace" ? t("investigation.traceRoute") : p.label}
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
