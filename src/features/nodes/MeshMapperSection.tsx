import { useTranslation } from "react-i18next";
import { Section, Field } from "../../components/DetailPanel";
import { IataChip } from "../../components/IataChip";
import { Timestamp } from "../../components/Timestamp";
import type { MeshMapperRepeater, MeshMapperScope } from "./types";

function profileLink(value?: string): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password && !url.port && /^(?:[a-z0-9-]+\.)?meshmapper\.net$/.test(url.hostname)) return url.href;
  } catch { /* Optional provider link; never render an untrusted scheme. */ }
}

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
      <span className="text-text-normal shrink-0" title={scope.scope}>{scope.scope}</span>
      {how && <span className="text-text-muted text-[11px] truncate min-w-0">{how}</span>}
      {latest > 0 && <Timestamp value={latest} className="ml-auto shrink-0 text-text-dim text-[11px]" />}
    </div>
  );
}

export function MeshMapperSection({ mm }: { mm: MeshMapperRepeater }) {
  const { t, i18n } = useTranslation();
  const { site, defaultScope } = mm;
  const hasSite = Boolean(site.hardware || site.power || site.powerSource || site.antenna || site.heightM != null || site.heightAslM != null || site.notes);
  const hasScopes = mm.scopes.length > 0 || mm.scopesCheckedAt != null;
  const link = profileLink(mm.profileUrl);
  const hasReports = Boolean(mm.status || mm.firstSeen != null || mm.lastHeard != null || mm.advertBytes != null || mm.backbone != null || mm.backboneShare != null || mm.currentPreset || mm.radios?.length || mm.neighbors?.length);
  // carpeater alone is covered by the badge next to the node name
  if (!hasSite && !hasScopes && mm.admins.length === 0 && !defaultScope && !hasReports && !link) return null;

  const num = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  const height = [site.heightM != null ? t("nodeDetail.heightAgl", { value: num.format(site.heightM) }) : null, site.heightAslM != null ? t("nodeDetail.heightAsl", { value: num.format(site.heightAslM) }) : null].filter(Boolean).join(" · ");

  return (
    <Section title={t("nodeDetail.meshmapper")}>
      <p className="mb-2 text-[11px] text-text-dim">{t("meshmapperProfile.provenance")}</p>
      {mm.refreshFailed && <p className="mb-2 text-[11px] text-warning" role="status">{t("meshmapperProfile.refreshFailed")}</p>}
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
      {hasReports && (
        <details className="mt-3 border-t border-border pt-2 text-[12px]">
          <summary className="cursor-pointer text-text-muted">{t("meshmapperProfile.reports")}</summary>
          <p className="my-2 text-[11px] text-text-dim">{t("meshmapperProfile.reportHint")}</p>
          <div className="flex flex-col gap-1 font-mono">
            {mm.status && <Field label={t("meshmapperProfile.status")} value={t(`meshmapperProfile.statuses.${mm.status}`)} />}
            {mm.backbone != null && <Field label={t("meshmapperProfile.backbone")} value={t(mm.backbone ? "nodeDetail.yes" : "nodeDetail.no")} />}
            {mm.backboneShare != null && <Field label={t("meshmapperProfile.trafficShare")} value={`${num.format(mm.backboneShare * 100)}%`} />}
            {mm.firstSeen != null && <Field label={t("meshmapperProfile.firstSeen")} value={<Timestamp value={mm.firstSeen} />} />}
            {mm.lastHeard != null && <Field label={t("meshmapperProfile.lastHeard")} value={<Timestamp value={mm.lastHeard} />} />}
            {mm.advertBytes != null && <Field label={t("meshmapperProfile.advertBytes")} value={String(mm.advertBytes)} />}
            {mm.currentPreset && <Field label={t("meshmapperProfile.currentPreset")} value={mm.currentPreset} />}
            {!!mm.radios?.length && <div className="mt-1">
              <span className="text-text-dim">{t("meshmapperProfile.radioHistory")}</span>
              {mm.radios.map(radio => <div key={radio.preset} className="flex flex-wrap items-baseline gap-x-2 pl-2 text-[11px]">
                <span>{radio.preset}</span>
                {radio.witnesses != null && <span className="text-text-dim">{t("meshmapperProfile.witnesses", { count: radio.witnesses })}</span>}
                {radio.lastSeen != null && <Timestamp value={radio.lastSeen} className="text-text-dim" />}
              </div>)}
            </div>}
          </div>
          {!!mm.neighbors?.length && <details className="mt-3 border-t border-border pt-2">
            <summary className="cursor-pointer text-text-muted">{t("meshmapperProfile.neighbors", { count: mm.neighbors.length })}</summary>
            <p className="my-2 text-[11px] text-text-dim">{t("meshmapperProfile.neighborHint")}</p>
            <div className="max-h-48 overflow-y-auto font-mono text-[11px]">
              {mm.neighbors.map(neighbor => <div key={neighbor.key} className="flex flex-wrap items-baseline gap-x-2 border-b border-border py-1">
                <span title={neighbor.key}>{neighbor.key.slice(0, 12)}…</span>
                {!neighbor.resolved && <span className="text-text-dim">{t("meshmapperProfile.unresolved")}</span>}
                {neighbor.snr != null && <span>{num.format(neighbor.snr)} dB</span>}
                {neighbor.heardAt != null && <Timestamp value={neighbor.heardAt} className="text-text-dim" />}
              </div>)}
            </div>
          </details>}
        </details>
      )}
      <div className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-text-dim">
        <span>{t("nodeDetail.fromMeshMapper")}</span>
        {mm.iata && <IataChip>{mm.iata}</IataChip>}
        <span className="ml-auto">{t("meshmapperProfile.fetched")} <Timestamp value={mm.fetchedAt} /></span>
      </div>
      {link && <a href={link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[12px] text-primary hover:underline">{t("meshmapperProfile.open")} ↗</a>}
    </Section>
  );
}
