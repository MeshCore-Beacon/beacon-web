import { useCallback, useSyncExternalStore } from "react";

// Tracks a CSS media query. useSyncExternalStore so the first render reads the real value (no
// desktop→mobile flash). No matchMedia (SSR/tests) → false, keeping the desktop layout as default.
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

// Layout boundary: below Tailwind's `md` (768px), so 767px matches the CSS `md:` boundary exactly.
export const useIsMobile = () => useMediaQuery("(max-width: 767px)");

// Interaction modality (hover-to-reveal vs tap-to-toggle), not width: a wide touch device must still
// tap, or hover-driven popovers dismiss before they can be reached.
export const useHasHover = () => useMediaQuery("(hover: hover)");
