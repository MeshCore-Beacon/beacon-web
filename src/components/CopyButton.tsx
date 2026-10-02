import { useTranslation } from "react-i18next";
import { VARIANT_CLASSES, COPY_STATE_VARIANT } from "./badge-utils";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";

// Copy-to-clipboard pill, styled to match the analyzer's "Copy Link" button: flips to a green
// "Copied" state for 1.5s after a click (or a red "Copy failed"). aria-label defaults to the visible label.
export function CopyButton({
  value,
  label,
  copiedLabel,
  ariaLabel,
  className,
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const { state, copy } = useCopyToClipboard();
  label ??= t("common.copy");
  copiedLabel ??= t("common.copied");

  return (
    <button
      type="button"
      className={`inline-flex items-center font-mono text-[11px] font-semibold px-2 py-0.5 rounded-sm border tracking-wider uppercase cursor-pointer transition-colors ${VARIANT_CLASSES[COPY_STATE_VARIANT[state]]} ${className ?? ""}`}
      onClick={() => copy(value)}
      aria-label={ariaLabel ?? label}
    >
      {state === "copied" ? copiedLabel : state === "failed" ? t("common.copyFailed") : label}
    </button>
  );
}
