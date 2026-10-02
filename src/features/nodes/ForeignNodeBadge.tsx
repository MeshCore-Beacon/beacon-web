import { useTranslation } from "react-i18next";
import { Badge } from "../../components/Badge";
import { Tooltip } from "../../components/Tooltip";

export function ForeignNodeBadge({ possiblyForeign }: { possiblyForeign?: boolean }) {
  const { t } = useTranslation();
  if (possiblyForeign !== true) return null;
  return (
    <Tooltip label={t("nodes.possiblyForeignHint")}>
      <Badge variant="default">{t("nodes.possiblyForeign")}</Badge>
    </Tooltip>
  );
}
