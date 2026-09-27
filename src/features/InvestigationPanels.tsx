import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalOverlay } from "../components/ModalOverlay";
import { NodeDetailPanel } from "./nodes/NodeDetailPanel";
import { ObserverDetailPanel } from "./observers/ObserverDetailPanel";
import { PacketAnalyzerDrawer } from "./packets/PacketAnalyzerDrawer";
import { usePacketDetail } from "./packets/usePacketDetail";
import { PacketPathMapModal } from "./map/PacketPathMapModal";
import type { PacketDetail } from "../types/api";

export type InvestigationTarget =
  | { kind: "node"; id: string }
  | { kind: "observer"; id: string }
  | { kind: "packet"; hash: string; observationId?: number }
  | { kind: "path"; detail: PacketDetail; selectedKey?: string };

export interface Investigation {
  key: string;
  target: InvestigationTarget;
}

// Each panel stays mounted underneath the next one so its selection, scroll and trigger survive.
export function InvestigationPanel({ target, inactive, onClose, onOpen, onObserverDashboard }: {
  target: InvestigationTarget; inactive: boolean; onClose: () => void;
  onOpen: (target: InvestigationTarget) => void; onObserverDashboard: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { data: detail, isLoading } = usePacketDetail(target.kind === "packet" ? target.hash : null);
  const [selected, setSelected] = useState<number | null>(target.kind === "packet" ? target.observationId ?? null : null);
  const observer = (id: string) => onOpen({ kind: "observer", id });
  const node = (id: string) => onOpen({ kind: "node", id });
  const packet = (hash: string, observationId?: number) => onOpen({ kind: "packet", hash, observationId });
  if (target.kind === "path") return <PacketPathMapModal detail={target.detail} initialSelectedKey={target.selectedKey} inactive={inactive} onClose={onClose} />;
  return <ModalOverlay label={t(target.kind === "observer" ? "tabs.Observers" : target.kind === "node" ? "investigation.nodeDialog" : "investigation.packetDialog")} inactive={inactive} onClose={onClose}>
    {target.kind === "observer" ? (
      <ObserverDetailPanel observerId={target.id} onClose={onClose} onViewStats={onObserverDashboard} onAnalyzePacket={packet} />
    ) : target.kind === "node" ? (
      <NodeDetailPanel nodeId={target.id} onClose={onClose} onViewObserver={observer} onViewNode={node} onAnalyzePacket={packet} />
    ) : (
      <PacketAnalyzerDrawer
        detail={detail} loading={isLoading} selectedObservationId={selected} onSelectObservation={setSelected}
        requireSelectedObservation={target.observationId !== undefined} syncUrl={false}
        onClose={onClose} onViewObserver={observer} onViewNode={node}
        onViewPath={key => { if (detail) onOpen({ kind: "path", detail, selectedKey: key }); }}
      />
    )}
  </ModalOverlay>;
}
