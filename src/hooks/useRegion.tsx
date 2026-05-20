/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, type ReactNode } from "react";

// region context shared across the app

interface RegionContextValue {
  region: string;
  setRegion: (region: string) => void;
}

const RegionContext = createContext<RegionContextValue | null>(null);

export function RegionProvider({ defaultRegion, children }: { defaultRegion: string; children: ReactNode }) {
  const [region, setRegion] = useState(defaultRegion);

  return <RegionContext.Provider value={{ region, setRegion }}>{children}</RegionContext.Provider>;
}

export function useRegion(): string {
  const ctx = useContext(RegionContext);
  if (!ctx) throw new Error("useRegion must be used within RegionProvider");
  return ctx.region;
}

export function useSetRegion(): (region: string) => void {
  const ctx = useContext(RegionContext);
  if (!ctx) throw new Error("useSetRegion must be used within RegionProvider");
  return ctx.setRegion;
}
