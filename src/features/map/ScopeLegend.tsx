import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import type { NodeFeatureProps } from "./node-geojson";
import { visibleScopeRows, type RepeaterScopeStyle, type ScopeLegendRow } from "./repeater-scopes";

export function ScopeLegend({ mapRef, isReady, geojson, style }: {
  mapRef: React.RefObject<MapLibreMap | null>; isReady: boolean;
  geojson: FeatureCollection<Point, NodeFeatureProps>; style: RepeaterScopeStyle;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ScopeLegendRow[]>([]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    const update = () => {
      const next = visibleScopeRows(geojson, style, map.getBounds());
      setRows(old => JSON.stringify(old) === JSON.stringify(next) ? old : next);
    };
    update(); map.on("moveend", update); map.on("resize", update);
    return () => { map.off("moveend", update); map.off("resize", update); };
  }, [mapRef, isReady, geojson, style]);
  return <section aria-label={t("map.repeaterScopes")} className="absolute bottom-16 sm:bottom-7 right-3 z-10 w-56 max-w-[calc(100%-1.5rem)] border border-border rounded-sm bg-bg-raised/95 p-2.5 shadow-lg font-mono text-[11px]">
    <h3 className="font-semibold text-text-normal">{t("map.scopesInView")}</h3>
    <p className="mt-1 text-[10px] text-text-muted">{t("map.scopesSource")}</p>
    <ul className="mt-2 max-h-32 overflow-y-auto space-y-1" aria-label={t("map.scopeLegend")}>
      {rows.map(row => <li key={row.kind === "named" ? `name:${row.name}` : row.kind} className="flex items-center gap-2">
        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm border border-text-muted/50" style={{ backgroundColor: row.color }} />
        <span className="min-w-0 flex-1 truncate text-text-normal" title={row.name ?? undefined}>{row.name ?? t(row.kind === "unknown" ? "map.scopeUnknown" : "map.scopeOther")}</span>
        <span className="tabular-nums text-text-muted">{row.count.toLocaleString()}</span>
      </li>)}
    </ul>
    {!rows.length && <p className="mt-2 text-text-muted">{t("map.noRepeatersInView")}</p>}
    <p className="mt-2 text-[9px] text-text-muted">{t("map.scopeClusters")}</p>
  </section>;
}
