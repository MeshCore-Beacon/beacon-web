import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom doesn't implement matchMedia. Provide a default stub so components that read media queries
// mount as "desktop" by default — a hover-capable pointer, not below the mobile width. Individual
// tests can override window.matchMedia with their own controllable mock to drive a query.
// (hover: …) → true keeps hover-driven UI (tooltips, the path popover) in hover mode by default;
// width queries → false keep the desktop layout.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: /hover/.test(query),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

afterEach(() => {
  cleanup();
});
