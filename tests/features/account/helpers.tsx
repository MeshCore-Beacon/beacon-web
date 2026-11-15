import { vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Probe } from "./Probe";
import type { ReactElement } from "react";
import type { User } from "../../../src/features/account/types";

export const user: User = { id: "1", username: "ridge", displayName: "Ridge Walker", email: "a@example.org", emailVerified: true, pendingEmail: null, provider: "local", createdAt: 1 };

export function renderAt(search: string, ui: ReactElement, strict = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/${search}`]}>
        {ui}
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { client, ...render(tree, strict ? { reactStrictMode: true } : undefined) };
}

export const searchOf = (el: HTMLElement) => new URLSearchParams(el.textContent ?? "");

export function authError(code: string, status = 400, message = code, retryAfterMs?: number) {
  const err = new Error(message) as Error & { status: number; code: string; retryAfterMs?: number };
  err.name = "AuthError";
  err.status = status;
  err.code = code;
  err.retryAfterMs = retryAfterMs;
  return err;
}

export const mocks = {
  features: { polling: false, accounts: "local", registration: true, telemetryRequests: false, alerts: false } as Record<string, unknown>,
  featuresLoading: false,
  signedIn: null as User | null,
};

export function resetMocks() {
  mocks.features = { polling: false, accounts: "local", registration: true, telemetryRequests: false, alerts: false };
  mocks.featuresLoading = false;
  mocks.signedIn = null;
}

export const fn = vi.fn;
