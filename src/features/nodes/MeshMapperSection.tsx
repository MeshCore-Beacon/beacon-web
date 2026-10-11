import { useTranslation } from "react-i18next";
import { Section, Field } from "../../components/DetailPanel";
import { IataChip } from "../../components/IataChip";
import { Timestamp } from "../../components/Timestamp";
import type { MeshMapperRepeater, MeshMapperScope } from "./types";

function ScopeRow({ scope }: { scope: MeshMapperScope }) {
  const { t } = useTranslation();
  const how = [
    scope.observedPackets != null ? t("nodeDetail.observedPackets", { count: scope.observedPackets }) : scope.observedAt != null ? t("nodeDetail.observed") : null,
    scope.reportedAt != null ? t("nodeDetail.reported") : null,
    scope.uploadedAt != null ? t("nodeDetail.uploaded") : null,
  ].filter(Boolean).join(" · ");
  const latest = Math.max(scope.observedAt ?? 0, scope.reportedAt ?? 0, scope.uploadedAt ?? 0);
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <span className="text-text-normal truncate min-w-0" title={scope.scope}>{scope.scope}</span>
      {how && <span className="text-text-muted text-[11px] truncate min-w-0">{how}</span>}
      {latest > 0 && <Timestamp value={latest} className="ml-auto shrink-0 text-text-dim text-[11px]" />}
    </div>
  );
}

export function MeshMapperSection({ mm }: { mm: MeshMapperRepeater }) {
  const { t, i18n } = useTranslation();
  const { site, defaultScope } = mm;
  const hasSite = Boolean(site.hardware || site.power || site.powerSource || site.antenna || site.heightM != null || site.notes);
  const hasScopes = mm.scopes.length > 0 || mm.scopesCheckedAt != null;
  // carpeater alone is covered by the badge next to the node name
  if (!hasSite && !hasScopes && mm.admins.length === 0 && !defaultScope) return null;

  const num = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  const height = site.heightM != null
    ? [t("nodeDetail.heightAgl", { value: num.format(site.heightM) }), site.heightAslM != null ? t("nodeDetail.heightAsl", { value: num.format(site.heightAslM) }) : null].filter(Boolean).join(" · ")
    : null;

  return (
    <Section title={t("nodeDetail.meshmapper")}>
      <div className="flex flex-col gap-0.5 font-mono text-[13px]">
        {(site.hardware || site.power || site.powerSource) && (
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            {site.hardware && <Field label={t("nodeDetail.hardware")} value={site.hardware} />}
            {site.power && <Field label={t("nodeDetail.power")} value={site.power} />}
            {site.powerSource && <Field label={t("nodeDetail.powerSource")} value={t(`nodeDetail.powerSources.${site.powerSource}`, { defaultValue: site.powerSource })} />}
          </div>
        )}
        {site.antenna && <Field label={t("nodeDetail.antenna")} value={site.antenna} />}
        {height && <Field label={t("nodeDetail.height")} value={height} />}
        {mm.admins.length > 0 && <Field label={t("nodeDetail.admins")} value={mm.admins.join(", ")} />}
        {defaultScope && (
          <Field
            label={t("nodeDetail.mmDefaultScope")}
            value={
              <>
                {defaultScope.state === "named" && defaultScope.name ? defaultScope.name : t(`nodeDetail.scopeState.${defaultScope.state === "none" ? "none" : "unknown"}`)}
                {(defaultScope.source || defaultScope.updatedAt != null) && (
                  <span className="text-text-dim text-[11px]">
                    {" "}({defaultScope.source && t(`nodeDetail.scopeSource.${defaultScope.source}`, { defaultValue: defaultScope.source })}
                    {defaultScope.source && defaultScope.updatedAt != null && ", "}
                    {defaultScope.updatedAt != null && <Timestamp value={defaultScope.updatedAt} />})
                  </span>
                )}
              </>
            }
          />
        )}
        {hasScopes && (
          <div>
            <span className="text-text-dim">{t("nodeDetail.confirmedScopes")}</span>
            <div className="pl-3 flex flex-col gap-0.5">
              {mm.scopes.length > 0 ? (
                mm.scopes.map((s, i) => <ScopeRow key={`${s.scope}-${i}`} scope={s} />)
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-text-muted">{t("nodeDetail.noConfirmedScopes")}</span>
                  <Timestamp value={mm.scopesCheckedAt!} className="ml-auto text-text-dim text-[11px]" />
                </div>
              )}
            </div>
          </div>
        )}
        {site.notes && <p className="mt-1 text-text-muted whitespace-pre-line break-words">{site.notes}</p>}
      </div>
      <div className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-text-dim">
        <span>{t("nodeDetail.fromMeshMapper")}</span>
        {mm.iata && <IataChip>{mm.iata}</IataChip>}
        <span className="ml-auto">{t("nodeDetail.updated")} <Timestamp value={mm.fetchedAt} /></span>
      </div>
    </Section>
  );
}
