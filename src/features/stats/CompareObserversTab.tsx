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
    return "Choose two different observers.";
  }
  if (!Number.isSafeInteger(value.since) || !Number.isSafeInteger(value.until) || value.since < 0 || value.until <= value.since || value.until > 253402300799999) {
    return "Choose a valid start and a later end time.";
  }
  return null;
}

function localTime(ms: number) {
  const date = new Date(ms);
  return new Date(ms - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 23);
}

function ObserverSelect({ label, value, onChange, excludeId }: { label: string; value: string; onChange: (id: string) => void; excludeId?: string }) {
  const selected = useQuery({
    queryKey: ["observer", value], queryFn: () => getObserver(value),
    enabled: OBSERVER_UUID.test(value), staleTime: 30_000, retry: false,
  });
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className={labelClass}>{label}</span>
      <ObserverPicker label={label} id={value} name={value ? selected.data?.displayName ?? value.slice(0, 8) : "Choose an observer"} excludeId={excludeId} onSelect={onChange} />
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
        <ObserverSelect label="Observer A" value={a} onChange={setA} excludeId={b} />
        <ObserverSelect label="Observer B" value={b} onChange={setB} excludeId={a} />
        <label className="flex min-w-0 flex-col gap-1.5"><span className={labelClass}>Start (local time)</span>
          <input type="datetime-local" step="0.001" value={since} onChange={(e) => setSince(e.target.value)} className={fieldClass} />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5"><span className={labelClass}>End (local time)</span>
          <input type="datetime-local" step="0.001" value={until} onChange={(e) => setUntil(e.target.value)} className={fieldClass} />
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{t(error, { defaultValue: error })}</p>}
      <button type="submit" className="rounded border border-primary-dim bg-primary/10 px-3 py-1.5 font-mono text-xs font-semibold text-primary hover:bg-primary/15">Compare</button>
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
    { name: "Only A", count: data.onlyA, color: "var(--color-primary)" },
    { name: "Both", count: data.both, color: "var(--color-green)" },
    { name: "Only B", count: data.onlyB, color: "var(--color-secondary)" },
  ] : [];
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1200px] flex-col gap-3.5 p-4">
      <div className="flex items-center gap-2"><h2 className="text-lg font-semibold text-text-bright">Compare observers</h2><InfoTip text={t("observerCompare.retainedWindow")} /></div>
      <Card title="Selection">
        {supplied && !valid && <p role="alert" className="mb-3 text-sm text-danger">This comparison link has invalid or missing values. Choose observers and dates below.</p>}
        <ComparisonForm key={keys.map((key) => params.get(key)).join("|")} initial={selection} onCompare={compare} />
      </Card>
      {selection && <Card title="Reported flood packets">
        <p className="mb-2 break-words text-sm text-text-normal">A: {observerA.data?.displayName ?? selection.observerA} · B: {observerB.data?.displayName ?? selection.observerB}</p>
        <p className="mb-3 flex flex-wrap items-center gap-x-2 break-words text-sm text-text-muted">{new Date(selection.since).toLocaleString()} – {new Date(selection.until).toLocaleString()} · {iatas?.join(", ") || "All"}<InfoTip text="Local time; the end is excluded." /></p>
        {result.isFetching && <p role="status" className="text-sm text-text-muted">Comparing reported packets…</p>}
        {result.isError && <div role="alert" className="text-sm text-danger"><p>{result.error.message}</p><button type="button" onClick={() => void result.refetch()} className="mt-2 text-primary">Retry comparison</button></div>}
        {data && !result.isError && <>
          <p className="mb-3 flex items-center gap-2 text-lg font-semibold text-text-bright">{data.totalPackets.toLocaleString()} distinct flood packets<InfoTip text="Percentages use the union of packets heard by either observer. Repeated receptions count once. These counts reflect retained reports, not radio packet loss; an offline observer, broker interruption or expired history can affect the result." /></p>
          {data.totalPackets === 0 ? <p className="text-sm text-text-muted">No flood packets were reported by either observer in this period and region.</p> : <>
            <div aria-hidden className="mb-4 flex h-5 overflow-hidden rounded">{groups.map((g) => <div key={g.name} style={{ width: `${g.count / data.totalPackets * 100}%`, background: g.color }} />)}</div>
            <table className="w-full text-left text-sm tabular-nums" aria-label="Flood packet comparison">
              <thead className="text-text-muted"><tr><th scope="col">Heard by</th><th scope="col" className="text-right">Packets</th><th scope="col" className="text-right">% of union</th></tr></thead>
              <tbody>{groups.map((g) => <tr key={g.name} className="border-t border-border"><th scope="row" className="py-2 font-normal text-text-normal"><span aria-hidden className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: g.color }} />{g.name}</th><td className="text-right">{g.count.toLocaleString()}</td><td className="text-right">{(g.count / data.totalPackets * 100).toFixed(1)}%</td></tr>)}</tbody>
            </table>
          </>}
        </>}
      </Card>}
    </div>
  );
}
