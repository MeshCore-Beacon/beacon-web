import { useMemo, useState } from "react";
import { useScopes } from "./useStats";
import { useChartColors } from "./chartTheme";
import { Card, ChartCard, StatCard } from "./cards";
import { scopeChartOption, scopeSummary } from "./scopes";
import { formatCount } from "../../lib/formatters";

export function ScopesTab() {
  const query = useScopes();
  const colors = useChartColors();
  const [search, setSearch] = useState("");
  const loading = query.isPending || query.isLoading || query.isPlaceholderData;
  const unavailable = loading || query.isError;
  const all = useMemo(() => unavailable ? [] : (query.data ?? []), [query.data, unavailable]);
  const rows = useMemo(() => all.filter((row) => row.name.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => b.packetCount - a.packetCount || a.name.localeCompare(b.name)), [all, search]);
  const totals = useMemo(() => scopeSummary(rows), [rows]);
  const packets = useMemo(() => scopeChartOption(rows, "packetCount", colors), [rows, colors]);
  const observers = useMemo(() => scopeChartOption(rows, "observerCount", colors), [rows, colors]);
  const nodes = useMemo(() => scopeChartOption(rows, "nodeCount", colors), [rows, colors]);
  const value = (number: number) => unavailable ? "—" : formatCount(number);
  const height = Math.max(180, Math.min(13, rows.length) * 28 + 16);

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-3.5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold text-text-bright">Transport scopes</h2><p className="text-sm text-text-muted">Retained data and memberships for the selected region.</p></div>
        <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching || query.isPending} className="rounded border border-border px-3 py-1.5 text-xs text-text-normal hover:bg-bg-raised disabled:opacity-50">Refresh scopes</button>
      </div>
      <label className="flex max-w-sm flex-col gap-1 text-xs text-text-muted">Find a scope
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="#bc, #east…" className="rounded border border-border bg-bg-raised px-3 py-2 text-base text-text-bright outline-none focus:border-primary sm:text-sm" />
      </label>
      {query.isError && <p role="alert" className="text-sm text-danger">Could not load scopes. Try refreshing.</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Scopes with data" value={value(totals.active)} accent={colors.secondary} />
        <StatCard label="Scoped packets" value={value(totals.packets)} accent={colors.primary} />
        <StatCard label="Observer memberships" value={value(totals.memberships)} accent={colors.green} />
        <StatCard label="Default-scope nodes" value={value(totals.nodes)} accent={colors.warn} />
      </div>
      <p className="text-xs leading-relaxed text-text-muted">An observer can appear in more than one scope. Global observer counts include stored memberships; regional counts use retained scoped receptions. Nodes are counted in their default scope. These counts have no selected time window.</p>
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <ChartCard title="Packets by scope" option={packets} height={height} isLoading={loading} isError={query.isError} isEmpty={!totals.packets} />
        <ChartCard title="Observer memberships by scope" option={observers} height={height} isLoading={loading} isError={query.isError} isEmpty={!totals.memberships} />
        <ChartCard title="Default-scope nodes" option={nodes} height={height} isLoading={loading} isError={query.isError} isEmpty={!totals.nodes} />
        <Card title="Scope counts" right={<span className="text-[10px] text-text-muted">{unavailable ? "—" : `${rows.length} of ${all.length} scopes`}</span>}>
          {unavailable ? <p className="py-6 text-sm text-text-muted">{query.isError ? "Data unavailable" : "Loading scopes…"}</p> : !rows.length ? <p className="py-6 text-sm text-text-muted">{search ? "No scopes match this search." : "No scope data available."}</p> : (
            <div className="max-h-[390px] overflow-auto"><table aria-label="Scope counts" className="w-full text-left font-mono text-[11px]">
              <thead className="text-text-muted"><tr><th scope="col" className="py-2">Scope</th><th scope="col" className="text-right">Packets</th><th scope="col" className="text-right">Observers</th><th scope="col" className="text-right">Nodes</th></tr></thead>
              <tbody>{rows.map((row) => <tr key={row.name} className="border-t border-border-subtle">
                <th scope="row" className="max-w-32 break-all py-2 pr-2 font-normal text-text-normal">{row.name}</th>
                <td className="text-right tabular-nums text-text-bright">{row.packetCount.toLocaleString()}</td><td className="text-right tabular-nums text-text-normal">{row.observerCount.toLocaleString()}</td><td className="text-right tabular-nums text-text-normal">{row.nodeCount.toLocaleString()}</td>
              </tr>)}</tbody>
            </table></div>
          )}
          <p className="mt-2 text-[11px] text-text-muted">Charts show the largest 12 scopes plus any remainder. The table keeps all matching scopes.</p>
        </Card>
      </div>
    </div>
  );
}
