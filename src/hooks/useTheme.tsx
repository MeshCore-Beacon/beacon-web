/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { type Theme, DEFAULT_THEME_ID, loadThemes, applyTheme } from "../lib/themes";
import { ENABLED_THEME_IDS, selectableThemes } from "../lib/constants";

// loads themes from JSON, persists selection, applies CSS vars

const STORAGE_KEY = "beacon-theme";

interface ThemeCtx {
  themeId: string;
  themes: Theme[];
  setThemeId: (id: string) => void;
  // bumps every time CSS vars are (re)applied — themeId alone misses the initial load, where the
  // saved id is already in state before the vars land, so readers of computed styles key on this
  paletteRev: number;
}

const ThemeContext = createContext<ThemeCtx>({
  themeId: DEFAULT_THEME_ID,
  themes: [],
  setThemeId: () => {},
  paletteRev: 0,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [paletteRev, setPaletteRev] = useState(0);
  const [themeId, setThemeIdState] = useState(
    () => localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID,
  );

  useEffect(() => {
    loadThemes().then((loaded) => {
      setThemes(loaded);
      const saved = localStorage.getItem(STORAGE_KEY);
      // Restrict the startup theme to the selectable set, so an allowlist can't leave the app on a
      // theme the picker won't offer (e.g. a persisted default when only MeshMapper themes are enabled).
      const selectable = selectableThemes(loaded, ENABLED_THEME_IDS);
      const match = selectable.find((t) => t.id === saved) ?? selectable[0] ?? loaded[0];
      if (!match) return;
      applyTheme(match);
      setPaletteRev((r) => r + 1);
      setThemeIdState(match.id);
    });
  }, []);

  const setThemeId = useCallback(
    (id: string) => {
      const match = themes.find((t) => t.id === id);
      if (!match) return;
      applyTheme(match);
      setPaletteRev((r) => r + 1);
      localStorage.setItem(STORAGE_KEY, id);
      setThemeIdState(id);
    },
    [themes],
  );

  return (
    <ThemeContext.Provider value={{ themeId, themes, setThemeId, paletteRev }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
