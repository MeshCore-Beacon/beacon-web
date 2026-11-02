import { createInstance, type ReadCallback } from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";

type Translation = Record<string, unknown>;

// English stays bundled as the fallback; every other catalog is a chunk fetched on first use.
const catalogs = import.meta.glob<Translation>(["./locales/*.json", "!./locales/en.json"], { import: "translation" });

// Native names come from vite.config.ts, so listing a language doesn't load its catalog.
export const languages = Object.entries(__LANGUAGE_NAMES__).map(([code, name]) => ({ code, name }));

export function readLanguagePreference(): string {
  try {
    const saved = localStorage.getItem("beacon-language");
    if (saved && languages.some(({ code }) => code === saved)) return saved;
  } catch {
    // Storage can be unavailable; language selection still works for this visit.
  }
  return "en";
}

const i18n = createInstance();
i18n.on("languageChanged", () => {
  const language = i18n.resolvedLanguage ?? "en";
  document.documentElement.lang = language;
  document.documentElement.dir = i18n.dir(language);
  // init() itself fires this event before any user choice exists — don't persist that first, implicit one.
  if (!i18n.isInitialized) return;
  try {
    localStorage.setItem("beacon-language", language);
  } catch {
    // Keep the in-memory choice even when persistence is blocked.
  }
});

// changeLanguage() waits on this, so the UI goes straight from one complete catalog to the next.
const lazyCatalogs = {
  type: "backend" as const,
  read(language: string, _namespace: string, callback: ReadCallback) {
    const load = catalogs[`./locales/${language}.json`];
    if (!load) return callback(new Error(`No catalog for ${language}`), false);
    load().then((translation) => callback(null, translation), (error: Error) => callback(error, false));
  },
};

// Settles once the saved language's catalog is in (or failed to load), so the first render can wait for it.
export const ready = i18n.use(initReactI18next).use(lazyCatalogs).init({
  resources: { en: { translation: en.translation } },
  partialBundledLanguages: true,
  lng: readLanguagePreference(),
  supportedLngs: languages.map(({ code }) => code),
  fallbackLng: "en",
  initAsync: false,
  returnEmptyString: false,
  interpolation: { escapeValue: false }, // React escapes text content.
  react: { useSuspense: false },
});

export default i18n;
