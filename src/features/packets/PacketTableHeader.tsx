import { useTranslation } from "react-i18next";
import { GRID_TEMPLATE } from "./packet-grid";

// Sticky above the virtualizer's spacer, never inside measured item space.
export function PacketTableHeader() {
  const { t } = useTranslation();
  return (
    <div
      className="hidden md:grid sticky top-0 z-10 gap-x-3 px-3 py-1.5 bg-bg-surface border-b border-border text-[9px] uppercase tracking-wider text-text-muted"
      style={{ gridTemplateColumns: GRID_TEMPLATE }}
    >
      <span aria-hidden />
      <span>{t("packetTable.hash")}</span>
      <span>{t("packetAnalyzer.type")}</span>
      <span>{t("packetAnalyzer.route")}</span>
      <span>{t("packetTable.obs")}</span>
      <span>{t("packetTable.hops")}</span>
      <span>{t("packetAnalyzer.hashSize")}</span>
      <span className="truncate" title={t("packetTable.summaryTitle")}>{t("packetTable.summary")}</span>
      <span>{t("packetTable.area")}</span>
      <span className="text-right">{t("packetTable.age")}</span>
    </div>
  );
}
