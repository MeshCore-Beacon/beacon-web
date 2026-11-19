import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

export const VIEWS = ["signin", "register", "verify", "reset", "profile"] as const;
export type AccountView = (typeof VIEWS)[number];

// Everything a view puts in the URL; closing or switching removes all of it.
export const VIEW_PARAMS = ["view", "token", "app", "code_challenge", "state", "error"] as const;

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

// Mailed links carry the token in the fragment (`#token=…`); links sent earlier carry `?token=`.
function tokenIn(location: { search: string; hash: string }): string | null {
  const fromHash = new URLSearchParams(location.hash.replace(/^#/, "")).get("token");
  return fromHash || new URLSearchParams(location.search).get("token");
}

// Read once at startup: a URL rewrite before the lazy view mounts would otherwise lose the fragment.
let startupToken: string | null = typeof window === "undefined" ? null : tokenIn(window.location);

export function linkToken(location: { search: string; hash: string }): string | null {
  return tokenIn(location) || startupToken;
}

// Drops the token from both places (kept out of history once it is used), leaving the view open.
export function useClearToken(): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  // A ref keeps the callback stable, so effects that call it do not re-run on every navigation.
  const current = useRef(location);
  useEffect(() => {
    current.current = location;
  });
  return useCallback(() => {
    startupToken = null;
    const { pathname, search } = current.current;
    const out = new URLSearchParams(search);
    out.delete("token");
    const query = out.toString();
    navigate({ pathname, search: query ? `?${query}` : "", hash: "" }, { replace: true });
  }, [navigate]);
}
