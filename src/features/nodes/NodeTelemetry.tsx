import { useTranslation } from "react-i18next";
import { Sparkline } from "../../components/Sparkline";
import { Timestamp } from "../../components/Timestamp";
import { useObserver, useObserverTelemetry } from "../stats/useTelemetry";
import { intervalToMs } from "../stats/transforms";
import { formatUptime } from "../../lib/formatters";
import type { Node } from "./types";
import { CollectedNodeTelemetry } from "./CollectedNodeTelemetry";

export function NodeTelemetry({ node, active = true, compact = false }: { node: Node; active?: boolean; compact?: boolean }) {
  if (compact) return node.observerId ? <ObserverNodeTelemetry node={node} active={active} compact /> : <CollectedNodeTelemetry publicKey={node.publicKey} active={active} compact />;
  return <><CollectedNodeTelemetry publicKey={node.publicKey} active={active} /><ObserverNodeTelemetry node={node} active={active} /></>;
}

function ObserverNodeTelemetry({ node, active, compact = false }: { node: Node; active: boolean; compact?: boolean }) {
  const { t } = useTranslation();
  const observer = useObserver(active ? node.observerId ?? null : null);
  const exact = observer.data?.publicKey?.toLowerCase() === node.publicKey.toLowerCase();
  const telemetry = useObserverTelemetry(active && exact ? node.observerId ?? null : null, "24h");
  const points = telemetry.data?.points ?? [];
  if (!exact || !points.length) return compact ? <section className="space-y-2 text-[10px] text-text-muted"><p>{t(observer.isError || telemetry.isError ? "nodeTelemetry.loadError" : observer.isPending || (exact && telemetry.isPending) ? "common.loading" : "nodeTelemetry.noData")}</p><Sparkline values={[null,null]} color="var(--color-text-muted)" /></section> : null;
  const metrics = [
    { label: t("observerPage.battery"), values: points.map(p => p.batteryMv != null && p.batteryMv > 0 ? p.batteryMv / 1000 : null), format: (n: number) => `${n.toFixed(2)} V` },
    { label: t("observerPage.uptime"), values: points.map(p => p.uptimeSeconds), format: formatUptime },
    { label: t("observerPage.noise"), values: points.map(p => p.noiseFloorDb), format: (n: number) => `${n.toFixed(0)} dBm` },
  ].filter(metric => metric.values.some(v => v != null && Number.isFinite(v)));
  if (!metrics.length) return null;
  const renderMetric = (metric: typeof metrics[number],index:number) => {
        const latest = metric.values.at(-1);
        return <div key={metric.label} className="min-w-0 rounded-sm border border-border bg-bg-base p-2">
          <p className="text-[10px] text-text-muted">{metric.label}</p>
          <p className="font-mono text-sm text-text-bright">{latest != null && Number.isFinite(latest) ? metric.format(latest) : "—"}</p>
          <Sparkline values={metric.values} times={points.map(p => p.t)} gapMs={(intervalToMs(telemetry.data?.interval ?? "1h") ?? 3_600_000) * 1.5} color={index ? "var(--color-secondary)" : "var(--color-green)"} />
        </div>;
  };
  return <section aria-label={t("nodePage.telemetry")} className="space-y-1.5">
    <div className="flex flex-wrap justify-between gap-2 text-xs text-text-muted"><span>{t("nodePage.telemetry24h")}</span><Timestamp value={points.at(-1)!.t} /></div>
    <div className="grid grid-cols-2 gap-2">
      {metrics.slice(0, compact ? 2 : metrics.length).map(renderMetric)}
    </div>
    {compact && metrics.length>2 && <details className="text-[10px]"><summary className="min-h-6 cursor-pointer content-center text-primary">{t("nodeTelemetry.more",{count:metrics.length-2})}</summary><div className="grid grid-cols-2 gap-1.5">{metrics.slice(2).map(renderMetric)}</div></details>}
  </section>;
}
