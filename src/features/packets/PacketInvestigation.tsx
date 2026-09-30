import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Timestamp } from "../../components/Timestamp";
import { ACTION_BUTTON_CLASS } from "../../components/action-button";
import type { PacketDetail } from "../../types/api";
import { PayloadType } from "../../types/enums";
import { groupPacketReports } from "./packet-investigation";

export function PacketInvestigation({ detail, selectedId, onSelect, onViewObserver, onViewPath, mappedKeys, observerCount }: {
  detail: PacketDetail; selectedId: number | null; onSelect: (id: number) => void;
  onViewObserver?: (id: string) => void; onViewPath?: (key?: string) => void;
  mappedKeys: Set<string>; observerCount: number;
}) {
  const { t } = useTranslation();
  const groups = useMemo(() => groupPacketReports(detail.observations), [detail.observations]);
  const isTrace = detail.header.payloadType === PayloadType.TRACE;
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? groups : groups.filter((group, index) => index < 3 || group.reports.some(o => o.id === selectedId));
  return <section aria-label={t("investigation.title")} className="space-y-3 border-b border-border-subtle px-3 py-3">
    <h2 className="text-sm font-semibold text-text-bright">{t("investigation.title")}</h2>
    <p className="text-xs text-text-normal">{t("investigation.reports", { count: detail.observations.length })} · {t("investigation.observers", { count: observerCount })}</p>
    <p className="text-xs leading-relaxed text-text-muted">{t(isTrace ? "investigation.traceNote" : "investigation.pathNote")}</p>
    {groups.length === 0 ? <p role="status" className="text-sm text-text-muted">{t("investigation.empty")}</p> : visible.map(group => <details key={group.key} open={group.reports.some(o => o.id === selectedId)} className="rounded border border-border bg-bg-base p-2">
      <summary className="cursor-pointer text-xs text-text-normal">
        {t(group.kind === "empty" ? "investigation.noEntries" : group.kind === "unavailable" ? "investigation.unavailablePath" : isTrace ? "investigation.tracePath" : "investigation.path", { number: groups.indexOf(group) + 1 })}
        <span className="ml-2 text-text-muted">({t("investigation.reports", { count: group.reports.length })})</span>
        {group.hashes.length > 0 && <code className="mt-1 block break-all text-primary">{group.hashes.join(" → ")}</code>}
      </summary>
      <ul className="mt-2 space-y-2">{group.reports.map(report => {
        const key = isTrace ? "trace" : report.observerId;
        const canMap = mappedKeys.has(key);
        return <li key={report.id} className="space-y-2 border-t border-border-subtle pt-2">
          <p className="break-words text-xs text-text-normal">{report.observerName ?? report.observerId.slice(0, 8)} · {report.iata || "—"} · <Timestamp value={report.heardAt} ms /></p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ACTION_BUTTON_CLASS} aria-pressed={report.id === selectedId} onClick={() => onSelect(report.id)}>{t("investigation.inspect")}</button>
            {onViewObserver && <button type="button" className={ACTION_BUTTON_CLASS} onClick={() => { onSelect(report.id); onViewObserver(report.observerId); }}>{t("investigation.observer")}</button>}
            <button type="button" className={ACTION_BUTTON_CLASS} disabled={!canMap || !onViewPath} onClick={() => { onSelect(report.id); onViewPath?.(key); }}>{t("investigation.map")}</button>
          </div>
          {!canMap && <p className="text-xs text-text-muted">{t("investigation.unmappable")}</p>}
        </li>;
      })}</ul>
    </details>)}
    {groups.length > 3 && <button type="button" className={ACTION_BUTTON_CLASS} onClick={() => setShowAll(value => !value)}>{t(showAll ? "investigation.fewer" : "investigation.showAll", { count: groups.length })}</button>}
    <p className="text-xs leading-relaxed text-text-muted">{t("investigation.retention")}</p>
  </section>;
}
