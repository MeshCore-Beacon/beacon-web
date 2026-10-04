import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getNodesPage } from "../../api/client";
import { SelectDropdown } from "../../components/SelectDropdown";
import { nodeSearchParams } from "../nodes/node-search";
import { AtlasCard, type AtlasActions } from "./AtlasCard";
import { ATLAS_LIMIT, parseAtlas, type AtlasRange } from "./atlas";
import { useSavedAtlas } from "./useSavedAtlas";

export function MyAtlasPage({ active = true, ...actions }: AtlasActions & { active?: boolean }) {
  const { t } = useTranslation();
  const { saved, update, storageFailed } = useSavedAtlas();
  const [linkedKey] = useState(() => { const key = new URLSearchParams(window.location.search).get("atlasAdd") ?? ""; return /^[a-f\d]{64}$/i.test(key) ? key.toLowerCase() : ""; });
  const [searchOpen, setSearchOpen] = useState(!!linkedKey || saved.nodes.length === 0);
  const [text, setText] = useState(linkedKey);
  const [field, setField] = useState(linkedKey ? "pubkey" : "name");
  const [query, setQuery] = useState({ text: "", field: "name" });
  const [heardKey, setHeardKey] = useState<string | null>(null);
  useEffect(() => { const timer = setTimeout(() => setQuery({ text: text.trim(), field }), 300); return () => clearTimeout(timer); }, [text, field]);
  const valid = query.text.length >= 2 && (query.field !== "pubkey" || /^[a-f\d]{2,64}$/i.test(query.text));
  const ready = query.text === text.trim() && query.field === field && valid;
  const search = useQuery({ queryKey: ["atlas-search", query.field, query.text], queryFn: ({ signal }) => getNodesPage(undefined, { ...nodeSearchParams(query.field, query.text), limit: 8 }, signal), enabled: active && searchOpen && ready, staleTime: 30_000, retry: false });
  const full = saved.nodes.length >= ATLAS_LIMIT;
  const empty = saved.nodes.length === 0;
  return <section className="w-full min-w-0 overflow-y-auto" aria-label={t("tabs.MyAtlas")}>
    <div className="mx-auto max-w-[1600px] space-y-3 p-3 md:p-4">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <svg aria-hidden="true" viewBox="0 0 40 40" width="44" height="44" className="shrink-0 text-primary" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m5 10 10-4 10 4 10-4v24l-10 4-10-4-10 4Z" /><path d="M15 6v24M25 10v24M9 23l10-8 10 4" /><circle cx="19" cy="15" r="3" fill="var(--color-bg-base)" /><circle cx="29" cy="19" r="2" fill="var(--color-secondary)" /></svg>
          <div><h1 className="text-lg font-semibold tracking-tight text-text-bright">{t("tabs.MyAtlas")}</h1><p className="mt-1 text-sm">{t("atlas.subtitle")}</p></div>
        </div>
        <div role="group" aria-label={t("atlas.range")} className="flex rounded-sm border border-border bg-bg-surface p-1">
          {(["24h", "3d"] as AtlasRange[]).map(range => <button type="button" key={range} aria-pressed={saved.range === range} className={`min-h-10 rounded-md px-4 text-xs font-medium ${saved.range === range ? "bg-primary/15 text-primary" : "hover:bg-bg-raised"}`} onClick={() => update(value => ({ ...value, range }))}>{t(`atlas.ranges.${range}`)}</button>)}
        </div>
      </header>
      <details open={searchOpen} onToggle={event => setSearchOpen(event.currentTarget.open)} className="rounded-sm border border-border bg-bg-surface px-4 py-2">
        <summary className="min-h-11 cursor-pointer content-center text-sm text-text-bright">{t("atlas.addNodes")} <span className="ml-2 text-xs font-mono text-text-normal">{t("atlas.savedCount", { count: saved.nodes.length, limit: ATLAS_LIMIT })}</span></summary>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 basis-72 items-center gap-2">
            <SelectDropdown label={t("atlas.searchBy")} hideAll value={field} options={[{ value: "name", label: t("atlas.name") }, { value: "pubkey", label: t("atlas.publicKey") }]} onChange={setField} align="left" />
            <input type="search" maxLength={160} aria-label={t("atlas.search")} aria-describedby="atlas-search-help" value={text} onChange={event => setText(event.target.value)} placeholder={t(field === "pubkey" ? "atlas.keyPlaceholder" : "atlas.namePlaceholder")} className="min-h-11 min-w-0 flex-1 rounded-sm border border-border bg-bg-base px-3 text-sm text-text-bright placeholder:text-text-muted" />
          </div>
        </div>
        <p id="atlas-search-help" className="mt-2 text-xs">{t(full ? "atlas.limitReached" : "atlas.searchHelp", { limit: ATLAS_LIMIT })}</p>
        {ready && <div className="mt-3">
          {search.isPending ? <p role="status">{t("common.loading")}</p> : search.isError ? <p role="status">{t("common.loadFailed")} <button type="button" onClick={() => void search.refetch()} className="min-h-11 underline">{t("atlas.retry")}</button></p> : <>
            {!search.data?.items.length && <p role="status" className="text-sm">{t("atlas.noMatches")}</p>}
            {!search.data?.items.length && query.field === "pubkey" && /^[a-f\d]{64}$/i.test(query.text) && <button type="button" className="my-2 min-h-11 rounded border border-primary/30 bg-primary/10 px-3 text-xs text-primary disabled:opacity-40" disabled={full || saved.nodes.some(pin => pin.publicKey === query.text.toLowerCase())} onClick={() => update(value => parseAtlas(JSON.stringify({ ...value, nodes: [...value.nodes, { id: "", publicKey: query.text, name: "" }] })))}>{t("nodeTelemetry.addCard")}</button>}
            <ul className="grid gap-2 md:grid-cols-2">{search.data?.items.map(node => {
              const selected = saved.nodes.some(pin => pin.publicKey === node.publicKey.toLowerCase());
              const name = node.name || node.publicKey.slice(0, 12).toUpperCase();
              return <li key={node.publicKey} className="flex min-w-0 items-center justify-between gap-2 rounded-sm border border-border p-2 pl-3">
                <div className="min-w-0"><p className="break-words text-sm text-text-bright">{name}</p><p className="truncate font-mono text-[10px]">{node.publicKey.slice(0, 16).toUpperCase()} · {t(`atlas.roles.${node.nodeType}`)}</p></div>
                <button type="button" disabled={selected || full} aria-label={t(selected ? "atlas.addedName" : "atlas.addName", { name })} className="min-h-11 shrink-0 rounded border border-primary/30 bg-primary/10 px-3 text-xs text-primary disabled:border-border disabled:bg-bg-raised disabled:text-text-muted" onClick={() => update(value => parseAtlas(JSON.stringify({ ...value, nodes: [...value.nodes, { id: node.id, publicKey: node.publicKey, name: node.name || "" }] })))}>{t(selected ? "atlas.added" : "atlas.add")}</button>
              </li>;
            })}</ul>
            {search.data?.hasMore && <p className="mt-2 text-xs">{t("atlas.refine")}</p>}
          </>}
        </div>}
      </details>
      <p className={`text-xs ${storageFailed ? "text-warn" : "text-text-normal"}`} role="status">{t(storageFailed ? "atlas.storageFailed" : "atlas.localOnly")}</p>
      <p className="text-[10px] text-text-muted">{t("charts.gapLegend")}</p>
      {empty ? <section className="rounded-sm border border-dashed border-border px-5 py-12 text-center"><h2 className="text-lg font-medium text-text-bright">{t("atlas.emptyTitle")}</h2><p className="mx-auto mt-2 max-w-lg text-sm">{t("atlas.emptyDescription")}</p><div aria-hidden="true" className="mx-auto mt-6 flex h-10 max-w-48 items-end justify-center gap-1 opacity-40">{[3, 5, 4, 8, 6, 10, 7, 9, 6, 11, 8, 10].map((height, index) => <span key={index} className="w-3 rounded-t bg-primary" style={{ height: height * 3 }} />)}</div></section> : <div className="grid items-stretch gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {saved.nodes.map((pin, index) => <AtlasCard key={pin.publicKey} pin={pin} range={saved.range} active={active} first={index === 0} last={index === saved.nodes.length - 1} heardOpen={heardKey === pin.publicKey} onHeardToggle={() => setHeardKey(value => value === pin.publicKey ? null : pin.publicKey)} onRemove={() => update(value => ({ ...value, nodes: value.nodes.filter(node => node.publicKey !== pin.publicKey) }))} onMove={direction => update(value => {
          const nodes = [...value.nodes]; const from = nodes.findIndex(node => node.publicKey === pin.publicKey); const to = from + direction;
          if (from < 0 || to < 0 || to >= nodes.length) return value;
          [nodes[from], nodes[to]] = [nodes[to]!, nodes[from]!];
          return { ...value, nodes };
        })} {...actions} />)}
      </div>}
    </div>
  </section>;
}
