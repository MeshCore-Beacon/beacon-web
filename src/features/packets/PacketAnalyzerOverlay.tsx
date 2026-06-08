import { useEffect, useState } from "react";
import type { PacketDetail } from "../../types/api";
import { PacketAnalyzerDrawer } from "./PacketAnalyzerDrawer";
import { NodeDetailOverlay } from "../nodes/NodeDetailOverlay";
import { ModalOverlay } from "../../components/ModalOverlay";

// Packet analyzer floated over a node detail panel (mirror of NodeDetailOverlay). The node detail it
// can stack on top gets no onAnalyzePacket, so the overlay chain stops there instead of recursing.
export function PacketAnalyzerOverlay({ detail, loading, onClose, onViewObserver }: {
  detail: PacketDetail | undefined;
  loading?: boolean;
  onClose: () => void;
  onViewObserver: (observerId: string) => void;
}) {
  const [selectedObservationId, setSelectedObservationId] = useState<number | null>(null);
  const [viewNodeId, setViewNodeId] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // peel back one layer at a time: the nested node overlay handles its own Escape, so only
      // close the analyzer once nothing is stacked above it
      if (e.key === "Escape" && !viewNodeId) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, viewNodeId]);

  return (
    <>
      <ModalOverlay label="Packet analyzer" onClose={onClose} inactive={!!viewNodeId}>
        <PacketAnalyzerDrawer
          detail={detail}
          loading={loading}
          selectedObservationId={selectedObservationId}
          onSelectObservation={setSelectedObservationId}
          onClose={onClose}
          onViewNode={setViewNodeId}
        />
      </ModalOverlay>
      {viewNodeId && (
        <NodeDetailOverlay
          nodeId={viewNodeId}
          onClose={() => setViewNodeId(null)}
          onViewObserver={onViewObserver}
        />
      )}
    </>
  );
}
