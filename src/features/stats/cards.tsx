import { Sparkline, PresenceStrip } from "../../components/Sparkline";
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
      {presence ? <PresenceStrip hours={presence} color={accent} /> : spark ? <Sparkline values={spark} color={accent} markPeak={markPeak} /> : <div className="mt-1.5 h-[20px]" />}
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
