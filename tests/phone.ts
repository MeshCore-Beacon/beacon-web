import { vi } from "vitest";

// Make the phone breakpoint match (or not) for components that read useIsMobile.
export function setPhone(isPhone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: isPhone && query === "(max-width: 767px)", media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}
