import { useTranslation } from "react-i18next";
import { languages } from "../i18n";

export function LanguagePicker() {
  const { t, i18n } = useTranslation();
  return (
    <select
      aria-label={t("language.label")}
      title={t("language.help")}
      value={i18n.resolvedLanguage ?? "en"}
      onChange={(event) => { void i18n.changeLanguage(event.target.value); }}
      className="w-24 shrink-0 bg-bg-raised border border-border rounded px-1 py-1 text-text-bright text-[16px] md:text-xs cursor-pointer"
    >
      {languages.map(({ code, name }) => <option key={code} value={code} lang={code}>{name}</option>)}
    </select>
  );
}
