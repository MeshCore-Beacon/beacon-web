import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import i18n from "../src/i18n";

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

// Node 26 exposes `localStorage` as undefined without `--localstorage-file`, shadowing jsdom's.
if (!globalThis.localStorage) {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() { return store.size; },
    },
    configurable: true,
    writable: true,
  });
}

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage("en");
  try { localStorage.clear(); } catch { /* stubbed per-test */ }
});
