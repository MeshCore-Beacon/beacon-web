import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatCount } from "../../lib/formatters";
import { Card, ChartCard, StatCard } from "./cards";
import { donutOption } from "./chartOptions";
import { tooltipStyle, useChartColors } from "./chartTheme";
import { pathHours, pathLengthOption, pathTrendOption } from "./paths";
import { usePathStats } from "./usePathStats";
import type { StatsRange } from "./types";

const utc = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");

export function PathsTab({ range }: { range: StatsRange }) {
  const { t } = useTranslation();
  const query = usePathStats(range), c = useChartColors();
  const loading = query.isPending || query.isPlaceholderData;
  const data = loading || query.isError ? undefined : query.data;
  const hours = useMemo(() => pathHours(data), [data]);
  const categories = useMemo(() => [
    { name: t("paths.categories.hashed"), value: data?.hashed ?? 0, color: c.primary },
    { name: t("paths.categories.empty"), value: data?.empty ?? 0, color: c.textDim },
    { name: t("paths.categories.trace"), value: data?.trace ?? 0, color: c.warn },
    { name: t("paths.categories.unclassified"), value: data?.unclassified ?? 0, color: c.secondary },
  ], [data, c, t]);
  const charts = useMemo(() => {
    const width = donutOption((data?.hashWidths ?? []).map((bin, i) => ({ name: t("paths.hashWidth", { count: bin.bytes }), value: bin.receptions, color: c.series[i] })), c, formatCount(data?.hashed ?? 0), t("paths.hashPathsCenter"));
    const coverage = donutOption(categories, c, formatCount(data?.receptions ?? 0), t("paths.receptionsCenter"));
    return {
      width: { ...width, tooltip: { trigger: "item" as const, renderMode: "richText" as const, formatter: "{b}: {c} ({d}%)", ...tooltipStyle(c) }, aria: { enabled: true, label: { description: t("paths.widthDescription") } } },
      coverage: { ...coverage, tooltip: { trigger: "item" as const, renderMode: "richText" as const, formatter: "{b}: {c} ({d}%)", ...tooltipStyle(c) }, aria: { enabled: true, label: { description: t("paths.coverageDescription") } } },
      lengths: pathLengthOption(data?.pathLengths ?? [], c, t), trend: pathTrendOption(hours, c, t),
    };
  }, [data, c, categories, hours, t]);
  const state = { isLoading: loading, isError: query.isError };
  const multi = data?.hashWidths.filter((bin) => bin.bytes > 1).reduce((n, bin) => n + bin.receptions, 0) ?? 0;
  const largest = data?.pathLengths.at(-1)?.entries;

  return <div className="mx-auto flex w-full min-w-0 max-w-[1200px] flex-col gap-3.5 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold text-text-bright">{t("stats.tabs.paths")}</h2><p className="text-sm text-text-muted">{t("paths.subtitle")}</p></div>
      <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching || query.isPending} className="rounded border border-border px-3 py-1.5 text-xs text-text-normal hover:bg-bg-raised disabled:opacity-50">{t("paths.refresh")}</button>
    </div>
    {query.isError && <p role="alert" className="text-sm text-danger">{t("paths.error")}</p>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label={t("paths.receptions")} value={data ? formatCount(data.receptions) : "—"} accent={c.primary} sublabel={t(`stats.ranges.${range}`)} />
      <StatCard label={t("paths.withHashPaths")} value={data ? formatCount(data.hashed) : "—"} accent={c.green} />
      <StatCard label={t("paths.multiByteShare")} value={data?.hashed ? `${(100 * multi / data.hashed).toFixed(1)}%` : "—"} accent={c.secondary} />
      <StatCard label={t("paths.mostEntries")} value={largest ?? "—"} accent={c.warn} />
    </div>
    <p className="text-xs leading-relaxed text-text-muted">{t("paths.measurement")}</p>
    {data && <p className="text-xs text-text-muted">{t("paths.window", { since: utc(data.since), until: utc(data.until) })}</p>}
    <div className="grid min-w-0 grid-cols-1 gap-3.5 lg:grid-cols-2">
      <ChartCard title={t("paths.widthTitle")} option={charts.width} height={260} isEmpty={!data?.hashed} {...state} />
      <ChartCard title={t("paths.lengthTitle")} option={charts.lengths} height={260} isEmpty={!data || data.hashed + data.empty === 0} {...state} />
    </div>
    <ChartCard title={t("paths.trendTitle")} option={charts.trend} height={260} isEmpty={!data?.hashed} {...state} />
    <div className="grid min-w-0 grid-cols-1 gap-3.5 lg:grid-cols-2">
      <ChartCard title={t("paths.coverageTitle")} option={charts.coverage} height={260} isEmpty={!data?.receptions} {...state} />
      <Card title={t("paths.countsTitle")}>
        {!data ? <p className="py-4 text-sm text-text-muted">{query.isError ? t("common.dataUnavailable") : t("paths.loading")}</p> : !data.receptions ? <p className="py-4 text-sm text-text-muted">{t("paths.empty")}</p> : <table aria-label={t("paths.classificationTable")} className="w-full text-left font-mono text-xs">
          <thead className="text-text-muted"><tr><th scope="col" className="py-2">{t("paths.category")}</th><th scope="col" className="pl-2 text-right">{t("paths.receptionsColumn")}</th><th scope="col" className="pl-2 text-right">{t("paths.share")}</th></tr></thead>
          <tbody>{categories.map((item) => <tr key={item.name} className="border-t border-border-subtle"><th scope="row" className="py-2 font-normal text-text-normal">{item.name}</th><td className="pl-2 text-right text-text-bright">{item.value.toLocaleString()}</td><td className="pl-2 text-right text-text-muted">{(100 * item.value / data.receptions).toFixed(1)}%</td></tr>)}</tbody>
        </table>}
        <p className="mt-3 text-xs leading-relaxed text-text-muted">{t("paths.countsHelp")}</p>
      </Card>
    </div>
    {data && data.receptions > 0 && <details className="rounded-lg border border-border bg-bg-surface p-3.5">
      <summary className="cursor-pointer text-sm font-semibold text-text-normal">{t("paths.details")}</summary>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <table aria-label={t("paths.widthTable")} className="w-full text-left font-mono text-xs"><thead className="text-text-muted"><tr><th scope="col" className="py-2">{t("paths.bytesPerHash")}</th><th scope="col" className="pl-2 text-right">{t("paths.receptionsColumn")}</th></tr></thead><tbody>{data.hashWidths.map((bin) => <tr key={bin.bytes} className="border-t border-border-subtle"><th scope="row" className="py-1.5 font-normal">{bin.bytes}</th><td className="pl-2 text-right">{bin.receptions.toLocaleString()}</td></tr>)}</tbody></table>
        <div className="max-h-[230px] overflow-auto"><table aria-label={t("paths.lengthTable")} className="w-full text-left font-mono text-xs"><thead className="text-text-muted"><tr><th scope="col" className="py-2">{t("paths.headerEntries")}</th><th scope="col" className="pl-2 text-right">{t("paths.receptionsColumn")}</th></tr></thead><tbody>{data.pathLengths.map((bin) => <tr key={bin.entries} className="border-t border-border-subtle"><th scope="row" className="py-1.5 font-normal">{bin.entries}</th><td className="pl-2 text-right">{bin.receptions.toLocaleString()}</td></tr>)}</tbody></table></div>
      </div>
      <p className="my-3 text-xs text-text-muted">{t("paths.lengthsHelp")}</p>
      <div className="max-h-[340px] overflow-auto"><table aria-label={t("paths.hourlyTable")} className="w-full min-w-[650px] text-left font-mono text-xs"><thead className="text-text-muted"><tr>{[t("paths.utcHour"), t("paths.receptionsColumn"), ...[1, 2, 3].map((count) => t("paths.hashWidth", { count })), t("paths.categories.empty"), t("paths.categories.trace"), t("paths.categories.unclassified")].map((label) => <th key={label} scope="col" className="py-2">{label}</th>)}</tr></thead><tbody>{data.hourly.map((row) => <tr key={row.hour} className="border-t border-border-subtle"><th scope="row" className="py-2 font-normal">{utc(row.hour)}</th>{[row.receptions, row.oneByte, row.twoByte, row.threeByte, row.empty, row.trace, row.unclassified].map((n, i) => <td key={i}>{n.toLocaleString()}</td>)}</tr>)}</tbody></table></div>
    </details>}
  </div>;
}
