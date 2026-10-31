import { useTranslation } from "react-i18next";
import { Section } from "../../components/DetailPanel";
import type { Node } from "./types";
import { nodeScopeStats } from "./scope-evidence";
import { scopeColor } from "../map/repeater-scopes";

export function NodeScopes({ node }: { node: Node }) {
  const { t } = useTranslation();
  if (node.nodeType !== 2) return null;
  const stats = nodeScopeStats(node);
  const evidence = new Map((node.scopeEvidence?.scopes ?? []).map(s => [s.name, s]));
  return <Section title={t("map.scopeDetailsTitle")}>
    <p className="mb-2 text-[11px] text-text-muted">{t("map.scopeCounts")}</p>
    {!node.scopeEvidence && <p className="mb-2 text-[11px] text-text-muted">{t("map.scopeEvidenceUnavailable")}</p>}
    {stats.scopeNames.length ? <ul className="max-h-64 overflow-y-auto space-y-2 font-mono text-[11px]">
      {stats.scopeNames.sort((a,b) => (stats.scopeRepeats[b] ?? 0) - (stats.scopeRepeats[a] ?? 0) || a.localeCompare(b)).map(name => {
        const s = evidence.get(name);
        const sources = [s?.repeatObservations ? t("map.scopeRepeated") : "", s?.minHashBytes ? t("map.scopeHashEvidence", { bytes: s.minHashBytes }) : "", s?.reported ? t("map.scopeReported") : "", s?.heardAt ? t("map.scopeHeard") : "", node.defaultScope === name ? t("map.scopeAdvert") : ""].filter(Boolean);
        return <li key={name}>
          <div className="flex items-center gap-2"><span aria-hidden className="h-2 w-2 shrink-0" style={{backgroundColor:scopeColor(name,true)}} />
            <span className="min-w-0 flex-1 break-all text-text-normal">{name === "*" ? t("map.scopeWildcard") : name}</span>
            <span className="tabular-nums text-text-normal">{s?.repeatObservations ? s.repeatObservations.toLocaleString() : "—"}</span></div>
          <p className="mt-0.5 pl-4 text-[10px] text-text-muted">{sources.join(" · ")}</p>
        </li>;
      })}
    </ul> : <p className="text-[11px] text-text-muted">{t("map.scopeUnknown")}</p>}
    {node.scopeEvidence?.reportedEmpty && <p className="mt-2 text-[10px] text-text-muted">{t("map.scopeReportedEmpty")}</p>}
    {node.scopeEvidence?.conflictingReports && <p className="mt-2 text-[10px] text-warn">{t("map.scopeReportConflict")}</p>}
    <p className="mt-2 text-[10px] text-text-muted">{t("map.scopeReportMeaning")}</p>
  </Section>;
}
