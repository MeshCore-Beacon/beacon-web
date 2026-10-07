import { isQuestionable } from "./trace-quality";
import { useTranslation } from "react-i18next";
import type { TraceQuality } from "../../types/api";

export function TraceQualityNotice({ quality, compact = false }: { quality?: TraceQuality; compact?: boolean }) {
  const { t } = useTranslation();
  if (!isQuestionable(quality)) return null;
  const reasons = quality!.reasons.map((reason) => t(`traces.quality.${reason}`, { defaultValue: reason })).join(" · ");
  return <div className="text-warn text-[11px]" title={reasons}>
    <span className="font-medium">{t(`traces.quality.${quality!.status}`)}</span>
    {!compact && <><div>{reasons}</div><div className="text-text-dim">{t("traces.quality.evidenceOnly")}</div></>}
  </div>;
}
