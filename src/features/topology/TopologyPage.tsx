import { LiveChatter } from "./chatter";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getScopeCatalogues } from "../../api/client";
import type { WsManager } from "../../api/ws-manager";
import { useRegion } from "../../hooks/useRegion";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useChartColors, nodeTypeColor } from "../stats/chartTheme";
import { NODE_TYPES } from "../../lib/node-types";
import { buildTopology, LiveTraffic, loadTopology, loadTopologyRoutes, ROUTE_WINDOWS, reportFromEvent, type LiveReport, type PacketKind, flowColor, linkContext } from "./topology";
import { TopologyCanvas } from "./TopologyCanvas";
import { BottomSheet } from "../../components/BottomSheet";

type Props = { wsManager: WsManager; active?: boolean; onViewNode: (id: string) => void; onViewObserver: (id: string) => void; onAnalyzePacket: (hash: string) => void };
const button = "min-h-11 rounded-sm border border-border bg-bg-surface px-3 text-xs text-text-bright hover:border-primary disabled:opacity-40";

export function TopologyPage(props: Props) {
  const { iatas, regionKey, isResolved } = useRegion();
  return <TopologySession key={regionKey} {...props} iatas={iatas} resolved={isResolved !== false} />;
}

function TopologySession({ wsManager, active = true, onViewNode, onViewObserver, onAnalyzePacket, iatas, resolved }: Props & { iatas: string[] | undefined; resolved: boolean }) {
  const { t } = useTranslation();
  const colors = useChartColors();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [animate, setAnimate] = useState(true);
  const [showChatter,setShowChatter] = useState(true);
  const [chatter] = useState(()=>new LiveChatter());
  const focus = iatas?.length === 1 ? iatas[0]! : "";
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const mobile = useMediaQuery("(max-width: 767px)");
  const section = useRef<HTMLElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [params, setParams] = useSearchParams();
  const selected = params.get("topoNode") || "";
  const showInspector = active && (searchOpen || !!selected);
  const requestedWindow = params.get("topoWindow") || "15m";
  const routeWindow = Object.hasOwn(ROUTE_WINDOWS, requestedWindow) ? requestedWindow as keyof typeof ROUTE_WINDOWS : "15m";
  const data = useQuery({ queryKey: ["topology", iatas ?? "*"], queryFn: ({ signal }) => loadTopology(iatas, signal), enabled: active && resolved, staleTime: 120_000, refetchOnWindowFocus: false });
  const routes = useQuery({ queryKey: ["topology-routes", iatas ?? "*", routeWindow], queryFn: ({ signal }) => loadTopologyRoutes(iatas, signal, ROUTE_WINDOWS[routeWindow]), enabled: active && resolved, staleTime: 60_000, retry: false, refetchOnWindowFocus: false, placeholderData: keepPreviousData });
  const catalogues = useQuery({ queryKey: ["scope-catalogues"], queryFn: getScopeCatalogues, enabled: showInspector && resolved, staleTime: 300_000, refetchInterval: 300_000, refetchIntervalInBackground: false, refetchOnWindowFocus: false, retry: false });
  const graph = useMemo(() => buildTopology(data.data?.nodes ?? [], iatas, routes.data?.routes ?? []), [data.data, iatas, routes.data]);
  const requestedCameraRegion = params.get("topoFocus") || focus;
  const cameraRegion = graph.regions.some(r => r.code === requestedCameraRegion) ? requestedCameraRegion : "";
  const select = useCallback(async (id: string) => {
    if (document.fullscreenElement && section.current?.contains(document.fullscreenElement)) await document.exitFullscreen().catch(() => {});
    setParams(prev => { const next = new URLSearchParams(prev); next.set("topoNode", id); const region = graph.byId.get(id)?.region; if (region) next.set("topoFocus", region); return next; });
  }, [setParams, graph]);
  const focusCamera = (code: string) => setParams(prev => { const next = new URLSearchParams(prev); if (code) next.set("topoFocus", code); else next.delete("topoFocus"); next.delete("topoNode"); return next; });
  const [traffic] = useState(() => new LiveTraffic());
  const [live, setLive] = useState<{ reports: LiveReport[]; tick: number; now: number; gap: boolean; capped: boolean }>(() => ({ reports: [], tick: 0, now: Date.now(), gap: false, capped: false }));
  const subscribe = useCallback((notify: () => void) => wsManager.onStatusChange(notify), [wsManager]);
  const status = useSyncExternalStore(subscribe, () => wsManager.getStatus());
  const receive = useEffectEvent((event: Parameters<typeof reportFromEvent>[0]) => {
    if (document.hidden || (iatas && !iatas.includes(event?.observation?.iata))) return;
    if (showChatter) chatter.observe(event,graph,Date.now());
    const report = reportFromEvent(event, graph, Date.now());
    if (report) traffic.add(report);
  });

  const receiveChat = useEffectEvent((event: Parameters<LiveChatter["message"]>[0]) => {
    if (!document.hidden && showChatter) chatter.message(event,Date.now());
  });
  useEffect(() => { if (!showChatter) chatter.clear(); },[showChatter,chatter]);
  useEffect(() => {
    if (!active || !resolved || !data.data) return;
    const packet = wsManager.onPacketObservation(event => receive(event));
    const messages = wsManager.onChannelMessage(event=>receiveChat(event));
    const lagged = wsManager.onLagged(() => {traffic.markGap();chatter.clear();});
    const visibility = () => { wsManager.setResolvePath(!document.hidden); if (document.hidden) { traffic.markGap(); traffic.clearFlows(); chatter.clear(); } };
    visibility();
    document.addEventListener("visibilitychange", visibility);
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      const now = Date.now(); traffic.prune(now);
      setLive(previous => ({ reports: [...traffic.reports], tick: previous.tick + 1, now, gap: traffic.gapUntil > now, capped: traffic.cappedUntil > now }));
    }, 500);
    return () => { packet(); messages(); lagged(); chatter.clear(); clearInterval(timer); document.removeEventListener("visibilitychange", visibility); wsManager.setResolvePath(false); traffic.clearFlows(); traffic.markGap(); };
  }, [active, resolved, data.data, iatas, traffic, wsManager, chatter]);

  const counts = useMemo(() => {
    const observers = new Map<string, { name: string; count: number; iata: string }>();
    const kinds: Record<PacketKind, number> = { advert: 0, text: 0, trace: 0, ack: 0, other: 0 };
    for (const report of live.reports) { const old = observers.get(report.observerId); observers.set(report.observerId, { name: report.observerName, count: (old?.count ?? 0) + 1, iata: report.iata }); kinds[report.kind]++; }
    return { observers: [...observers].sort((a, b) => b[1].count - a[1].count), kinds, paths: live.reports.filter(r => r.segments.length).length };
  }, [live.reports]);
  const matches = useMemo(() => search.trim() ? graph.nodes.filter(n => `${n.name ?? ""} ${n.publicKey}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 30) : [], [graph.nodes, search]);
  const node = graph.byId.get(selected);
  const catalogue = catalogues.data?.find(c => c.iata === (node?.region || focus));
  const catalogueStale = catalogue && (!!catalogue.lastError || !catalogue.checkedAt || live.now > catalogue.freshUntil);
  const visibleNeighbours = node ? graph.links.filter(([a, b]) => a === node.id || b === node.id).map(([a, b]) => graph.byId.get(a === node.id ? b : a)!) : [];
  const neighbours = visibleNeighbours.slice(0, 12);
  const share = async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); } catch { setCopied(false); } };
  const closeInspector = () => {
    setSearchOpen(false); setSearch("");
    setParams(prev => { const next = new URLSearchParams(prev); next.delete("topoNode"); return next; });
    section.current?.querySelector("canvas")?.focus();
  };
  const openInspector = async () => {
    if (document.fullscreenElement && section.current?.contains(document.fullscreenElement)) await document.exitFullscreen().catch(() => {});
    setSearchOpen(true);
  };
  useEffect(() => { if (searchOpen && active) searchInput.current?.focus(); }, [searchOpen, active]);
  const inspector = <div className="space-y-3 overflow-y-auto p-2">
          <div className="rounded-sm border border-border bg-bg-surface p-3">
            <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-text-bright">{t("topology.inspector")}</h2><button className={button} onClick={closeInspector}>{t("topology.close")}</button></div>
            <input ref={searchInput} className="min-h-11 w-full rounded border border-border bg-bg-base px-3 text-sm text-text-bright" aria-label={t("topology.search")} placeholder={t("topology.search")} value={search} onChange={e => setSearch(e.target.value)} />
            <div className="mt-2 max-h-44 overflow-y-auto">{matches.map(n => <button key={n.id} className={`flex min-h-9 w-full items-center justify-between gap-2 rounded px-2 text-left text-xs ${selected === n.id ? "bg-primary/15 text-primary" : "text-text-normal hover:bg-bg-raised"}`} onClick={() => select(n.id)} aria-pressed={selected === n.id}><span className="truncate">{n.name || n.publicKey.slice(0, 10)}</span><span className="shrink-0 font-mono text-[10px]">{n.region}</span></button>)}{search.trim() && !matches.length && <p className="py-3 text-xs text-text-muted">{t("topology.noNodes")}</p>}</div>
            {node && <div className="mt-3 space-y-2 border-t border-border pt-3"><h3 className="break-words text-sm text-text-bright">{node.name || node.publicKey.slice(0, 12)}</h3><p className="text-xs text-text-normal">{t("topology.neighbours", { count: visibleNeighbours.length })}</p><div className="flex flex-wrap gap-2"><button className={button} onClick={() => onViewNode(node.id)}>{t("topology.nodeDetails")}</button>{node.observerId && <button className={button} onClick={() => onViewObserver(node.observerId!)}>{t("topology.observerDetails")}</button>}<button className={button} onClick={() => setParams(prev => { const next = new URLSearchParams(prev); next.delete("topoNode"); return next; })}>{t("topology.clear")}</button></div>
              {node.defaultScope && <p className="break-words text-xs text-green">{t("topology.defaultScope")}: {node.defaultScope}</p>}
              {visibleNeighbours.length > 12 && <p className="text-[10px] text-text-muted">{t("topology.neighbourLimit", { count: visibleNeighbours.length })}</p>}
              <div className="max-h-40 overflow-y-auto">{neighbours.map(neighbour => { const context = linkContext(node, neighbour); const listed = context.sharedDefault && catalogues.data?.some(c => (c.iata === node.region || c.iata === neighbour.region) && c.scopes.some(scope => scope.name === context.sharedDefault)); return <button key={neighbour.id} className="flex min-h-10 w-full items-center justify-between gap-2 border-t border-border-subtle text-left text-xs text-text-normal" onClick={() => select(neighbour.id)}><span className="truncate">{neighbour.name || neighbour.publicKey.slice(0, 8)}</span><span className={`shrink-0 font-mono text-[10px] ${context.sharedDefault ? "text-green" : "text-primary"}`} title={listed ? t("topology.cataloguedLink") : undefined}>{context.sharedDefault || `${node.region} ↔ ${neighbour.region}`}{listed ? " · MM" : ""}</span></button>; })}</div>
            </div>}
          </div>
          {(focus || node) && <div className="rounded-sm border border-border bg-bg-surface p-3"><h2 className="text-sm font-semibold text-text-bright">MeshMapper · {node?.region || focus}</h2>
            {catalogue ? <><p className={`my-2 text-xs ${catalogueStale ? "text-warn" : "text-text-normal"}`}>{t(catalogueStale ? "topology.catalogueStale" : "topology.catalogueFresh")}</p>{catalogue.generatedAt > 0 && <p className="text-[11px] text-text-normal">{t("topology.catalogueCounts", { count: catalogue.scoped, total: catalogue.repeaters })}</p>}<div className="mt-2 max-h-32 overflow-y-auto">{catalogue.scopes.map(scope => <div key={scope.name} className="flex justify-between gap-2 py-1 text-xs"><span className={scope.name === node?.defaultScope ? "text-green" : "text-text-normal"}>{scope.name}{scope.monitored ? " ◉" : ""}</span><span className="font-mono text-text-muted">{scope.repeaters}</span></div>)}</div><p className="mt-2 text-[10px] text-text-muted">{t("topology.catalogueChecked")}: {catalogue.checkedAt ? new Date(catalogue.checkedAt).toLocaleString() : "—"}</p></> : <p className="mt-2 text-xs text-text-muted">{t(catalogues.isLoading ? "topology.loading" : catalogues.isError ? "topology.catalogueError" : "topology.noCatalogue")}</p>}
            <p className="mt-2 text-[10px] text-text-muted">{t("topology.catalogueMeaning")}</p>
          </div>}

  </div>;
  const compactButton = "min-h-8 rounded border border-border bg-bg-surface px-2 text-[11px] text-text-bright hover:border-primary";
  const controls = <>
    <select className={`${compactButton} max-w-32`} aria-label={t("topology.routeWindow")} value={routeWindow} onChange={e => setParams(prev => { const next = new URLSearchParams(prev); next.set("topoWindow", e.target.value); return next; })}>
      {Object.keys(ROUTE_WINDOWS).map(value => <option key={value} value={value}>{t(`topology.windows.${value}`)}</option>)}
    </select>
    <button className={compactButton} aria-expanded={showInspector} onClick={showInspector ? closeInspector : openInspector}>{t(showInspector ? "topology.hideInspector" : "topology.find")}</button>
  </>;
  const settings = <>
    <label className="flex min-h-9 items-center gap-2 text-xs text-text-normal"><input type="checkbox" checked={showChatter} onChange={e=>setShowChatter(e.target.checked)} />{t("topology.publicChatter")}</label>
    <p className="text-[10px] text-text-muted">{t("topology.chatterHint")}</p>
    <label className="flex min-h-11 items-center gap-2 text-xs text-text-normal"><input type="checkbox" checked={animate && !reducedMotion} disabled={reducedMotion} onChange={e => setAnimate(e.target.checked)} />{t(reducedMotion ? "topology.reducedMotion" : "topology.motion")}</label>
    <div className="flex flex-wrap gap-3 border-t border-border pt-3 text-[11px] text-text-normal">
      {NODE_TYPES.map(type => <span key={type.name} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: nodeTypeColor(type.name, colors) }} />{t(`topology.types.${type.name}`)}</span>)}
      <span>{t("topology.observerRing")}</span><span style={{ color: colors.secondary }}>━ {t("topology.routeSegments")}</span><span className="text-primary">┄ {t("topology.crossRegion")}</span><span className="text-green">━ {t("topology.sharedDefault")}</span>
    </div>
    <div className="flex flex-wrap gap-2 border-t border-border pt-3">
      <button className={button} onClick={share}>{t(copied ? "topology.copied" : "topology.copy")}</button>
      <button className={button} disabled={data.isFetching || routes.isFetching || !active || !resolved} onClick={() => { data.refetch(); routes.refetch(); }}>{t("topology.refresh")}</button>
    </div>
  </>;
  const heading = <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex items-center gap-2"><h1 className="text-base font-semibold text-text-bright">{t("topology.title")}</h1>
          <span className={`flex items-center gap-1.5 text-xs ${status !== "connected" ? "text-warn" : "text-green"}`} role="status"><span className="h-2 w-2 rounded-full bg-current beacon-live-dot" />{t(status === "connected" ? "topology.live" : "topology.reconnecting")}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-normal">
          <span><b className="font-mono text-text-bright">{data.data ? graph.nodes.length.toLocaleString() : "—"}</b> {t("topology.nodes")}</span>
          <span aria-busy={routes.isFetching}><b className="font-mono text-text-bright">{data.data ? graph.links.length.toLocaleString() : "—"}</b> {t("topology.links")}</span>
          {routes.isFetching && <span role="status" className="text-primary">{t("topology.loadingRoutes")}</span>}
        </div>
      </div>;
  return <section ref={section} className="h-full min-h-0 w-full min-w-0 overflow-hidden p-2 md:p-3" aria-label={t("topology.title")}>
    <div className="mx-auto flex h-full min-h-0 max-w-[2000px] flex-col gap-2">

      {data.isError && <p role="alert" className="text-sm text-danger">{t("topology.loadError")} <button className={button} onClick={() => data.refetch()}>{t("topology.refresh")}</button></p>}
      {data.isLoading && <p role="status" className="text-sm text-text-normal">{t("topology.loading")}</p>}
      {routes.isError && <p role="alert" className="text-xs text-warn">{t("topology.routesError")} <button className={button} onClick={() => routes.refetch()}>{t("topology.refresh")}</button></p>}
      {(data.data?.capped || routes.data?.capped || graph.linksCapped || live.capped) && <p className="text-xs text-warn">{t("topology.bounded")}</p>}
      <div className={`grid min-h-0 flex-1 min-w-0 items-stretch gap-3 ${showInspector && !mobile ? "md:grid-cols-[minmax(0,1fr)_300px]" : ""}`}>
        <TopologyCanvas graph={graph} traffic={traffic} chatter={chatter} colors={colors} selected={selected} onSelect={select} region={cameraRegion} onRegion={focusCamera} heading={heading} controls={controls} settings={settings}
          motion={animate && !reducedMotion} active={active} tick={live.tick} />
        {showInspector && !mobile && <aside aria-label={t("topology.inspector")} className="min-h-0 min-w-0 overflow-y-auto rounded-sm border border-border bg-bg-surface">{inspector}</aside>}
      </div>
      {showInspector && mobile && <BottomSheet onClose={closeInspector} label={t("topology.inspector")}>{inspector}</BottomSheet>}
      <details className="max-h-[35%] shrink-0 overflow-y-auto rounded-sm border border-border bg-bg-surface" onToggle={e => setActivityOpen(e.currentTarget.open)}>
        <summary className={`${activityOpen ? "min-h-9 text-xs" : "min-h-7 text-[11px]"} cursor-pointer content-center px-2 text-text-normal`}>
          <span className="font-semibold text-text-bright">{t("topology.activity")}</span>
          <span className="ml-2">{t("topology.activityCounts", { count: live.reports.length, observers: counts.observers.length })}</span>
          {live.gap && <span className="ml-2 text-warn" title={t("topology.gap")}>{t("topology.incomplete")}</span>}
        </summary>
        {activityOpen && <div className="space-y-3 p-3 pt-0">
          {live.gap && <p className="text-xs text-warn">{t("topology.gap")}</p>}
          <div className="rounded-sm border border-border bg-bg-surface p-3">
            <div className="flex justify-between text-xs text-text-normal"><span>{t("topology.mix")}</span><span>{t("topology.paths", { count: counts.paths })}</span></div>
            <div className="my-3 flex h-2 overflow-hidden rounded bg-bg-raised">{Object.entries(counts.kinds).map(([kind, count]) => <div key={kind} style={{ width: `${100 * count / Math.max(1, live.reports.length)}%`, background: flowColor(kind as PacketKind, colors) }} />)}</div>
            <div className="flex flex-wrap gap-4 text-[11px] text-text-normal">{Object.entries(counts.kinds).map(([kind, count]) => <span key={kind}><span style={{ color: flowColor(kind as PacketKind, colors) }}>●</span> {t(`topology.kinds.${kind}`)} <b className="text-text-bright">{count}</b></span>)}</div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-sm border border-border bg-bg-surface p-3"><h2 className="mb-2 text-sm font-semibold text-text-bright">{t("topology.reporting")}</h2><div className="max-h-48 space-y-2 overflow-y-auto">{counts.observers.slice(0, 20).map(([id, observer]) => <button key={id} className="relative flex min-h-10 w-full items-center justify-between gap-2 overflow-hidden rounded bg-bg-base px-2 text-left text-xs text-text-bright" onClick={() => onViewObserver(id)}><span className="absolute inset-y-0 left-0 bg-primary/15" style={{ width: `${100 * observer.count / (counts.observers[0]?.[1].count || 1)}%` }} /><span className="relative truncate">{observer.name}</span><span className="relative shrink-0 font-mono text-primary">{observer.count}</span></button>)}{!counts.observers.length && <p className="py-2 text-xs text-text-muted">{t("topology.listening")}</p>}</div></div>
          <div className="rounded-sm border border-border bg-bg-surface p-3"><h2 className="mb-2 text-sm font-semibold text-text-bright">{t("topology.latest")}</h2><div className="max-h-64 divide-y divide-border-subtle overflow-y-auto">{live.reports.slice(-10).reverse().map(report => <button key={report.key} className="flex min-h-12 w-full items-center gap-2 py-2 text-left text-xs text-text-normal" onClick={() => onAnalyzePacket(report.hash)}><span style={{ color: flowColor(report.kind, colors) }}>●</span><span className="min-w-0 flex-1"><span className="block font-mono text-text-bright">{report.hash.slice(0, 8)} <span className="text-primary">{report.iata}</span> <span className="text-green">{report.scope}</span></span><span className="block truncate">{report.observerName}</span></span><span className="max-w-24 text-right text-[10px]">{t(report.segments.length ? report.partial ? "topology.partialPath" : "topology.path" : "topology.noPath")}</span></button>)}</div></div>

          </div>
        </div>}
      </details>
    </div>
  </section>;
}
