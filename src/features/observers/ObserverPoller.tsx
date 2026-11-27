import { useId } from "react";
import { useTranslation } from "react-i18next";
import { PollerSlots, PollerTargets } from "../nodes/NodePollerSection";
import { useNodePoller } from "../nodes/useNodeTelemetry";

const LABEL = "mb-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-text-normal";

// The dashboard's Poller block. Nothing is drawn without a claim, or on a server without the route.
export function ObserverPoller({ nodeId, onViewNode }: { nodeId: string; onViewNode?: (nodeId: string) => void }) {
  const { t } = useTranslation();
  const headingId = useId();
  const { data } = useNodePoller(nodeId, true);
  if (!data?.claim) return null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="mt-2 text-lg font-semibold text-text-bright">{t("nodes.poller")}</h2>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-lg border border-border bg-bg-surface p-3.5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div>
          <h3 className={LABEL}>{t("nodeDetail.pollerView.slots")}</h3>
          <PollerSlots claim={data.claim} readings24h={data.readings24h} />
        </div>
        <div className="min-w-0">
          <h3 className={LABEL}>{t("nodeDetail.pollerView.targets")}</h3>
          <PollerTargets data={data} onViewNode={onViewNode} className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2" />
        </div>
      </div>
    </section>
  );
}
