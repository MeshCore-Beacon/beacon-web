/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { type Theme, DEFAULT_THEME_ID, loadThemes, applyTheme } from "../lib/themes";

// loads themes from JSON, persists selection, applies CSS vars

const STORAGE_KEY = "tower-theme";

interface ThemeCtx {
  themeId: string;
  themes: Theme[];
  setThemeId: (id: string) => void;
}

const ThemeContext = createContext<ThemeCtx>({
  themeId: DEFAULT_THEME_ID,
  themes: [],
  setThemeId: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [themeId, setThemeIdState] = useState(
    () => localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID,
  );

  useEffect(() => {
    loadThemes().then((loaded) => {
      setThemes(loaded);
      const saved = localStorage.getItem(STORAGE_KEY);
      const match = loaded.find((t) => t.id === saved) ?? loaded[0];
      if (!match) return;
      applyTheme(match);
      setThemeIdState(match.id);
    });
  }, []);

  const setThemeId = useCallback(
    (id: string) => {
      const match = themes.find((t) => t.id === id);
      if (!match) return;
      applyTheme(match);
      localStorage.setItem(STORAGE_KEY, id);
      setThemeIdState(id);
    },
    [themes],
  );

  return (
    <ThemeContext.Provider value={{ themeId, themes, setThemeId }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
