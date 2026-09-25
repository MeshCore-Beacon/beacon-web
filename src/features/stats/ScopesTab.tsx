import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useScopes } from "./useStats";
import { useChartColors } from "./chartTheme";
import { Card, ChartCard, StatCard } from "./cards";
import { scopeChartOption, scopeSummary } from "./scopes";
import { formatCount } from "../../lib/formatters";

export function ScopesTab() {
  const { t } = useTranslation();
  const query = useScopes();
  const colors = useChartColors();
  const [search, setSearch] = useState("");
  const loading = query.isPending || query.isLoading || query.isPlaceholderData;
  const unavailable = loading || query.isError;
  const all = useMemo(() => unavailable ? [] : (query.data ?? []), [query.data, unavailable]);
  const rows = useMemo(() => all.filter((row) => row.name.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => b.packetCount - a.packetCount || a.name.localeCompare(b.name)), [all, search]);
  const totals = useMemo(() => scopeSummary(rows), [rows]);
  const packets = useMemo(() => scopeChartOption(rows, "packetCount", colors, t), [rows, colors, t]);
  const observers = useMemo(() => scopeChartOption(rows, "observerCount", colors, t), [rows, colors, t]);
  const nodes = useMemo(() => scopeChartOption(rows, "nodeCount", colors, t), [rows, colors, t]);
  const value = (number: number) => unavailable ? "—" : formatCount(number);
  const height = Math.max(180, Math.min(13, rows.length) * 28 + 16);

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1200px] flex-col gap-3.5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold text-text-bright">{t("scopes.title")}</h2><p className="text-sm text-text-muted">{t("scopes.subtitle")}</p></div>
        <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching || query.isPending} className="rounded border border-border px-3 py-1.5 text-xs text-text-normal hover:bg-bg-raised disabled:opacity-50">{t("scopes.refresh")}</button>
      </div>
      <label className="flex max-w-sm flex-col gap-1 text-xs text-text-muted">{t("scopes.search")}
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="#bc, #east…" className="rounded border border-border bg-bg-raised px-3 py-2 text-base text-text-bright outline-none focus:border-primary sm:text-sm" />
      </label>
      {query.isError && <p role="alert" className="text-sm text-danger">{t("scopes.error")}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t("scopes.active")} value={value(totals.active)} accent={colors.secondary} />
        <StatCard label={t("scopes.scopedPackets")} value={value(totals.packets)} accent={colors.primary} />
        <StatCard label={t("scopes.memberships")} value={value(totals.memberships)} accent={colors.green} />
        <StatCard label={t("scopes.defaultNodes")} value={value(totals.nodes)} accent={colors.warn} />
      </div>
      <p className="text-xs leading-relaxed text-text-muted">{t("scopes.measurement")}</p>
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <ChartCard title={t("scopes.packetsTitle")} option={packets} height={height} isLoading={loading} isError={query.isError} isEmpty={!totals.packets} />
        <ChartCard title={t("scopes.membershipsTitle")} option={observers} height={height} isLoading={loading} isError={query.isError} isEmpty={!totals.memberships} />
        <ChartCard title={t("scopes.defaultNodes")} option={nodes} height={height} isLoading={loading} isError={query.isError} isEmpty={!totals.nodes} />
        <Card title={t("scopes.countsTitle")} right={<span className="text-[10px] text-text-muted">{unavailable ? "—" : t("scopes.visibleCount", { visible: rows.length, count: all.length })}</span>}>
          {unavailable ? <p className="py-6 text-sm text-text-muted">{query.isError ? t("common.dataUnavailable") : t("scopes.loading")}</p> : !rows.length ? <p className="py-6 text-sm text-text-muted">{search ? t("scopes.noMatches") : t("scopes.empty")}</p> : (
            <div className="max-h-[390px] overflow-auto"><table aria-label={t("scopes.countsTitle")} className="w-full text-left font-mono text-[11px]">
              <thead className="text-text-muted"><tr><th scope="col" className="py-2">{t("scopes.scope")}</th><th scope="col" className="pl-2 text-right">{t("scopes.packets")}</th><th scope="col" className="pl-2 text-right">{t("scopes.observers")}</th><th scope="col" className="pl-2 text-right">{t("scopes.nodes")}</th></tr></thead>
              <tbody>{rows.map((row) => <tr key={row.name} className="border-t border-border-subtle">
                <th scope="row" className="max-w-32 break-all py-2 pr-2 font-normal text-text-normal">{row.name}</th>
                <td className="pl-2 text-right tabular-nums text-text-bright">{row.packetCount.toLocaleString()}</td><td className="pl-2 text-right tabular-nums text-text-normal">{row.observerCount.toLocaleString()}</td><td className="pl-2 text-right tabular-nums text-text-normal">{row.nodeCount.toLocaleString()}</td>
              </tr>)}</tbody>
            </table></div>
          )}
          <p className="mt-2 text-[11px] text-text-muted">{t("scopes.groupingHelp")}</p>
        </Card>
      </div>
    </div>
  );
}
