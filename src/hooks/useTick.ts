import { useCallback, useSyncExternalStore } from "react";

// Forces a re-render on a fixed interval so relative time labels ("2m ago") stay fresh. Backed by one
// shared interval per interval-length (module-level), so the many <Timestamp> instances across the app
// subscribe to a single timer instead of each spinning up its own setInterval.

interface Ticker {
  time: number;
  listeners: Set<() => void>;
  id: ReturnType<typeof setInterval> | null;
}

const tickers = new Map<number, Ticker>();

function getTicker(intervalMs: number): Ticker {
  let t = tickers.get(intervalMs);
  if (!t) {
    t = { time: Date.now(), listeners: new Set(), id: null };
    tickers.set(intervalMs, t);
  }
  return t;
}

function subscribe(intervalMs: number, listener: () => void): () => void {
  const t = getTicker(intervalMs);
  t.listeners.add(listener);
  if (t.id === null) {
    t.time = Date.now();
    t.id = setInterval(() => {
      t!.time = Date.now();
      t!.listeners.forEach((l) => l());
    }, intervalMs);
  }
  return () => {
    t.listeners.delete(listener);
    if (t.listeners.size === 0 && t.id !== null) {
      clearInterval(t.id);
      t.id = null;
    }
  };
}

export function useTick(intervalMs = 10_000): number {
  const listen = useCallback((listener: () => void) => subscribe(intervalMs, listener), [intervalMs]);
  return useSyncExternalStore(
    listen,
    () => getTicker(intervalMs).time,
    () => 0,
  );
}
