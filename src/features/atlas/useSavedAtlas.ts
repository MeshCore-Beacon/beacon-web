import { useEffect, useRef, useState } from "react";
import { ATLAS_KEY, parseAtlas, type SavedAtlas } from "./atlas";

export function useSavedAtlas() {
  const [initial] = useState(() => {
    try {
      return { value: parseAtlas(localStorage.getItem(ATLAS_KEY)), failed: false };
    } catch {
      return { value: parseAtlas(null), failed: true };
    }
  });
  const [saved, setSaved] = useState(initial.value);
  const [storageFailed, setStorageFailed] = useState(initial.failed);
  const current = useRef(initial.value);
  useEffect(() => {
    const receive = (event: StorageEvent) => {
      if (event.key !== ATLAS_KEY && event.key !== null) return;
      current.current = parseAtlas(event.newValue);
      setSaved(current.current);
    };
    window.addEventListener("storage", receive);
    return () => window.removeEventListener("storage", receive);
  }, []);
  // `persist: false` changes only what is on screen; the synced Atlas uses it for the automatic rewrites.
  const update = (change: (value: SavedAtlas) => SavedAtlas, persist = true) => {
    const next = change(current.current);
    current.current = next;
    setSaved(next);
    if (!persist) return;
    try {
      localStorage.setItem(ATLAS_KEY, JSON.stringify(next));
      setStorageFailed(false);
    } catch {
      setStorageFailed(true);
    }
  };
  return { saved, update, storageFailed, latest: () => current.current };
}
