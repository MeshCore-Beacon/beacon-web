import { type ReactNode, useState, useEffect } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { useQuery } from "@tanstack/react-query";
import { useRegion, useSetRegion } from "../hooks/useRegion";
import { useWsStatus } from "../hooks/useWsStatus";
import { useTheme } from "../hooks/useTheme";
import { Dropdown } from "./Dropdown";
import { getIatas } from "../api/client";
import type { WsManager } from "../api/ws-manager";

const TABS = ["Packets", "Nodes", "Observers", "Channels", "Stats", "Map"] as const;

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

function RegionSelector() {
  const region = useRegion();
  const setRegion = useSetRegion();

  const { data: iatas } = useQuery({
    queryKey: ["iatas"],
    queryFn: getIatas,
    staleTime: 60_000,
  });

  const current = iatas?.find((i) => i.iata === region);

  return (
    <Dropdown
      width="w-56"
      renderTrigger={({ toggle }) => (
        <button
          type="button"
          className="flex items-center gap-1.5 bg-bg-raised border border-border rounded px-3 py-1 text-text-bright font-mono text-xs font-semibold hover:border-text-dim/30 transition-colors"
          onClick={toggle}
        >
          <span className="text-text-muted font-normal text-[11px]">REGION</span>
          {region === "*" ? "ALL" : region}
          {region !== "*" && current?.displayName && (
            <span className="text-text-dim font-normal text-[11px]">{current.displayName}</span>
          )}
          <span className="text-text-dim text-[11px]">▾</span>
        </button>
      )}
    >
      {(close) => iatas ? (
        <>
          <button
            type="button"
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs font-mono transition-colors ${
              region === "*"
                ? "text-text-bright bg-primary/10"
                : "text-text-muted hover:text-text-normal hover:bg-white/3"
            }`}
            onClick={() => {
              setRegion("*");
              localStorage.setItem("tower-region", "*");
              close();
            }}
          >
            <span className="font-semibold text-primary w-8">ALL</span>
            <span className="text-text-dim">All Regions</span>
          </button>
          {iatas.map((i) => (
            <button
              key={i.iata}
              type="button"
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs font-mono transition-colors ${
                i.iata === region
                  ? "text-text-bright bg-primary/10"
                  : "text-text-muted hover:text-text-normal hover:bg-white/3"
              }`}
              onClick={() => {
                setRegion(i.iata);
                localStorage.setItem("tower-region", i.iata);
                close();
              }}
            >
              <span className="font-semibold text-primary w-8">{i.iata}</span>
              <span className="text-text-dim">{i.displayName || i.iata}</span>
            </button>
          ))}
        </>
      ) : (
        <button
          type="button"
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs font-mono text-text-bright bg-primary/10"
          onClick={() => {
            setRegion("*");
            localStorage.setItem("tower-region", "*");
            close();
          }}
        >
          <span className="font-semibold text-primary w-8">ALL</span>
          <span className="text-text-dim">All Regions</span>
        </button>
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
        <span className="font-mono font-bold text-sm text-primary tracking-wider uppercase">
          TOWER <span className="text-text-dim font-normal tracking-normal normal-case">v0.1</span>
        </span>
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
        <span>MeshCore Tower v0.1</span>
      </footer>
    </div>
  );
}
