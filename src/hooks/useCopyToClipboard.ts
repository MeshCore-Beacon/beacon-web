import { useCallback, useEffect, useRef, useState } from "react";

export type CopyState = "idle" | "copied" | "failed";

// Copies text and flashes the outcome for 1.5s. navigator.clipboard is undefined outside a secure
// context (plain http), so the call goes through a promise executor to turn that throw into a rejection.
export function useCopyToClipboard(): { state: CopyState; copy: (text: string) => void } {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback((text: string) => {
    const flash = (next: CopyState) => {
      setState(next);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("idle"), 1500);
    };
    new Promise<void>((resolve) => resolve(navigator.clipboard.writeText(text))).then(
      () => flash("copied"),
      () => flash("failed"),
    );
  }, []);

  return { state, copy };
}
