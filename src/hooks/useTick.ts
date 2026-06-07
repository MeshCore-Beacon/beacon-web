import { useSyncExternalStore } from "react";

// Forces a re-render on a fixed interval so relative time labels ("2m ago") stay fresh. Backed by one
// shared interval per interval-length (module-level), so the many <Timestamp> instances across the app
// subscribe to a single timer instead of each spinning up its own setInterval.

interface Ticker {
  version: number;
  listeners: Set<() => void>;
  id: ReturnType<typeof setInterval> | null;
}

const tickers = new Map<number, Ticker>();

function getTicker(intervalMs: number): Ticker {
  let t = tickers.get(intervalMs);
  if (!t) {
    t = { version: 0, listeners: new Set(), id: null };
    tickers.set(intervalMs, t);
  }
  return t;
}

function subscribe(intervalMs: number, listener: () => void): () => void {
  const t = getTicker(intervalMs);
  t.listeners.add(listener);
  if (t.id === null) {
    t.id = setInterval(() => {
      t!.version++;
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

export function useTick(intervalMs = 10_000): void {
  useSyncExternalStore(
    (listener) => subscribe(intervalMs, listener),
    () => getTicker(intervalMs).version,
    () => 0,
  );
}
