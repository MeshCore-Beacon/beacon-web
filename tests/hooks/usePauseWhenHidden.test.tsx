import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { usePauseWhenHidden } from "../../src/hooks/usePauseWhenHidden";
import { WS_HIDDEN_PAUSE_MS } from "../../src/lib/constants";
import type { WsManager } from "../../src/api/ws-manager";

let visibility: DocumentVisibilityState = "visible";

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

// Behaves like WsManager: resume() reopens only after a pause.
function setup() {
  let paused = false;
  const manager = {
    pause: vi.fn(() => {
      paused = true;
    }),
    resume: vi.fn(() => {
      const was = paused;
      paused = false;
      return was;
    }),
  };
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  const hook = renderHook(() => usePauseWhenHidden(manager as unknown as WsManager), {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  return { manager, invalidate, hook };
}

beforeEach(() => {
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("pauses the feed once the tab has been hidden long enough, and refetches on return", () => {
  const { manager, invalidate } = setup();
  setVisibility("hidden");
  vi.advanceTimersByTime(WS_HIDDEN_PAUSE_MS - 1);
  expect(manager.pause).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(manager.pause).toHaveBeenCalledOnce();

  setVisibility("visible");
  expect(manager.resume).toHaveBeenCalled();
  expect(invalidate).toHaveBeenCalledOnce();
});

it("leaves a briefly hidden tab connected and refetches nothing", () => {
  const { manager, invalidate } = setup();
  setVisibility("hidden");
  vi.advanceTimersByTime(WS_HIDDEN_PAUSE_MS / 2);
  setVisibility("visible");
  vi.advanceTimersByTime(WS_HIDDEN_PAUSE_MS);
  expect(manager.pause).not.toHaveBeenCalled();
  expect(invalidate).not.toHaveBeenCalled();
});

it("counts down for a tab opened in the background, and stops on unmount", () => {
  visibility = "hidden";
  const { manager, hook } = setup();
  vi.advanceTimersByTime(WS_HIDDEN_PAUSE_MS);
  expect(manager.pause).toHaveBeenCalledOnce();

  setVisibility("visible");
  hook.unmount();
  setVisibility("hidden");
  vi.advanceTimersByTime(WS_HIDDEN_PAUSE_MS);
  expect(manager.pause).toHaveBeenCalledOnce();
});
