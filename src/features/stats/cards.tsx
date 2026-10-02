import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EChart } from "./EChart";
import type { EChartsOption } from "./echarts-setup";

// Titled surface card matching the app's panel language.
export function Card({
  title,
  right,
  children,
  className,
}: {
  title: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-border bg-bg-surface p-3.5 ${className ?? ""}`}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-text-normal">{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

const SPARK_W = 120;
const SPARK_H = 20;
const sparkSpacer = <div className="mt-1.5 h-[20px]" />;

function Sparkline({ values, color, markPeak }: { values: (number | null)[]; color: string; markPeak?: boolean }) {
  const known = values.filter((v): v is number => v !== null);
  if (values.length < 2 || known.length < 2) return sparkSpacer;
  const max = Math.max(...known);
  const min = Math.min(...known);
  const range = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * SPARK_W;
  const y = (v: number) => SPARK_H - 1 - ((v - min) / range) * (SPARK_H - 2);
  // A null hour breaks the line, so an outage shows as a gap rather than a straight join.
  const runs: string[][] = [[]];
  values.forEach((v, i) => {
    if (v === null) runs.push([]);
    else runs[runs.length - 1]!.push(`${x(i)},${y(v)}`);
  });
  const peak = values.indexOf(max);
  return (
    <svg width="100%" height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" className="mt-1.5 overflow-visible" aria-hidden>
      {runs.filter((run) => run.length > 1).map((run) => (
        <polyline key={run[0]} fill="none" stroke={color} strokeWidth="1.5" points={run.join(" ")} />
      ))}
      {markPeak && (
        // zero-length round-capped stroke: stays a circle under preserveAspectRatio="none"
        <line data-peak x1={x(peak)} x2={x(peak)} y1={y(max)} y2={y(max)} stroke={color} strokeWidth="5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}

// One bar per run of hours that reported, so gaps read at a glance.
function PresenceStrip({ hours, color }: { hours: boolean[]; color: string }) {
  if (hours.length === 0) return sparkSpacer;
  const slot = SPARK_W / hours.length;
  const bars: { start: number; length: number }[] = [];
  hours.forEach((on, i) => {
    const last = bars.at(-1);
    if (!on) return;
    if (last && last.start + last.length === i) last.length++;
    else bars.push({ start: i, length: 1 });
  });
  return (
    <svg width="100%" height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" className="mt-1.5" aria-hidden>
      <line x1="0" x2={SPARK_W} y1={SPARK_H / 2} y2={SPARK_H / 2} stroke={color} strokeWidth="1" opacity="0.25" />
      {bars.map((bar) => (
        <rect key={bar.start} x={bar.start * slot} y={SPARK_H / 2 - 4} width={bar.length * slot} height="8" fill={color} />
      ))}
    </svg>
  );
}

// KPI tile: label, big mono value, optional sparkline (or hourly presence strip) + sub-label.
export function StatCard({
  label,
  value,
  accent,
  spark,
  markPeak,
  presence,
  sublabel,
}: {
  label: string;
  value: ReactNode;
  accent: string; // CSS color for the sparkline, e.g. "var(--color-primary)"
  spark?: (number | null)[];
  markPeak?: boolean;
  presence?: boolean[];
  sublabel?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-surface px-3.5 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <span className="min-w-0 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">{label}</span>
        {sublabel && <span className="min-w-0 max-w-full truncate font-mono text-[9px] text-text-dim">{sublabel}</span>}
      </div>
      <div className="mt-0.5 font-mono text-xl font-bold tabular-nums text-text-bright sm:text-2xl">{value}</div>
      {presence ? <PresenceStrip hours={presence} color={accent} /> : spark ? <Sparkline values={spark} color={accent} markPeak={markPeak} /> : sparkSpacer}
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center font-mono text-[11px] text-text-dim">{children}</div>
  );
}

// Card whose body is a fixed-height ECharts chart, with loading/empty/error states.
export function ChartCard({
  title,
  right,
  height = 200,
  option,
  isLoading,
  isEmpty,
  isError,
  onEvents,
  className,
}: {
  title: ReactNode;
  right?: ReactNode;
  height?: number;
  option: EChartsOption;
  isLoading?: boolean;
  isEmpty?: boolean;
  isError?: boolean;
  onEvents?: Record<string, (params: unknown) => void>;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Card title={title} right={right} className={className}>
      <div style={{ height }}>
        {isError ? (
          <Centered>{t("common.loadFailed")}</Centered>
        ) : isLoading ? (
          <Centered>{t("common.loading")}</Centered>
        ) : isEmpty ? (
          <Centered>{t("common.noData")}</Centered>
        ) : (
          <EChart option={option} onEvents={onEvents} />
        )}
      </div>
    </Card>
  );
}
