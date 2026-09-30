import { type ReactNode, useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ErrorBoundary } from "./ErrorBoundary";
import { useQuery } from "@tanstack/react-query";
import { useRegionSelection, useRegions } from "../hooks/useRegion";
import { ALL_REGIONS, isAllRegions, type RegionSelection } from "../hooks/region-selection";
import { useWsStatus } from "../hooks/useWsStatus";
import { useRateLimit } from "../hooks/useRateLimit";
import { useTheme } from "../hooks/useTheme";
import { Dropdown } from "./Dropdown";
import { BottomNav } from "./BottomNav";
import { LanguageOptions, LanguagePicker } from "./LanguagePicker";
import { useIsMobile } from "../hooks/useMediaQuery";
import { BeaconWordmark } from "./BeaconWordmark";
import { getIatas } from "../api/client";
import { ENABLED_TABS, ENABLED_THEME_IDS, selectableThemes, APP_NAME, GITHUB_URL } from "../lib/constants";
import type { WsManager } from "../api/ws-manager";

// header widgets: WS status, region picker, theme picker

function LiveBadge({ wsManager, compact = false }: { wsManager: WsManager; compact?: boolean }) {
  const { t } = useTranslation();
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
    if (compact) return (
      <span role="status" aria-label={t("connection.live")} title={t("connection.live")} className="flex h-6 w-6 items-center justify-center">
        <span className="h-2 w-2 rounded-full bg-green animate-pulse" />
      </span>
    );
    return (
      <div className="flex items-center gap-1.5 font-mono text-[11px] text-green bg-green/8 border border-green/15 px-2 py-0.5 rounded-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
        {t("connection.live")}
      </div>
    );
  }

  if (status === "connecting") {
    return (
      <div className="flex items-center gap-1.5 font-mono text-[11px] text-warn bg-warn/7 border border-warn/15 px-2 py-0.5 rounded-sm">
        {t("connection.stale", { age: staleStr })}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 font-mono text-[11px] text-danger bg-danger/8 border border-danger/15 px-2 py-0.5 rounded-sm">
      {t("connection.offline")}
    </div>
  );
}

// Shown while the API is throttling us; the countdown tells users the blank tables are temporary.
function RateLimitBadge() {
  const { t } = useTranslation();
  const until = useRateLimit();
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (until === null) return;
    const end = until;
    function update() {
      setRemaining(Math.ceil((end - Date.now()) / 1000));
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [until]);

  if (until === null || remaining <= 0) return null;

  return (
    <div role="status" className="flex items-center gap-1.5 font-mono text-[11px] text-warn bg-warn/7 border border-warn/15 px-2 py-0.5 rounded-sm">
      {t("connection.rateLimited", { seconds: remaining })}
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
function regionSummaryLabel(selection: RegionSelection, t: TFunction): string {
  if (isAllRegions(selection)) return t("region.allShort");
  const parts: string[] = [];
  if (selection.regions.length > 0) {
    parts.push(t("region.count", { count: selection.regions.length }));
  }
  if (selection.iatas.length > 0) {
    parts.push(selection.iatas.length <= 2 ? selection.iatas.join(", ") : t("region.iataCount", { count: selection.iatas.length }));
  }
  return parts.join(" · ");
}

// Grouped multi-select: regions (each expands to its member IATAs) on top, then individual IATAs.
// Toggling keeps the dropdown open so several can be picked; "All Regions" clears the selection.
function RegionSelector() {
  const { t } = useTranslation();
  const { selection } = useRegionSelection();

  return (
    <Dropdown
      align="left-below-md"
      width="w-60"
      renderTrigger={({ toggle }) => (
        <button
          type="button"
          className="flex items-center gap-1.5 bg-bg-raised border border-border rounded px-3 py-1 text-text-bright font-mono text-xs font-semibold hover:border-text-dim/30 transition-colors"
          onClick={toggle}
        >
          <span className="text-text-muted font-normal text-[11px]">{t("region.label")}</span>
          {regionSummaryLabel(selection, t)}
          <span className="text-text-dim text-[11px]">▾</span>
        </button>
      )}
    >
      {() => <RegionSelectorPanel />}
    </Dropdown>
  );
}

// Split out from RegionSelector so the filter query lives and dies with the open panel.
function RegionSelectorPanel() {
  const { t } = useTranslation();
  const { selection, setSelection } = useRegionSelection();
  const { regions } = useRegions();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Take focus for typing, then hand it back on close — same restore rule as useFocusTrap.
  useEffect(() => {
    const restoreTo = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => {
      if (restoreTo && restoreTo !== document.body && document.contains(restoreTo)) restoreTo.focus();
    };
  }, []);

  const { data: iatas, isError: iatasError } = useQuery({
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

  const q = query.trim().toLowerCase();

  // A region matches on its name or on any member code. A code-only match carries those codes so the
  // row can show why it surfaced — otherwise it reads as a stray result.
  const shownRegions = useMemo(() => {
    if (!q) return regions.map((region) => ({ region, matched: [] as string[] }));
    return regions.flatMap((region) => {
      if (region.name.toLowerCase().includes(q)) return [{ region, matched: [] as string[] }];
      const matched = region.iatas.filter((code) => code.toLowerCase().includes(q));
      return matched.length > 0 ? [{ region, matched }] : [];
    });
  }, [regions, q]);

  // displayName is the closest thing to a city the API carries, and it's absent for IATAs the server
  // auto-created from packet traffic — those stay reachable by code.
  const shownIatas = useMemo(() => {
    if (!iatas || !q) return iatas ?? [];
    return iatas.filter(
      (i) => i.iata.toLowerCase().includes(q) || (i.displayName ?? "").toLowerCase().includes(q),
    );
  }, [iatas, q]);

  const showAll = !q || t("region.allRegions").toLowerCase().includes(q);
  const showIataGroup = !iatas || shownIatas.length > 0; // keep the group while loading/failed
  const hasRowsAbove = showAll || shownRegions.length > 0;

  return (
    <>
      <div className="sticky -top-1 z-10 -mt-1 bg-bg-raised px-2 pt-1 pb-1.5">
        {/* Keep focused text at 16px so iOS Safari does not zoom the page. */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Escape empties the box first; only a second press reaches Dropdown's close handler.
            if (e.key === "Escape" && query) {
              e.stopPropagation();
              setQuery("");
            }
          }}
          aria-label={t("region.filter")}
          placeholder={t("region.filter")}
          className="w-full text-[16px] font-mono bg-bg-surface border border-border rounded px-2 py-1 text-text-bright placeholder:text-text-dim"
        />
      </div>

      {showAll && (
        <button
          type="button"
          className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs font-mono transition-colors ${
            isAllRegions(selection)
              ? "text-text-bright bg-primary/10"
              : "text-text-muted hover:text-text-normal hover:bg-text-normal/3"
          }`}
          onClick={() => setSelection(ALL_REGIONS)}
        >
          {/* spacer matching the checkbox column so ALL/code/name align with the rows below */}
          <span className="w-3 shrink-0" aria-hidden="true" />
          <span className="font-semibold text-primary min-w-8 shrink-0">{t("region.allShort")}</span>
          <span className="text-text-dim">{t("region.allRegions")}</span>
        </button>
      )}

      {shownRegions.length > 0 && (
        <>
          <div className="px-3 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wide text-text-dim">{t("region.group")}</div>
          {shownRegions.map(({ region, matched }) => {
            const checked = selection.regions.includes(region.slug);
            return (
              <button
                key={region.slug}
                type="button"
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs font-mono transition-colors ${
                  checked ? "text-text-bright bg-primary/10" : "text-text-muted hover:text-text-normal hover:bg-text-normal/3"
                }`}
                onClick={() => toggleRegion(region.slug)}
              >
                <CheckBox checked={checked} />
                <span className="truncate">{region.name}</span>
                {matched.length > 0 && <span className="text-text-dim shrink-0">· {matched.join(", ")}</span>}
              </button>
            );
          })}
        </>
      )}

      {showIataGroup && (
        <>
          <div className={`px-3 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wide text-text-dim ${
            hasRowsAbove ? "border-t border-border-subtle mt-1" : ""
          }`}>IATA</div>
          {iatas ? (
            shownIatas.map((i) => {
              const checked = selection.iatas.includes(i.iata);
              return (
                <button
                  key={i.iata}
                  type="button"
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs font-mono transition-colors ${
                    checked ? "text-text-bright bg-primary/10" : "text-text-muted hover:text-text-normal hover:bg-text-normal/3"
                  }`}
                  onClick={() => toggleIata(i.iata)}
                >
                  <CheckBox checked={checked} />
                  <span className="font-semibold text-primary w-8 shrink-0">{i.iata}</span>
                  <span className="text-text-dim truncate">{i.displayName || i.iata}</span>
                </button>
              );
            })
          ) : iatasError ? (
            <div className="px-3 py-1.5 text-[11px] font-mono text-text-dim">{t("region.failed")}</div>
          ) : (
            <div className="px-3 py-1.5 text-[11px] font-mono text-text-dim">{t("common.loading")}</div>
          )}
        </>
      )}

      {!hasRowsAbove && !showIataGroup && (
        <div className="px-3 py-2 text-[11px] font-mono text-text-dim">{t("region.noMatches")}</div>
      )}
    </>
  );
}

function ThemePicker() {
  const { t } = useTranslation();
  const { themeId, themes } = useTheme();
  const current = themes.find((t) => t.id === themeId);

  return (
    <Dropdown
      renderTrigger={({ toggle }) => (
        <button
          type="button"
          aria-label={t("theme.label")}
          className="flex items-center gap-1.5 bg-bg-raised border border-border rounded px-2 py-1 text-text-muted font-mono text-[11px] hover:text-text-normal hover:border-text-dim transition-colors"
          onClick={toggle}
        >
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0 border border-text-normal/20"
            style={{ background: current?.vars["--palette-primary"] }}
          />
          <span className="text-text-dim text-[11px]">▾</span>
        </button>
      )}
    >
      {(close) => <ThemeOptions onPick={close} />}
    </Dropdown>
  );
}

function ThemeOptions({ onPick }: { onPick?: () => void }) {
  const { themeId, themes, setThemeId } = useTheme();
  return (
    <>
      {selectableThemes(themes, ENABLED_THEME_IDS).map((theme) => (
        <button
          key={theme.id}
          type="button"
          aria-pressed={theme.id === themeId}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono transition-colors ${
            theme.id === themeId ? "text-text-bright bg-primary/10" : "text-text-muted hover:text-text-normal hover:bg-text-normal/3"
          }`}
          onClick={() => {
            setThemeId(theme.id);
            onPick?.();
          }}
        >
          <span className="w-3 h-3 rounded-full shrink-0 border border-text-normal/20" style={{ background: theme.vars["--palette-primary"] }} />
          {theme.name}
        </button>
      ))}
    </>
  );
}

function GitHubLink() {
  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="GitHub"
      className="text-text-muted hover:text-text-normal transition-colors shrink-0"
    >
      <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
      </svg>
    </a>
  );
}

const MENU_GROUP = "px-3 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wide text-text-dim";

// Phones fold theme, language and the repo link into one menu so the header stays a single row.
function SettingsMenu() {
  const { t } = useTranslation();
  return (
    <Dropdown
      width="w-56"
      renderTrigger={({ open, toggle }) => (
        <button
          type="button"
          aria-label={t("header.settings")}
          aria-expanded={open}
          onClick={toggle}
          className="flex h-7 w-7 items-center justify-center rounded border border-border bg-bg-raised text-text-muted hover:text-text-normal"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
            <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
          </svg>
        </button>
      )}
    >
      {(close) => (
        <>
          <div className={MENU_GROUP}>{t("language.label")}</div>
          <LanguageOptions onPick={close} />
          <div className={`${MENU_GROUP} mt-1 border-t border-border-subtle`}>{t("theme.label")}</div>
          <ThemeOptions onPick={close} />
          <div className="mt-1 flex items-center gap-2 border-t border-border-subtle px-3 py-2 font-mono text-xs text-text-muted">
            <GitHubLink />
            <span>{APP_NAME} v{__APP_VERSION__}</span>
          </div>
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
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  return (
    <div className="flex flex-col h-dvh">
      {isMobile ? (
        <header className="flex items-center gap-2 px-3 py-1.5 min-h-[42px] bg-bg-surface border-b border-border shrink-0">
          <BeaconWordmark iconSize={20} textClassName="text-sm" className="shrink-0" />
          <div className="min-w-0">
            <RegionSelector />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <RateLimitBadge />
            <LiveBadge wsManager={wsManager} compact />
            <SettingsMenu />
          </div>
        </header>
      ) : (
        <header className="flex items-center gap-3 px-4 py-1.5 min-h-[42px] bg-bg-surface border-b border-border shrink-0">
          <BeaconWordmark iconSize={22} textClassName="text-sm truncate" className="min-w-0" />
          <div className="ml-auto flex items-center gap-3">
            <RegionSelector />
            <ThemePicker />
            <LanguagePicker />
          </div>
          <div className="flex items-center gap-3">
            <LiveBadge wsManager={wsManager} />
            <RateLimitBadge />
            <GitHubLink />
          </div>
        </header>
      )}

      <nav className="hidden md:flex bg-bg-surface border-b border-border px-4 shrink-0" role="tablist">
        {ENABLED_TABS.map((tab) => (
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
            {t(`tabs.${tab}`, { defaultValue: tab })}
          </button>
        ))}
      </nav>

      <main className="flex-1 flex flex-col min-h-0">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>

      <footer className="hidden md:flex items-center px-4 py-1.5 bg-bg-surface border-t border-border font-mono text-[11px] text-text-dim shrink-0">
        <span>{APP_NAME} v{__APP_VERSION__}</span>
      </footer>

      <BottomNav activeTab={activeTab} onTabChange={onTabChange} />
    </div>
  );
}
