import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";

interface Catalog {
  name: string;
  translation: Record<string, unknown>;
}

const catalogs = import.meta.glob<Catalog>("./locales/*.json", { eager: true, import: "default" });
const resources = Object.fromEntries(Object.entries(catalogs).map(([path, catalog]) => [
  path.slice("./locales/".length, -".json".length), { translation: catalog.translation },
]));

export const languages = Object.entries(catalogs).map(([path, catalog]) => ({
  code: path.slice("./locales/".length, -".json".length),
  name: catalog.name,
}));

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
  try {
    localStorage.setItem("beacon-language", language);
  } catch {
    // Keep the in-memory choice even when persistence is blocked.
  }
});

void i18n.use(initReactI18next).init({
  resources,
  lng: readLanguagePreference(),
  supportedLngs: languages.map(({ code }) => code),
  fallbackLng: "en",
  initAsync: false,
  returnEmptyString: false,
  interpolation: { escapeValue: false }, // React escapes text content.
  react: { useSuspense: false },
});

export default i18n;
