import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useView } from "./useView";

// A link-styled button. Inline inside a sentence, or block with a 44 px tap target on its own.
export function LinkButton({ onClick, children, inline }: { onClick: () => void; children: ReactNode; inline?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-primary underline-offset-2 hover:text-text-bright hover:underline ${inline ? "inline" : "inline-flex min-h-11 items-center self-start text-sm"}`}
    >
      {children}
    </button>
  );
}

export function Divider() {
  return <hr className="border-0 border-t border-border-subtle" />;
}

// "Already have an account? Sign in": only the last words are the link.
export function QuietLine({ text, action, onAction }: { text: string; action: string; onAction: () => void }) {
  return (
    <p className="text-center text-sm text-text-muted">
      {text} <LinkButton inline onClick={onAction}>{action}</LinkButton>
    </p>
  );
}

// One centred panel for every account view, in the upper third of the page.
export function AccountLayout({ title, description, children, wide }: { title: string; description?: ReactNode; children: ReactNode; wide?: boolean }) {
  const { t } = useTranslation();
  const { close } = useView();
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className={`mx-auto w-full ${wide ? "max-w-[560px]" : "max-w-[400px]"} px-4 pb-10 pt-6 sm:pt-[10vh]`}>
        <section className="relative flex flex-col gap-5 rounded-lg border border-border bg-bg-surface p-5 sm:p-6">
          <button
            type="button"
            onClick={close}
            aria-label={t("common.close")}
            className="absolute right-1 top-1 inline-flex h-11 w-11 items-center justify-center rounded text-text-muted hover:text-text-bright"
          >
            <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
          <header className="flex flex-col gap-1.5 pr-8">
            <h1 className="font-mono text-lg font-semibold text-text-bright">{title}</h1>
            {description && <p className="text-sm text-text-normal">{description}</p>}
          </header>
          {children}
        </section>
      </div>
    </div>
  );
}
