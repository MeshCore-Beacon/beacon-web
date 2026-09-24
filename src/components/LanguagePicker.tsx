import { useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { languages } from "../i18n";
import { Dropdown } from "./Dropdown";

export function LanguagePicker() {
  const { t, i18n } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const language = i18n.resolvedLanguage ?? "en";
  const selectedName = languages.find(({ code }) => code === language)?.name ?? language;
  return (
    <Dropdown
      width="w-48"
      renderTrigger={({ open, toggle }) => (
        <button
          ref={triggerRef}
          type="button"
          aria-label={`${t("language.label")}: ${selectedName}`}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          title={t("language.help")}
          onClick={toggle}
          className="flex items-center gap-1.5 bg-bg-raised border border-border rounded px-3 py-1 text-text-bright font-mono text-xs font-semibold hover:border-text-dim/30 transition-colors"
        >
          <span className="text-text-muted font-normal text-[11px] uppercase">{t("language.label")}</span>
          {language.toUpperCase()}
          <span className="text-text-dim text-[11px]">▾</span>
        </button>
      )}
    >
      {(close) => (
        <div
          id={panelId}
          role="group"
          aria-label={t("language.label")}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close();
              triggerRef.current?.focus();
            }
          }}
        >
          {languages.map(({ code, name }) => (
            <button
              key={code}
              type="button"
              aria-pressed={language === code}
              onClick={() => {
                void i18n.changeLanguage(code);
                close();
                triggerRef.current?.focus();
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs font-mono transition-colors ${
                language === code ? "text-text-bright bg-primary/10" : "text-text-muted hover:text-text-normal hover:bg-text-normal/3"
              }`}
            >
              <span aria-hidden="true" className="font-semibold text-primary min-w-8 shrink-0">{code.toUpperCase()}</span>
              <span lang={code}>{name}</span>
            </button>
          ))}
        </div>
      )}
    </Dropdown>
  );
}
