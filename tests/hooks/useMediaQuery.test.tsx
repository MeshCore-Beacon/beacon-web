import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useMediaQuery, useIsMobile } from "../../src/hooks/useMediaQuery";

// A controllable matchMedia mock: lets a test flip `matches` and fire the change event the hook
// subscribes to, so we can assert the hook re-renders with the new value.
function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    get matches() {
      return matches;
    },
    media: "",
    onchange: null,
    addEventListener: vi.fn((_type: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.add(cb);
    }),
    removeEventListener: vi.fn((_type: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.delete(cb);
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia;
  return {
    mql,
    set(next: boolean) {
      matches = next;
      listeners.forEach((cb) => cb({ matches } as MediaQueryListEvent));
    },
  };
}

function Probe({ query }: { query: string }) {
  const value = useMediaQuery(query);
  return <span>{value ? "match" : "no-match"}</span>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMediaQuery", () => {
  it("reflects the initial matches value", () => {
    installMatchMedia(true);
    render(<Probe query="(max-width: 767px)" />);
    expect(screen.getByText("match")).toBeInTheDocument();
  });

  it("updates when the media query changes", () => {
    const ctl = installMatchMedia(false);
    render(<Probe query="(max-width: 767px)" />);
    expect(screen.getByText("no-match")).toBeInTheDocument();

    act(() => ctl.set(true));
    expect(screen.getByText("match")).toBeInTheDocument();
  });

  it("removes its listener on unmount", () => {
    const ctl = installMatchMedia(false);
    const { unmount } = render(<Probe query="(max-width: 767px)" />);
    expect(ctl.mql.addEventListener).toHaveBeenCalledTimes(1);
    unmount();
    expect(ctl.mql.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it("treats a missing matchMedia as desktop (no match)", () => {
    // @ts-expect-error simulate an environment without matchMedia
    window.matchMedia = undefined;
    render(<Probe query="(max-width: 767px)" />);
    expect(screen.getByText("no-match")).toBeInTheDocument();
  });
});

describe("useIsMobile", () => {
  function MobileProbe() {
    return <span>{useIsMobile() ? "mobile" : "desktop"}</span>;
  }

  it("is mobile when the viewport is at or below the breakpoint", () => {
    installMatchMedia(true);
    render(<MobileProbe />);
    expect(screen.getByText("mobile")).toBeInTheDocument();
  });

  it("is desktop when the viewport is above the breakpoint", () => {
    installMatchMedia(false);
    render(<MobileProbe />);
    expect(screen.getByText("desktop")).toBeInTheDocument();
  });
});
