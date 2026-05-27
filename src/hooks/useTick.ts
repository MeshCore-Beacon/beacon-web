import { useState, useEffect } from "react";

export function useTick(intervalMs = 10_000): void {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
