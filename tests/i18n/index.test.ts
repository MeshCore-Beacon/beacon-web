import { afterEach, describe, expect, it, vi } from "vitest";
import i18n, { languages, readLanguagePreference } from "../../src/i18n";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem("beacon-language");
});

describe("language preferences and catalogs", () => {
  it("offers the bundled English and French catalogs by their native names", () => {
    expect(languages).toEqual(expect.arrayContaining([
      { code: "en", name: "English" },
      { code: "fr", name: "Français" },
    ]));
  });

  it("defaults to English and restores a supported saved choice", () => {
    localStorage.removeItem("beacon-language");
    expect(readLanguagePreference()).toBe("en");
    localStorage.setItem("beacon-language", "fr");
    expect(readLanguagePreference()).toBe("fr");
  });

  it.each(["unknown", "constructor", "", "../fr"])("ignores unsupported saved language %j", (value) => {
    localStorage.setItem("beacon-language", value);
    expect(readLanguagePreference()).toBe("en");
  });

  it("still changes language when browser storage is unavailable", async () => {
    vi.stubGlobal("localStorage", {
      getItem() { throw new Error("blocked"); },
      setItem() { throw new Error("blocked"); },
      removeItem() {},
    });
    try {
      expect(readLanguagePreference()).toBe("en");
      await i18n.changeLanguage("fr");
      expect(i18n.t("tabs.Packets")).toBe("Paquets");
      expect(document.documentElement.lang).toBe("fr");
      expect(document.documentElement.dir).toBe("ltr");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not persist a language on module init, only on an explicit change", async () => {
    // Isolated in-memory store: the real localStorage is a single process-wide object (Node's
    // localStorage shadows jsdom's per test file), so a leftover "beacon-language" from another
    // suite sharing this worker could otherwise land here before the dynamic import reads it.
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    });
    try {
      vi.resetModules();
      const fresh = await import("../../src/i18n");
      expect(localStorage.getItem("beacon-language")).toBeNull();
      await fresh.default.changeLanguage("fr");
      expect(localStorage.getItem("beacon-language")).toBe("fr");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("persists only the language preference and restores English document metadata", async () => {
    localStorage.setItem("beacon-region", "YVR");
    await i18n.changeLanguage("fr");
    expect(localStorage.getItem("beacon-language")).toBe("fr");
    expect(localStorage.getItem("beacon-region")).toBe("YVR");
    await i18n.changeLanguage("en");
    expect(document.documentElement.lang).toBe("en");
    localStorage.removeItem("beacon-region");
  });

  it("falls back to English for missing and empty translated strings", async () => {
    i18n.addResource("en", "translation", "fallbackTest", "English fallback");
    await i18n.changeLanguage("fr");
    expect(i18n.t("fallbackTest")).toBe("English fallback");
    i18n.addResource("fr", "translation", "fallbackTest", "");
    expect(i18n.t("fallbackTest")).toBe("English fallback");
  });

  it("uses each language's plural forms and interpolates the retry duration", () => {
    expect(i18n.t("region.count", { lng: "en", count: 1 })).toBe("1 region");
    expect(i18n.t("region.count", { lng: "en", count: 2 })).toBe("2 regions");
    expect(i18n.t("region.count", { lng: "fr", count: 1 })).toBe("1 région");
    expect(i18n.t("region.count", { lng: "fr", count: 2 })).toBe("2 régions");
    expect(i18n.t("connection.rateLimited", { lng: "fr", seconds: 5 })).toBe("DÉBIT LIMITÉ 5 s");
  });

  it("has whole-phrase battery/noise labels in both catalogs (no joined-word strings)", () => {
    expect(i18n.t("observerPage.batteryV", { lng: "en" })).toBe("Battery V");
    expect(i18n.t("observerPage.noiseDbm", { lng: "en" })).toBe("Noise dBm");
    expect(i18n.t("observerPage.batteryV", { lng: "fr" })).toBe("Batterie V");
    expect(i18n.t("observerPage.noiseDbm", { lng: "fr" })).toBe("Bruit dBm");
  });

  it("interpolates the payload-type total as a plain value, not a plural count", () => {
    // formatCount can return a non-numeric string like "1.2k"; a `count` placeholder would feed that
    // into plural resolution instead of a straight interpolation.
    expect(i18n.t("mesh.obs", { lng: "en", value: "1.2k" })).toBe("1.2k obs");
    expect(i18n.t("mesh.obs", { lng: "fr", value: "1,2k" })).toBe("1,2k obs");
  });
});

describe("catalog loading", () => {
  // A fresh module instance per test, reading an isolated store, so the shared instance's catalogs
  // (and other suites' saved language) can't leak in.
  async function freshI18n(saved?: string) {
    const store = new Map<string, string>(saved ? [["beacon-language", saved]] : []);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    });
    vi.resetModules();
    return import("../../src/i18n");
  }
  const loaded = (instance: typeof i18n) =>
    languages.map(({ code }) => code).filter((code) => instance.hasResourceBundle(code, "translation"));

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts an English visitor synchronously with only the English catalog", async () => {
    const { default: fresh } = await freshI18n();
    expect(fresh.isInitialized).toBe(true);
    expect(fresh.t("tabs.Packets")).toBe("Packets");
    expect(loaded(fresh)).toEqual(["en"]);
  });

  it("loads only the saved language, and is ready only once it has", async () => {
    const { default: fresh, ready } = await freshI18n("sv");
    await ready;
    expect(loaded(fresh)).toEqual(["en", "sv"]);
    expect(fresh.resolvedLanguage).toBe("sv");
    expect(fresh.t("tabs.Packets")).toBe("Paket");
    expect(document.documentElement.lang).toBe("sv");
    expect(localStorage.getItem("beacon-language")).toBe("sv");
  });

  it("loads a picked language's catalog before switching to it", async () => {
    const { default: fresh } = await freshI18n();
    const seen: [string, boolean, string][] = [];
    fresh.on("languageChanged", (language) => {
      seen.push([language, fresh.hasResourceBundle(language, "translation"), fresh.t("tabs.Packets")]);
    });
    const switching = fresh.changeLanguage("fr");
    // Still English while the catalog loads: never raw keys, never a half-switched language.
    expect(fresh.resolvedLanguage).toBe("en");
    expect(fresh.t("tabs.Packets")).toBe("Packets");
    await switching;
    expect(seen).toEqual([["fr", true, "Paquets"]]);
    expect(loaded(fresh)).toEqual(["en", "fr"]);
    expect(localStorage.getItem("beacon-language")).toBe("fr");
  });

  it("falls back to English for keys a loaded catalog lacks", async () => {
    const { default: fresh } = await freshI18n("fr");
    fresh.addResource("en", "translation", "fallbackTest", "English fallback");
    await fresh.changeLanguage("fr");
    expect(fresh.t("tabs.Packets")).toBe("Paquets");
    expect(fresh.t("fallbackTest")).toBe("English fallback");
  });
});
