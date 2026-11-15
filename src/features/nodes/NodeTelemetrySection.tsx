import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Section } from "../../components/DetailPanel";
import { Timestamp } from "../../components/Timestamp";
import { ChartCard } from "../stats/cards";
import { useChartColors } from "../stats/chartTheme";
import { Segmented } from "../stats/Segmented";
import { buildNodeCharts } from "./nodeTelemetryOptions";
import { hasNodeTelemetry } from "./telemetry";
import { useNodePolling, useNodeTelemetry, type NodeTelemetryRange } from "./useNodeTelemetry";
import type { Node } from "./types";

const CHART_HEIGHT = 130;
const RANGES: { value: NodeTelemetryRange; key: "24h" | "7d" | "30d" }[] = [
  { value: "24h", key: "24h" },
  { value: "168h", key: "7d" },
  { value: "720h", key: "30d" },
];

// Lazy chunk: the only node-panel code that pulls in ECharts. The panel mounts it only for a
// repeater or room server on a server with polling on.
export default function NodeTelemetrySection({ node, onViewObserver }: { node: Node; onViewObserver?: (observerId: string) => void }) {
  const { t } = useTranslation();
  const colors = useChartColors();
  const [range, setRange] = useState<NodeTelemetryRange>("168h");
  const [seenData, setSeenData] = useState(false);
  const telemetry = useNodeTelemetry(node.id, range, true);
  const polling = useNodePolling(node.id, true);

  const data = telemetry.data;
  const hasData = hasNodeTelemetry(data);
  // Switching range clears the data while it loads; remember there was some so the control stays.
  if (hasData && !seenData) setSeenData(true);

  const charts = useMemo(
    () => (hasData && data
      ? buildNodeCharts(data, colors, {
          battery: t("nodeDetail.telemetry.battery"),
          temperature: t("nodeDetail.telemetry.temperature"),
          noise: t("nodeDetail.telemetry.noise"),
        })
      : {}),
    [hasData, data, colors, t],
  );

  const poller = polling.data?.poller ?? null;
  if (!hasData && !poller && !seenData) return null;

  const polled = !!(data?.polled || polling.data?.polled || seenData);
  if (!hasData && !polled) {
    return (
      <Section title={t("nodeDetail.telemetry.title")}>
        <div className="font-mono text-[13px] text-text-dim">{t("nodeDetail.telemetry.waiting", { name: poller!.name })}</div>
      </Section>
    );
  }

  const standbys = polling.data?.standbys.length ?? 0;
  const latest = polling.data?.latestReadingAt;
  const cards: [string, keyof typeof charts, string][] = [
    ["battery", "battery", t("nodeDetail.telemetry.battery")],
    ["temperature", "temperature", t("nodeDetail.telemetry.temperature")],
    ["noise", "noise", t("nodeDetail.telemetry.noise")],
    ["airtime", "airtime", t("nodeDetail.telemetry.airtime")],
  ];
  return (
    <Section title={t("nodeDetail.telemetry.title")}>
      <Segmented
        size="xs"
        ariaLabel={t("nodeDetail.telemetry.range")}
        value={range}
        onChange={(v) => setRange(v as NodeTelemetryRange)}
        options={RANGES.map((r) => ({ value: r.value, label: t(`stats.ranges.${r.key}`) }))}
      />
      {hasData ? (
        <div className="mt-2 flex flex-col gap-2">
          {cards.map(([id, key, title]) => {
            const option = charts[key];
            return option ? <ChartCard key={id} title={title} height={CHART_HEIGHT} option={option} /> : null;
          })}
        </div>
      ) : (
        <div className="mt-2 font-mono text-[13px] text-text-dim">
          {telemetry.isError ? t("common.loadFailed") : telemetry.isLoading ? t("common.loading") : t("nodeDetail.telemetry.noReadings")}
        </div>
      )}
      <div className="mt-2 flex flex-col gap-0.5 font-mono text-[11px] text-text-muted">
        {poller && (
          <div>
            <span>{t("nodeDetail.telemetry.polledBy")} </span>
            {onViewObserver ? (
              <button type="button" onClick={() => onViewObserver(poller.observerId)} className="text-primary hover:underline">
                {poller.name}
              </button>
            ) : (
              <span className="text-text-normal">{poller.name}</span>
            )}
          </div>
        )}
        {latest != null && (
          <div>
            <span>{t("nodeDetail.telemetry.lastReading")} </span>
            <Timestamp value={latest} className="text-text-normal" />
          </div>
        )}
        {standbys > 0 && <div>{t("nodeDetail.telemetry.standby", { count: standbys })}</div>}
      </div>
    </Section>
  );
}
