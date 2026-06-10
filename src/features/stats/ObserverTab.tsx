import { useEffect, useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { formatBattery, formatCount, formatUptime } from "../../lib/formatters";
import { getObserversPage } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { useChartColors } from "./chartTheme";
import { useTopObservers } from "./useStats";
import { useObserver, useObserverTelemetry } from "./useTelemetry";
import { useTick } from "../../hooks/useTick";
import { deriveObserverStatus } from "../observers/observer-status";
import { airtimeOption, batteryOption, noiseFloorOption, queueOption, receiveErrorsOption } from "./chartOptions";
import { Card, ChartCard } from "./cards";
import { hasTelemetry } from "./transforms";
import { useLiveObserver } from "./useLiveStats";
import type { WsManager } from "../../api/ws-manager";
import type { Observer } from "../observers/types";
import type { StatsRange } from "./types";

function ObserverList({
  range,
  selectedId,
  onSelect,
}: {
  range: StatsRange;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { iatas, regionKey } = useRegion();
  const [query, setQuery] = useState("");
  const q = query.trim();
  const searching = q.length > 0;

  // default: top observers by activity (with count + activity bar). Searching swaps to a server-side
  // name lookup across ALL observers in the region, not just the loaded top rows.
  const top = useTopObservers(range, 15);
  const max = useMemo(() => Math.max(1, ...(top.data ?? []).map((o) => o.observationCount)), [top.data]);

  const search = useQuery({
    queryKey: ["observer-search", regionKey, q],
    queryFn: () => getObserversPage(iatas, { name: q, limit: 50 }),
    enabled: searching,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  type Row = { id: string; name: string; count?: number; iata?: string; online?: boolean };
  const rows: Row[] = searching
    ? (search.data?.items ?? []).map((o) => ({ id: o.id, name: o.displayName ?? o.id.slice(0, 8), iata: o.iata, online: o.status === "online" }))
    : (top.data ?? []).map((o) => ({ id: o.observerId, name: o.displayName ?? o.observerId.slice(0, 8), count: o.observationCount }));

  const loading = searching ? search.isLoading : top.isLoading;

  return (
    <Card title="Observers" className="w-full">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search observers…"
        className="mb-2 w-full rounded border border-border bg-bg-base px-2 py-1 font-mono text-[12px] text-text-normal placeholder:text-text-dim"
      />
      <div className="flex flex-col gap-0.5">
        {loading && <div className="py-6 text-center font-mono text-[11px] text-text-dim">{searching ? "Searching…" : "Loading…"}</div>}
        {!loading && rows.length === 0 && (
          <div className="py-6 text-center font-mono text-[11px] text-text-dim">{searching ? "No matches" : "No observers"}</div>
        )}
        {rows.map((r) => {
          const active = r.id === selectedId;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelect(r.id)}
              className={`relative overflow-hidden rounded border-l-2 px-2.5 py-1.5 text-left transition-colors cursor-pointer ${
                active ? "border-primary bg-primary/10" : "border-transparent hover:bg-white/3"
              }`}
            >
              {r.count != null && (
                <div
                  className="absolute inset-y-0 left-0 bg-secondary/10"
                  style={{ width: `${(r.count / max) * 100}%` }}
                  aria-hidden
                />
              )}
              <div className="relative flex items-center justify-between gap-2">
                <span className={`truncate font-mono text-[12px] ${active ? "text-text-bright" : "text-text-normal"}`}>{r.name}</span>
                {r.count != null ? (
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-muted">{formatCount(r.count)}</span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-text-muted">
                    {r.iata}
                    <span className={`h-1.5 w-1.5 rounded-full ${r.online ? "bg-green" : "bg-text-dim/30"}`} aria-hidden />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function ObserverHeader({ observer }: { observer: Observer }) {
  useTick(); // keep the recency-derived status badge fresh
  const status = deriveObserverStatus(observer);
  const radio = [
    observer.radioFreqMhz && `${observer.radioFreqMhz} MHz`,
    observer.radioSf && `SF${observer.radioSf}`,
    observer.radioBwKhz && `${observer.radioBwKhz} kHz`,
    observer.radioCr && `CR 4/${observer.radioCr}`,
  ].filter(Boolean) as string[];

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <span className="text-text-bright normal-case">{observer.displayName ?? observer.id.slice(0, 8)}</span>
          <Badge variant={status === "online" ? "live" : "offline"}>{status}</Badge>
          {observer.observerType && <Badge variant="default">{observer.observerType}</Badge>}
        </span>
      }
      right={
        <span className="rounded-sm bg-primary/6 px-1.5 py-px font-mono text-[12px] font-semibold text-primary">{observer.iata}</span>
      }
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 font-mono text-[12px]">
        <Metric label="Battery" value={observer.batteryLevel != null ? formatBattery(observer.batteryLevel) : "—"} />
        <Metric label="Uptime" value={observer.uptimeSeconds != null ? formatUptime(observer.uptimeSeconds) : "—"} />
        <Metric label="Observations" value={observer.observationCount.toLocaleString()} />
        {radio.length > 0 && <Metric label="Radio" value={radio.join(" · ")} />}
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-text-dim">{label} </span>
      <span className="text-text-normal">{value}</span>
    </span>
  );
}

interface ObserverTabProps {
  range: StatsRange;
  selectedObserverId: string | null;
  onSelectObserver: (observerId: string) => void;
  wsManager: WsManager;
}

export function ObserverTab({ range, selectedObserverId, onSelectObserver, wsManager }: ObserverTabProps) {
  const colors = useChartColors();
  useLiveObserver(wsManager, selectedObserverId, range);
  const topObservers = useTopObservers(range, 15);
  const observer = useObserver(selectedObserverId);
  const telemetry = useObserverTelemetry(selectedObserverId, range);

  // default to the busiest observer once the list loads and nothing is selected
  useEffect(() => {
    if (selectedObserverId) return;
    const first = topObservers.data?.[0];
    if (first) onSelectObserver(first.observerId);
  }, [selectedObserverId, topObservers.data, onSelectObserver]);

  const points = useMemo(() => telemetry.data?.points ?? [], [telemetry.data]);
  const airtime = useMemo(() => airtimeOption(points, colors), [points, colors]);
  const battery = useMemo(() => batteryOption(points, colors), [points, colors]);
  const noise = useMemo(() => noiseFloorOption(points, colors), [points, colors]);
  const queue = useMemo(() => queueOption(points, colors), [points, colors]);
  const recvErrors = useMemo(() => receiveErrorsOption(points, colors), [points, colors]);

  // Bots / MQTT bridges report status but no device telemetry — show one clear empty state rather
  // than five flat-zero charts. When some telemetry exists, gate each chart on its own metric.
  const ready = !telemetry.isLoading && !telemetry.isError;
  const noTelemetry = ready && !hasTelemetry(points);
  // a chart is empty when none of its metric(s) have a non-null value across the window
  const missing = (...accessors: ((p: (typeof points)[number]) => number | null)[]) =>
    ready && !points.some((p) => accessors.some((a) => a(p) != null));

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-3.5 px-4 py-4 lg:flex-row">
      <div className="w-full shrink-0 lg:w-[260px]">
        <ObserverList range={range} selectedId={selectedObserverId} onSelect={onSelectObserver} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3.5">
        {!selectedObserverId ? (
          <Card title="Telemetry">
            <EmptyState title="Select an observer" subtitle="Pick an observer to view its telemetry" />
          </Card>
        ) : (
          <>
            {observer.data && <ObserverHeader observer={observer.data} />}
            {noTelemetry ? (
              <Card title="Telemetry">
                <EmptyState title="No telemetry reported" subtitle="This observer publishes status but no device telemetry" />
              </Card>
            ) : (
              <>
                <ChartCard
                  title={<>Airtime TX / RX · {range}</>}
                  height={180}
                  option={airtime}
                  isLoading={telemetry.isLoading}
                  isError={telemetry.isError}
                  isEmpty={missing((p) => p.airtimeTxPct, (p) => p.airtimeRxPct)}
                />
                <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
                  <ChartCard title="Battery" height={168} option={battery} isLoading={telemetry.isLoading} isError={telemetry.isError} isEmpty={missing((p) => p.batteryMv)} />
                  <ChartCard title="Noise floor" height={168} option={noise} isLoading={telemetry.isLoading} isError={telemetry.isError} isEmpty={missing((p) => p.noiseFloorDb)} />
                  <ChartCard title="Queue length" height={168} option={queue} isLoading={telemetry.isLoading} isError={telemetry.isError} isEmpty={missing((p) => p.queueLength)} />
                  <ChartCard title="Receive errors" height={168} option={recvErrors} isLoading={telemetry.isLoading} isError={telemetry.isError} isEmpty={missing((p) => p.receiveErrors)} />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
