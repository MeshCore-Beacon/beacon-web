import { useTranslation } from "react-i18next";
import { parseScopeHours, type ScopeHours } from "../nodes/scope-evidence";

export const scopeControl = "min-h-8 max-w-full rounded-sm border border-border bg-bg-surface px-2 text-[11px] text-text-normal";
export function ScopeWindow({ value, onChange }: { value: ScopeHours; onChange: (value: ScopeHours) => void }) {
  const { t } = useTranslation();
  return <select aria-label={t("scopeView.window")} className={scopeControl} value={value} onChange={e => onChange(parseScopeHours(e.target.value))}>
    {[1,6,24].map(hours => <option key={hours} value={hours}>{hours}h</option>)}
  </select>;
}
