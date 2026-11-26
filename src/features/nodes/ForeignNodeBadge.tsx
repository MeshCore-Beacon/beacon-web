import { useTranslation } from "react-i18next";
import { CautionChip } from "../../components/NodeChips";
import { Tooltip } from "../../components/Tooltip";

export function ForeignNodeBadge({ possiblyForeign }: { possiblyForeign?: boolean }) {
  const { t } = useTranslation();
  if (possiblyForeign !== true) return null;
  return (
    <Tooltip label={t("nodes.possiblyForeignHint")} focusable>
      <CautionChip>{t("nodes.possiblyForeign")}</CautionChip>
    </Tooltip>
  );
}
