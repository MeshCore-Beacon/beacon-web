import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

export const VIEWS = ["signin", "register", "verify", "reset", "profile"] as const;
export type AccountView = (typeof VIEWS)[number];

// Everything a view puts in the URL; closing or switching removes all of it.
export const VIEW_PARAMS = ["view", "token", "app", "code_challenge", "state"] as const;

function asView(value: string | null): AccountView | null {
  return (VIEWS as readonly string[]).includes(value ?? "") ? (value as AccountView) : null;
}

export function useView(): {
  view: AccountView | null;
  open(view: AccountView, params?: Record<string, string>): void;
  close(): void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = asView(searchParams.get("view"));

  const open = useCallback((next: AccountView, params?: Record<string, string>) => {
    setSearchParams((prev) => {
      const out = new URLSearchParams(prev);
      for (const key of VIEW_PARAMS) out.delete(key);
      out.set("view", next);
      for (const [key, value] of Object.entries(params ?? {})) out.set(key, value);
      return out;
    });
  }, [setSearchParams]);

  const close = useCallback(() => {
    setSearchParams((prev) => {
      const out = new URLSearchParams(prev);
      for (const key of VIEW_PARAMS) out.delete(key);
      return out;
    });
  }, [setSearchParams]);

  return { view, open, close };
}

// Drops just the token (kept out of history once it is used), leaving the view open.
export function useClearToken(): () => void {
  const [, setSearchParams] = useSearchParams();
  return useCallback(() => {
    setSearchParams((prev) => {
      const out = new URLSearchParams(prev);
      out.delete("token");
      return out;
    }, { replace: true });
  }, [setSearchParams]);
}
