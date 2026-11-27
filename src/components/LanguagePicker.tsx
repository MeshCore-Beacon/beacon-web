import { useTranslation } from "react-i18next";
import { languages } from "../i18n";

export function LanguageOptions({ onPick }: { onPick?: () => void }) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "en";
  return (
    <>
      {languages.map(({ code, name }) => (
        <button
          key={code}
          type="button"
          aria-pressed={language === code}
          onClick={() => {
            void i18n.changeLanguage(code);
            onPick?.();
          }}
          className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs font-mono transition-colors ${
            language === code ? "text-text-bright bg-primary/10" : "text-text-muted hover:text-text-normal hover:bg-text-normal/3"
          }`}
        >
          <span aria-hidden="true" className="font-semibold text-primary min-w-8 shrink-0">{code.toUpperCase()}</span>
          <span lang={code}>{name}</span>
        </button>
      ))}
    </>
  );
}
