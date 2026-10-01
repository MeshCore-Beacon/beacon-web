import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { InfoTip } from "../../components/InfoTip";
import { getObserver, getObserverComparison } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { OBSERVER_UUID } from "../observers/observer-id";
import { ObserverPicker } from "../observers/ObserverPicker";
import { Card } from "./cards";

type Selection = { observerA: string; observerB: string; since: number; until: number };
const fieldClass = "min-w-0 w-full max-w-full appearance-none rounded border border-border bg-bg-base px-2.5 py-1.5 font-mono text-base text-text-normal sm:text-[12px]";
const labelClass = "font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted";

function validation(value: Selection): string | null {
  if (!OBSERVER_UUID.test(value.observerA) || !OBSERVER_UUID.test(value.observerB) || value.observerA.toLowerCase() === value.observerB.toLowerCase()) {
    return "observerCompare.invalidPair";
  }
  if (!Number.isSafeInteger(value.since) || !Number.isSafeInteger(value.until) || value.since < 0 || value.until <= value.since || value.until > 253402300799999) {
    return "observerCompare.invalidRange";
  }
  return null;
}

// raw packets are kept 3-7 days depending on the instance
const RETENTION_HINT_MS = 7 * 86_400_000;

function localTime(ms: number) {
  const date = new Date(ms);
  return new Date(ms - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function ObserverSelect({ label, value, onChange, excludeId }: { label: string; value: string; onChange: (id: string) => void; excludeId?: string }) {
  const { t } = useTranslation();
  const selected = useQuery({
    queryKey: ["observer", value], queryFn: () => getObserver(value),
    enabled: OBSERVER_UUID.test(value), staleTime: 30_000, retry: false,
  });
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className={labelClass}>{label}</span>
      <ObserverPicker label={label} id={value} name={value ? selected.data?.displayName ?? value.slice(0, 8) : t("observerCompare.chooseObserver")} excludeId={excludeId} onSelect={onChange} />
    </div>
  );
}

function ComparisonForm({ initial, onCompare }: { initial: Selection | null; onCompare: (value: Selection) => void }) {
  const { t } = useTranslation();
  const [a, setA] = useState(initial?.observerA ?? "");
  const [b, setB] = useState(initial?.observerB ?? "");
  const [since, setSince] = useState(() => localTime(initial?.since ?? Math.floor((Date.now() - 86_400_000) / 60_000) * 60_000));
  const [until, setUntil] = useState(() => localTime(initial?.until ?? Math.floor(Date.now() / 60_000) * 60_000));
  const [error, setError] = useState<string | null>(null);
  const [retainedSince] = useState(() => Date.now() - RETENTION_HINT_MS);
  function submit(e: FormEvent) {
    e.preventDefault();
    const value = { observerA: a.toLowerCase(), observerB: b.toLowerCase(), since: new Date(since).getTime(), until: new Date(until).getTime() };
    const message = validation(value);
    setError(message);
    if (!message) onCompare(value);
  }
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid gap-3 md:grid-cols-2">
        <ObserverSelect label={t("observerCompare.observerA")} value={a} onChange={setA} excludeId={b} />
        <ObserverSelect label={t("observerCompare.partner")} value={b} onChange={setB} excludeId={a} />
        <label className="flex min-w-0 flex-col gap-1.5"><span className={labelClass}>{t("observerCompare.start")}</span>
          <input type="datetime-local" step="60" value={since} onChange={(e) => setSince(e.target.value)} className={fieldClass} />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5"><span className={labelClass}>{t("observerCompare.end")}</span>
          <input type="datetime-local" step="60" value={until} onChange={(e) => setUntil(e.target.value)} className={fieldClass} />
        </label>
      </div>
      {new Date(since).getTime() < retainedSince && <p className="text-sm text-warn">{t("observerCompare.retentionWarning")}</p>}
      {error && <p role="alert" className="text-sm text-danger">{t(error)}</p>}
      <button type="submit" className="rounded border border-primary-dim bg-primary/10 px-3 py-1.5 font-mono text-xs font-semibold text-primary hover:bg-primary/15">{t("observerCompare.compare")}</button>
    </form>
  );
}

export function CompareObserversTab() {
  const { t } = useTranslation();
  const { iatas, regionKey } = useRegion();
  const [params, setParams] = useSearchParams();
  const keys = ["compareA", "compareB", "compareSince", "compareUntil"];
  const supplied = keys.some((key) => params.has(key));
  const parsed: Selection = {
    observerA: params.get("compareA") ?? "", observerB: params.get("compareB") ?? "",
    since: Number(params.get("compareSince")), until: Number(params.get("compareUntil")),
  };
  const valid = keys.every((key) => params.getAll(key).length === 1 && params.get(key) !== "") && !validation(parsed);
  const selection = valid ? parsed : null;
  const result = useQuery({
    queryKey: ["observer-comparison", regionKey, selection],
    queryFn: ({ signal }) => getObserverComparison(iatas, selection!, signal),
    enabled: selection !== null,
    retry: false, staleTime: 30_000, refetchOnWindowFocus: false,
  });
  const observerA = useQuery({
    queryKey: ["observer", selection?.observerA], queryFn: () => getObserver(selection!.observerA),
    enabled: selection !== null, staleTime: 30_000, retry: false,
  });
  const observerB = useQuery({
    queryKey: ["observer", selection?.observerB], queryFn: () => getObserver(selection!.observerB),
    enabled: selection !== null, staleTime: 30_000, retry: false,
  });
  function compare(value: Selection) {
    if (selection && Object.entries(value).every(([key, v]) => selection[key as keyof Selection] === v)) {
      void result.refetch();
      return;
    }
    setParams((old) => {
      const next = new URLSearchParams(old);
      next.set("compareA", value.observerA); next.set("compareB", value.observerB);
      next.set("compareSince", String(value.since)); next.set("compareUntil", String(value.until));
      return next;
    });
  }
  const data = result.data;
  const groups = data ? [
    { name: t("observerCompare.onlyA"), count: data.onlyA, color: "var(--color-primary)" },
    { name: t("observerCompare.both"), count: data.both, color: "var(--color-green)" },
    { name: t("observerCompare.onlyB"), count: data.onlyB, color: "var(--color-secondary)" },
  ] : [];
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1200px] flex-col gap-3.5 p-4">
      <div className="flex items-center gap-2"><h2 className="text-lg font-semibold text-text-bright">{t("observerCompare.title")}</h2><InfoTip text={t("observerCompare.retainedWindow")} /></div>
      <Card title={t("observerCompare.selection")}>
        {supplied && !valid && <p role="alert" className="mb-3 text-sm text-danger">{t("observerCompare.invalidLink")}</p>}
        <ComparisonForm key={keys.map((key) => params.get(key)).join("|")} initial={selection} onCompare={compare} />
      </Card>
      {selection && <Card title={t("observerCompare.floodHeard")}>
        <p className="mb-2 break-words text-sm text-text-normal">{t("observerCompare.pair", { a: observerA.data?.displayName ?? selection.observerA, b: observerB.data?.displayName ?? selection.observerB })}</p>
        <p className="mb-3 flex flex-wrap items-center gap-x-2 break-words text-sm text-text-muted">{new Date(selection.since).toLocaleString()} – {new Date(selection.until).toLocaleString()} · {iatas?.join(", ") || t("observerCompare.allRegions")}<InfoTip text={t("observerCompare.localTimeNote")} /></p>
        {result.isFetching && <p role="status" className="text-sm text-text-muted">{t("observerCompare.comparing")}</p>}
        {result.isError && <div role="alert" className="text-sm text-danger"><p>{result.error.message}</p><button type="button" onClick={() => void result.refetch()} className="mt-2 text-primary">{t("observerCompare.retryComparison")}</button></div>}
        {data && !result.isError && <>
          <p className="mb-3 flex items-center gap-2 text-lg font-semibold text-text-bright">{t("observerCompare.packetsTotal", { count: data.totalPackets, value: data.totalPackets.toLocaleString() })}<InfoTip text={t("observerCompare.percentNote")} /></p>
          {data.totalPackets === 0 ? <p className="text-sm text-text-muted">{t("observerCompare.emptyRegion")}</p> : <>
            <div aria-hidden className="mb-4 flex h-5 overflow-hidden rounded">{groups.map((g) => <div key={g.name} style={{ width: `${g.count / data.totalPackets * 100}%`, background: g.color }} />)}</div>
            <table className="w-full text-left text-sm tabular-nums" aria-label={t("observerCompare.tableLabel")}>
              <thead className="text-text-muted"><tr><th scope="col">{t("observerCompare.heardBy")}</th><th scope="col" className="text-right">{t("observerCompare.packets")}</th><th scope="col" className="text-right">{t("observerCompare.percentUnion")}</th></tr></thead>
              <tbody>{groups.map((g) => <tr key={g.name} className="border-t border-border"><th scope="row" className="py-2 font-normal text-text-normal"><span aria-hidden className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: g.color }} />{g.name}</th><td className="text-right">{g.count.toLocaleString()}</td><td className="text-right">{(g.count / data.totalPackets * 100).toFixed(1)}%</td></tr>)}</tbody>
            </table>
          </>}
        </>}
      </Card>}
    </div>
  );
}
