import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Section } from "../../components/DetailPanel";
import { useDisplayUnits } from "../../hooks/useFeatures";
import { tempSymbol } from "../../lib/units";
import { Timestamp } from "../../components/Timestamp";
import { ChartCard } from "../stats/cards";
import { useChartColors } from "../stats/chartTheme";
import { Segmented } from "../stats/Segmented";
import { buildNodeCharts } from "./nodeTelemetryOptions";
import { hasNodeTelemetry } from "./telemetry";
import { useNodePolling, useNodeTelemetry, type NodeTelemetryRange } from "./useNodeTelemetry";
import type { Node, NodeTelemetry } from "./types";

const CHART_HEIGHT = 130;
const RANGES: { value: NodeTelemetryRange; key: "24h" | "7d" | "30d" }[] = [
  { value: "24h", key: "24h" },
  { value: "168h", key: "7d" },
  { value: "720h", key: "30d" },
];

// Lazy chunk: the only node-panel code that pulls in ECharts. The panel mounts it only for a
// repeater or room server on a server with polling on.
export default function NodeTelemetrySection({ node, onViewObserver, extra }: { node: Node; onViewObserver?: (observerId: string) => void; extra?: ReactNode }) {
  const { t } = useTranslation();
  const colors = useChartColors();
  const { temperature: tempUnit } = useDisplayUnits();
  const [range, setRange] = useState<NodeTelemetryRange>("168h");
  // The charts last drawn. Kept so a failed range change leaves them on screen, and so the
  // section knows it has shown a chart since it mounted.
  const [shown, setShown] = useState<NodeTelemetry | null>(null);
  const telemetry = useNodeTelemetry(node.id, range, true);
  const polling = useNodePolling(node.id, true);

  const data = telemetry.data;
  const hasData = hasNodeTelemetry(data);
  const source = hasData ? data : telemetry.isError ? shown : null;

  const charts = useMemo(
    () => (source
      ? buildNodeCharts(source, colors, {
          battery: t("nodeDetail.telemetry.battery"),
          temperature: t("nodeDetail.telemetry.temperature", { unit: tempSymbol(tempUnit) }),
          noise: t("nodeDetail.telemetry.noise"),
        }, tempUnit)
      : {}),
    [source, colors, t, tempUnit],
  );
  const drawn = Object.values(charts).some(Boolean);
  if (hasData && drawn && data !== shown) setShown(data!);
  const seenData = shown !== null;

  // The request block lives here so it shares the Telemetry heading; with nothing else to show it stands alone.
  const extraBlock = extra ? <div className="mt-3 border-t border-border-subtle pt-2">{extra}</div> : null;
  const bare = extra ? <Section title={t("nodeDetail.telemetry.title")}>{extra}</Section> : null;

  // No route on this server, or the first load failed: nothing to show and nothing to apologise for.
  if (telemetry.unsupported || (telemetry.isError && !seenData)) return bare;

  const poller = polling.data?.poller ?? null;
  if (!hasData && !poller && !seenData) return bare;

  const polled = !!(data?.polled || polling.data?.polled || seenData);
  if (!hasData && !polled) {
    return (
      <Section title={t("nodeDetail.telemetry.title")}>
        <div className="font-mono text-[13px] text-text-dim">{t("nodeDetail.telemetry.waiting", { name: poller!.name })}</div>
        {extraBlock}
      </Section>
    );
  }

  const standbys = polling.data?.standbys.length ?? 0;
  const latest = polling.data?.latestReadingAt;
  const cards: [string, keyof typeof charts, string][] = [
    ["battery", "battery", t("nodeDetail.telemetry.battery")],
    ["temperature", "temperature", t("nodeDetail.telemetry.temperature", { unit: tempSymbol(tempUnit) })],
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
      {drawn ? (
        <div className="mt-2 flex flex-col gap-2">
          {cards.map(([id, key, title]) => {
            const option = charts[key];
            return option ? <ChartCard key={id} title={title} height={CHART_HEIGHT} option={option} /> : null;
          })}
        </div>
      ) : (
        <div className="mt-2 font-mono text-[13px] text-text-dim">
          {telemetry.isLoading ? t("common.loading") : t("nodeDetail.telemetry.noReadings")}
        </div>
      )}
      {telemetry.isError && drawn && <div className="mt-1 font-mono text-[11px] text-text-muted">{t("common.loadFailed")}</div>}
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
      {extraBlock}
    </Section>
  );
}
