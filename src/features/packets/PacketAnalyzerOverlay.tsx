import { useEffect, useState } from "react";
import type { PacketDetail } from "../../types/api";
import { PacketAnalyzerDrawer } from "./PacketAnalyzerDrawer";
import { NodeDetailOverlay } from "../nodes/NodeDetailOverlay";
import { ModalOverlay } from "../../components/ModalOverlay";

// Packet analyzer shown as a modal over the node detail panel: clicking a node's observation row
// pops the analyzer for that packet, dimming the rest, so a user can peek at the packet and close
// back to the node. The mirror image of NodeDetailOverlay (node panel over the packet analyzer).
//
// One level deeper: clicking a resolved path node inside the analyzer floats a node detail on top
// (node panel → packet analyzer → node detail). That bottom node panel gets no onAnalyzePacket, so
// the chain stops there rather than recursing forever.
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
          collapsible={false}
          selectedObservationId={selectedObservationId}
          onSelectObservation={setSelectedObservationId}
          open={true}
          onToggle={onClose}
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
