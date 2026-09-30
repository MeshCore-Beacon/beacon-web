import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "./Tooltip";

// Small (i) marker that holds explanatory notes, keeping analytics pages to headings and numbers.
export function InfoTip({ text }: { text: string | (string | false | null | undefined)[] }) {
  const { t } = useTranslation();
  const lines = (Array.isArray(text) ? text : [text]).filter((line): line is string => !!line);
  // preventDefault stops a tip inside <summary> from toggling its <details>
  const stop = (e: MouseEvent) => e.preventDefault();
  return (
    <Tooltip wrap className="align-middle" label={lines.map((line) => <span key={line} className="mt-1.5 block first:mt-0">{line}</span>)}>
      <button
        type="button"
        onClick={stop}
        className="inline-flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-full border border-text-dim font-mono text-[9px] font-semibold normal-case leading-none tracking-normal text-text-muted hover:border-text-muted hover:text-text-bright"
      >
        <span aria-hidden>i</span>
        <span className="sr-only">{t("common.info")}: {lines.join(" ")}</span>
      </button>
    </Tooltip>
  );
}
