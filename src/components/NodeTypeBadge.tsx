import { useTranslation } from "react-i18next";
import { ObserverIcon } from "./ObserverIcon";
import { Tooltip } from "./Tooltip";

const colors: Record<string, string> = { companion: "primary", repeater: "green", room_server: "secondary", sensor: "warn" };
const glyphs: Record<string, string> = { companion: "▲", repeater: "◆", room_server: "▣", sensor: "⬡" };

export function NodeTypeBadge({ typeName, observer = false }: { typeName: string; observer?: boolean }) {
  const { t } = useTranslation();
  const role = typeName.toLowerCase();
  const color = `var(--color-${colors[role] ?? "text-muted"})`;
  return <span className="inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase leading-none whitespace-nowrap" style={{ color, borderColor: `color-mix(in srgb, ${color} 45%, transparent)`, background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
    {observer && <Tooltip label={t("nodes.observer")}><ObserverIcon /></Tooltip>}
    <span aria-hidden="true" className="text-xs">{glyphs[role] ?? "◇"}</span>
    {t(`nodeTypes.${role}`, { defaultValue: typeName })}
  </span>;
}
