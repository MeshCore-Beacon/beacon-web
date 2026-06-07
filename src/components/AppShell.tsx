import { type ReactNode, useState, useEffect } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { useQuery } from "@tanstack/react-query";
import { useRegionSelection, useRegions } from "../hooks/useRegion";
import { ALL_REGIONS, isAllRegions, type RegionSelection } from "../hooks/region-selection";
import { useWsStatus } from "../hooks/useWsStatus";
import { useTheme } from "../hooks/useTheme";
import { Dropdown } from "./Dropdown";
import { BeaconWordmark } from "./BeaconWordmark";
import { getIatas } from "../api/client";
import type { WsManager } from "../api/ws-manager";

const TABS = ["Packets", "Channels", "Map", "Nodes", "Observers", "Routes", "Traces", "Stats"] as const;

// header widgets: WS status, region picker, theme picker

function LiveBadge({ wsManager }: { wsManager: WsManager }) {
  const { status } = useWsStatus(wsManager);
  const [staleStr, setStaleStr] = useState("");

  useEffect(() => {
    if (status !== "connecting") return;
    function update() {
      const staleSec = Math.floor((Date.now() - wsManager.getLastEventTimestamp()) / 1000);
      setStaleStr(staleSec > 60 ? `${Math.floor(staleSec / 60)}m` : `${staleSec}s`);
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [status, wsManager]);

  if (status === "connected") {
    return (
      <div className="flex items-center gap-1.5 font-mono text-[11px] text-green bg-green/8 border border-green/15 px-2 py-0.5 rounded-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
        LIVE
      </div>
    );
  }

  if (status === "connecting") {
    return (
      <div className="flex items-center gap-1.5 font-mono text-[11px] text-warn bg-warn/7 border border-warn/15 px-2 py-0.5 rounded-sm">
        STALE {staleStr}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 font-mono text-[11px] text-danger bg-danger/8 border border-danger/15 px-2 py-0.5 rounded-sm">
      OFFLINE
    </div>
  );
}

// checkbox indicator, matching MultiSelectDropdown's style
function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${
      checked ? "border-primary bg-primary/20" : "border-border"
    }`}>
      {checked && (
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M1.5 4L3 5.5L6.5 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-primary" />
        </svg>
      )}
    </span>
  );
}

// Compact header summary of the active selection, e.g. "ALL", "YVR, YYJ", "2 regions", "1 region · 3 IATA".
function regionSummaryLabel(selection: RegionSelection): string {
  if (isAllRegions(selection)) return "ALL";
  const parts: string[] = [];
  if (selection.regions.length > 0) {
    parts.push(`${selection.regions.length} region${selection.regions.length > 1 ? "s" : ""}`);
  }
  if (selection.iatas.length > 0) {
    parts.push(selection.iatas.length <= 2 ? selection.iatas.join(", ") : `${selection.iatas.length} IATA`);
  }
  return parts.join(" · ");
}

// Grouped multi-select: regions (each expands to its member IATAs) on top, then individual IATAs.
// Toggling keeps the dropdown open so several can be picked; "All Regions" clears the selection.
function RegionSelector() {
  const { selection, setSelection } = useRegionSelection();
  const { regions } = useRegions();

  const { data: iatas } = useQuery({
    queryKey: ["iatas"],
    queryFn: getIatas,
    staleTime: 60_000,
  });

  const toggleRegion = (slug: string) => {
    const has = selection.regions.includes(slug);
    setSelection({
      ...selection,
      regions: has ? selection.regions.filter((s) => s !== slug) : [...selection.regions, slug],
    });
  };

  const toggleIata = (code: string) => {
    const has = selection.iatas.includes(code);
    setSelection({
      ...selection,
      iatas: has ? selection.iatas.filter((c) => c !== code) : [...selection.iatas, code],
    });
  };

  return (
    <Dropdown
      width="w-60"
      renderTrigger={({ toggle }) => (
        <button
          type="button"
          className="flex items-center gap-1.5 bg-bg-raised border border-border rounded px-3 py-1 text-text-bright font-mono text-xs font-semibold hover:border-text-dim/30 transition-colors"
          onClick={toggle}
        >
          <span className="text-text-muted font-normal text-[11px]">REGION</span>
          {regionSummaryLabel(selection)}
          <span className="text-text-dim text-[11px]">▾</span>
        </button>
      )}
    >
      {() => (
        <>
          <button
            type="button"
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs font-mono transition-colors ${
              isAllRegions(selection)
                ? "text-text-bright bg-primary/10"
                : "text-text-muted hover:text-text-normal hover:bg-white/3"
            }`}
            onClick={() => setSelection(ALL_REGIONS)}
          >
            {/* spacer matching the checkbox column so ALL/code/name align with the rows below */}
            <span className="w-3 shrink-0" aria-hidden="true" />
            <span className="font-semibold text-primary w-8 shrink-0">ALL</span>
            <span className="text-text-dim">All Regions</span>
          </button>

          {regions.length > 0 && (
            <>
              <div className="px-3 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wide text-text-dim">Regions</div>
              {regions.map((r) => {
                const checked = selection.regions.includes(r.slug);
                return (
                  <button
                    key={r.slug}
                    type="button"
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs font-mono transition-colors ${
                      checked ? "text-text-bright bg-primary/10" : "text-text-muted hover:text-text-normal hover:bg-white/3"
                    }`}
                    onClick={() => toggleRegion(r.slug)}
                  >
                    <CheckBox checked={checked} />
                    <span className="truncate">{r.name}</span>
                  </button>
                );
              })}
            </>
          )}

          <div className="px-3 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wide text-text-dim border-t border-border-subtle mt-1">IATA</div>
          {iatas ? (
            iatas.map((i) => {
              const checked = selection.iatas.includes(i.iata);
              return (
                <button
                  key={i.iata}
                  type="button"
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs font-mono transition-colors ${
                    checked ? "text-text-bright bg-primary/10" : "text-text-muted hover:text-text-normal hover:bg-white/3"
                  }`}
                  onClick={() => toggleIata(i.iata)}
                >
                  <CheckBox checked={checked} />
                  <span className="font-semibold text-primary w-8 shrink-0">{i.iata}</span>
                  <span className="text-text-dim truncate">{i.displayName || i.iata}</span>
                </button>
              );
            })
          ) : (
            <div className="px-3 py-1.5 text-[11px] font-mono text-text-dim">Loading…</div>
          )}
        </>
      )}
    </Dropdown>
  );
}

function ThemePicker() {
  const { themeId, themes, setThemeId } = useTheme();
  const current = themes.find((t) => t.id === themeId);

  return (
    <Dropdown
      renderTrigger={({ toggle }) => (
        <button
          type="button"
          className="flex items-center gap-1.5 bg-bg-raised border border-border rounded px-2 py-1 text-text-muted font-mono text-[11px] hover:text-text-normal hover:border-text-dim transition-colors"
          onClick={toggle}
        >
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/10"
            style={{ background: current?.vars["--palette-primary"] }}
          />
          <span className="text-text-dim text-[11px]">▾</span>
        </button>
      )}
    >
      {(close) => (
        <>
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono transition-colors ${
                t.id === themeId
                  ? "text-text-bright bg-primary/10"
                  : "text-text-muted hover:text-text-normal hover:bg-white/3"
              }`}
              onClick={() => {
                setThemeId(t.id);
                close();
              }}
            >
              <span
                className="w-3 h-3 rounded-full shrink-0 border border-white/10"
                style={{ background: t.vars["--palette-primary"] }}
              />
              {t.name}
            </button>
          ))}
        </>
      )}
    </Dropdown>
  );
}

// top-level layout: header, tabs, content, footer

interface AppShellProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  wsManager: WsManager;
  children: ReactNode;
}

export function AppShell({ activeTab, onTabChange, wsManager, children }: AppShellProps) {
  return (
    <div className="flex flex-col h-dvh">
      <header className="flex items-center justify-between px-4 h-[42px] bg-bg-surface border-b border-border shrink-0">
        <BeaconWordmark iconSize={22} textClassName="text-sm" />
        <div className="flex items-center gap-3">
          <RegionSelector />
          <ThemePicker />
          <LiveBadge wsManager={wsManager} />
        </div>
      </header>

      <nav className="flex bg-bg-surface border-b border-border px-4 shrink-0" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`px-[18px] py-2.5 text-xs font-medium tracking-wider border-b-2 cursor-pointer transition-colors ${
              activeTab === tab
                ? "text-primary border-primary"
                : "text-text-muted border-transparent hover:text-text-normal"
            }`}
            onClick={() => onTabChange(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      <main className="flex-1 flex flex-col min-h-0">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>

      <footer className="flex items-center px-4 py-1.5 bg-bg-surface border-t border-border font-mono text-[11px] text-text-dim shrink-0">
        <span>BEACON v0.1</span>
      </footer>
    </div>
  );
}
