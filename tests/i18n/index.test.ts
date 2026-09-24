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
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(readLanguagePreference()).toBe("en");
    await i18n.changeLanguage("fr");
    expect(i18n.t("tabs.Packets")).toBe("Paquets");
    expect(document.documentElement.lang).toBe("fr");
    expect(document.documentElement.dir).toBe("ltr");
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
    expect(i18n.t("connection.rateLimited", { lng: "fr", seconds: 5 })).toBe("RÉESSAI DANS 5 s");
  });
});
