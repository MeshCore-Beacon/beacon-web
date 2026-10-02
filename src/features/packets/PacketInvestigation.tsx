import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ACTION_BUTTON_CLASS } from "../../components/action-button";
import { InfoTip } from "../../components/InfoTip";
import { Tooltip } from "../../components/Tooltip";
import type { PacketDetail } from "../../types/api";
import { PayloadType } from "../../types/enums";
import { ObservationCard } from "./ObservationCard";
import { groupPacketReports, traceSnrValues } from "./packet-investigation";

const PAGE = 3;

// Every retained reception, grouped by the path bytes it carried; each report is a selectable signal card.
export function PacketInvestigation({ detail, selectedId, onSelect, onViewObserver, onViewPath, onViewNode, mappedKeys, observerCount, defaultOpen = false }: {
  detail: PacketDetail; selectedId: number | null; onSelect: (id: number) => void;
  onViewObserver?: (id: string, observationId: number) => void; onViewPath?: (key?: string) => void; onViewNode?: (id: string) => void;
  mappedKeys: Set<string>; observerCount: number; defaultOpen?: boolean;
}) {
  const { t } = useTranslation();
  const groups = useMemo(() => groupPacketReports(detail.observations), [detail.observations]);
  const isTrace = detail.header.payloadType === PayloadType.TRACE;
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState(defaultOpen);
  // a selected report deeper in the list stays visible even before it's paged in
  const visible = groups.filter((group, index) => index < shown || group.reports.some(o => o.id === selectedId));
  const remaining = Math.max(0, groups.length - shown);
  return <section aria-label={t("investigation.title")} className="space-y-2 border-t border-border-subtle px-3 py-2.5">
    <div className="flex items-center gap-2">
      <h2><button type="button" className="group flex cursor-pointer items-center gap-1.5 font-mono text-xs font-medium uppercase tracking-wider text-text-bright" aria-expanded={open} onClick={() => setOpen(v => !v)}>
        <span aria-hidden className="w-3.5 text-[11px] text-text-muted transition-colors group-hover:text-text-normal">{open ? "▾" : "▸"}</span>
        {t("investigation.title")}
      </button></h2>
      <InfoTip text={[t(isTrace ? "investigation.traceNote" : "investigation.pathNote"), t("investigation.retention")]} />
    </div>
    <p className="font-mono text-[11px] text-text-muted">{detail.observations.length === observerCount ? t("investigation.heardBy", { count: observerCount }) : `${t("investigation.heardTimes", { count: detail.observations.length })} ${t("investigation.byObservers", { count: observerCount })}`}</p>
    {groups.length === 0 ? <p role="status" className="text-sm text-text-muted">{t("investigation.empty")}</p> : open && visible.map(group => <details key={group.key} open={group.reports.some(o => o.id === selectedId)} className="group/path">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded px-1 py-1.5 font-mono text-xs hover:bg-text-normal/3 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="text-[9px] text-text-dim transition-transform group-open/path:rotate-90">▶</span>
        <span className="shrink-0 text-text-normal">{t(group.kind === "empty" ? "investigation.noEntries" : group.kind === "unavailable" ? "investigation.unavailablePath" : isTrace ? "investigation.tracePath" : "investigation.path", { number: groups.indexOf(group) + 1 })}</span>
        {group.hashes.length > 0 && <code className="min-w-0 truncate text-primary">{group.hashes.join(" → ")}</code>}
        <span className="ml-auto shrink-0 rounded-sm bg-text-normal/5 px-1.5 text-[11px] text-text-muted" aria-label={t("investigation.observations", { count: group.reports.length })}>×{group.reports.length}</span>
      </summary>
      <ul className="mt-1 mb-2 flex flex-col gap-1.5">{group.reports.map(report => {
        const key = isTrace ? "trace" : report.observerId;
        const canMap = mappedKeys.has(key);
        const name = report.observerName ?? report.observerId.slice(0, 8);
        return <li key={report.id}>
          <ObservationCard
            observation={report}
            selected={report.id === selectedId}
            onClick={() => onSelect(report.id)}
            onViewNode={onViewNode}
            isTrace={isTrace}
            snrValues={traceSnrValues(detail)}
            selectLabel={`${t("investigation.inspect")}: ${name}`}
            actions={<>
              {onViewObserver && <button type="button" className={ACTION_BUTTON_CLASS} onClick={() => { onSelect(report.id); onViewObserver(report.observerId, report.id); }}>{t("investigation.observer")}</button>}
              {canMap
                ? <button type="button" className={ACTION_BUTTON_CLASS} disabled={!onViewPath} onClick={() => { onSelect(report.id); onViewPath?.(key); }}>{t("investigation.map")}</button>
                : <Tooltip wrap label={t("investigation.unmappable")}><button type="button" className={`${ACTION_BUTTON_CLASS} pointer-events-none`} disabled>{t("investigation.map")}<span className="sr-only">: {t("investigation.unmappable")}</span></button></Tooltip>}
            </>}
          />
        </li>;
      })}</ul>
    </details>)}
    {open && remaining > 0 && <button type="button" className={ACTION_BUTTON_CLASS} onClick={() => setShown(n => n + PAGE)}>{t("investigation.loadMore", { count: remaining })}</button>}
  </section>;
}
