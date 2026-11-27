import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "./Tooltip";

// One chip style for a node's identity: type (tinted), role (outline) and caution (outline). Shared by
// the nodes list and the node panel so size, radius and weight match.

// Glyphs are simplified versions of the map marker glyphs, kept here in one place.
const GLYPHS: Record<string, { viewBox: string; body: ReactNode }> = {
  repeater: {
    viewBox: "12 8 40 48",
    body: (
      <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <line x1="32" y1="26" x2="32" y2="45" />
        <path d="M32 45 L25 51 M32 45 L39 51" />
        <circle cx="32" cy="23" r="2.6" fill="currentColor" stroke="none" />
        <path d="M25.5 17.5 A 10 10 0 0 0 25.5 30.5" />
        <path d="M20 13.5 A 15 15 0 0 0 20 34.5" />
        <path d="M38.5 17.5 A 10 10 0 0 1 38.5 30.5" />
        <path d="M44 13.5 A 15 15 0 0 1 44 34.5" />
      </g>
    ),
  },
  companion: {
    viewBox: "12 8 40 48",
    body: (
      <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="24" y="22" width="16" height="30" rx="4" />
        <path d="M28.5 22 L23 11" />
        <circle cx="23" cy="11" r="1.8" fill="currentColor" stroke="none" />
        <rect x="28" y="40" width="8" height="7" rx="1.6" />
      </g>
    ),
  },
  room_server: {
    viewBox: "12 8 40 48",
    body: (
      <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="18" y="15" width="28" height="34" rx="3.5" />
        <line x1="18" y1="26.3" x2="46" y2="26.3" />
        <line x1="18" y1="37.7" x2="46" y2="37.7" />
      </g>
    ),
  },
  sensor: {
    viewBox: "10 10 44 44",
    body: (
      <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round">
        <circle cx="32" cy="32" r="13.5" />
        <circle cx="32" cy="32" r="3" fill="currentColor" stroke="none" />
        <line x1="32" y1="13" x2="32" y2="18.5" />
        <line x1="32" y1="45.5" x2="32" y2="51" />
        <line x1="13" y1="32" x2="18.5" y2="32" />
        <line x1="45.5" y1="32" x2="51" y2="32" />
      </g>
    ),
  },
  poller: {
    viewBox: "0 0 24 24",
    body: <path d="M2 12H7L10 5L14.5 19L17.5 12H22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />,
  },
  observer: {
    viewBox: "0 0 24 24",
    body: (
      <>
        <path d="M2 12C5 6.5 19 6.5 22 12 19 17.5 5 17.5 2 12Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="3" fill="currentColor" />
      </>
    ),
  },
  caution: {
    viewBox: "0 0 24 24",
    body: (
      <>
        <path d="M12 3 22 20H2Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M12 10v5M12 17.6v.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </>
    ),
  },
};

function Glyph({ name }: { name: string }) {
  const g = GLYPHS[name];
  if (!g) return null;
  return <svg viewBox={g.viewBox} width="12" height="12" aria-hidden="true" className="shrink-0">{g.body}</svg>;
}

const BASE = "inline-flex items-center gap-1 font-mono text-[11px] font-semibold py-0.5 rounded-sm border tracking-wider";

// Type colour = the map marker colour for that type (NODE_TYPE_COLOR in features/map/node-icons.ts);
// keep the two in step.
const TYPE_CLASSES: Record<string, string> = {
  companion: "bg-primary/8 text-primary border-primary/30",
  repeater: "bg-secondary/8 text-secondary border-secondary/30",
  room_server: "bg-green/8 text-green border-green/30",
  sensor: "bg-warn/8 text-warn border-warn/30",
};
const UNKNOWN_TYPE = "bg-text-muted/10 text-text-muted border-text-muted/12";

export function TypeChip({ typeName }: { typeName: string }) {
  const { t } = useTranslation();
  const key = typeName.toLowerCase();
  const known = key in TYPE_CLASSES;
  return (
    <span data-chip="type" className={`${BASE} px-2 uppercase ${known ? TYPE_CLASSES[key] : UNKNOWN_TYPE}`}>
      {known && <Glyph name={key} />}
      {t(`nodeTypes.${key}`, { defaultValue: typeName.replaceAll("_", " ") })}
    </span>
  );
}

const ROLE = {
  poller: { color: "text-[#ffb454] border-[#ffb454]/55", labelKey: "nodes.poller" },
  observer: { color: "text-[#c79bff] border-[#c79bff]/55", labelKey: "nodes.observer" },
} as const;

// Outline chip for a role. Glyph only in the list (named for assistive tech and a tooltip), with the
// word in the panel.
export function RoleChip({ role, glyphOnly = false }: { role: "poller" | "observer"; glyphOnly?: boolean }) {
  const { t } = useTranslation();
  const { color, labelKey } = ROLE[role];
  const label = t(labelKey);
  if (glyphOnly) {
    return (
      <Tooltip label={label}>
        <span data-chip={role} role="img" aria-label={label} className={`${BASE} px-1 ${color}`}>
          <Glyph name={role} />
        </span>
      </Tooltip>
    );
  }
  return (
    <span data-chip={role} className={`${BASE} px-2 uppercase ${color}`}>
      <Glyph name={role} />
      {label}
    </span>
  );
}

export function CautionChip({ children }: { children: ReactNode }) {
  return (
    <span data-chip="caution" className={`${BASE} px-2 text-[#fb923c] border-[#fb923c]/60`}>
      <Glyph name="caution" />
      {children}
    </span>
  );
}
