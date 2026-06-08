import { useState, type ReactNode } from "react";
import { BottomSheet } from "./BottomSheet";

// Mobile-only tab bar (hidden at md+); overflow tabs live behind "More" in a bottom sheet.
const PRIMARY_TABS = ["Packets", "Channels", "Map", "Nodes"] as const;
const OVERFLOW_TABS = ["Observers", "Routes", "Traces", "Stats"] as const;

// inline SVGs, 20px / 1.6 stroke to match the rest of the icons
function Icon({ name }: { name: string }) {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "Packets":
      return (
        <svg {...common}>
          <path d="M21 8l-9-5-9 5 9 5 9-5z" />
          <path d="M3 8v8l9 5 9-5V8" />
          <path d="M12 13v8" />
        </svg>
      );
    case "Channels":
      return (
        <svg {...common}>
          <path d="M21 11.5a8.4 8.4 0 0 1-9 8.3l-5 .9 1-4.2A8.4 8.4 0 1 1 21 11.5z" />
        </svg>
      );
    case "Map":
      return (
        <svg {...common}>
          <path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z" />
          <circle cx="12" cy="11" r="2" />
        </svg>
      );
    case "Nodes":
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="2.2" />
          <circle cx="18" cy="6" r="2.2" />
          <circle cx="12" cy="18" r="2.2" />
          <path d="M7.6 7.4L11 16M16.4 7.4L13 16M8 6h8" />
        </svg>
      );
    default: // More
      return (
        <svg {...common}>
          <circle cx="5" cy="12" r="1.4" />
          <circle cx="12" cy="12" r="1.4" />
          <circle cx="19" cy="12" r="1.4" />
        </svg>
      );
  }
}

function NavButton({ label, icon, active, onClick, role, ariaSelected, ariaHasPopup, ariaExpanded }: {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
  role?: string;
  ariaSelected?: boolean;
  ariaHasPopup?: "menu";
  ariaExpanded?: boolean;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-selected={ariaSelected}
      aria-haspopup={ariaHasPopup}
      aria-expanded={ariaExpanded}
      onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium tracking-wide cursor-pointer transition-colors ${
        active ? "text-primary" : "text-text-muted hover:text-text-normal"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// Bottom sheet listing the overflow tabs.
function MoreSheet({ activeTab, onPick, onClose }: { activeTab: string; onPick: (tab: string) => void; onClose: () => void }) {
  return (
    <BottomSheet onClose={onClose} role="menu" label="More tabs">
      {OVERFLOW_TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          role="menuitem"
          onClick={() => onPick(tab)}
          className={`w-full flex items-center gap-3 px-5 py-3 text-left text-sm font-medium cursor-pointer transition-colors ${
            activeTab === tab ? "text-primary" : "text-text-normal hover:bg-white/3"
          }`}
        >
          {tab}
        </button>
      ))}
    </BottomSheet>
  );
}

export function BottomNav({ activeTab, onTabChange }: { activeTab: string; onTabChange: (tab: string) => void }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const overflowActive = (OVERFLOW_TABS as readonly string[]).includes(activeTab);

  const pick = (tab: string) => {
    onTabChange(tab);
    setSheetOpen(false);
  };

  return (
    <>
      <nav className="flex md:hidden shrink-0 bg-bg-surface border-t border-border" role="tablist" aria-label="Primary">
        {PRIMARY_TABS.map((tab) => (
          <NavButton
            key={tab}
            label={tab}
            icon={<Icon name={tab} />}
            active={activeTab === tab}
            onClick={() => onTabChange(tab)}
            role="tab"
            ariaSelected={activeTab === tab}
          />
        ))}
        <NavButton
          label="More"
          icon={<Icon name="More" />}
          active={overflowActive || sheetOpen}
          onClick={() => setSheetOpen((v) => !v)}
          ariaHasPopup="menu"
          ariaExpanded={sheetOpen}
        />
      </nav>

      {sheetOpen && <MoreSheet activeTab={activeTab} onPick={pick} onClose={() => setSheetOpen(false)} />}
    </>
  );
}
