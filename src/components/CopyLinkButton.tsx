import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { VARIANT_CLASSES, COPY_STATE_VARIANT } from "./badge-utils";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";

// Copies a shareable deep link to the current page with the given query params set (built fresh from
// the address bar at click time, so region/other params are preserved). Flips to "Copied" for 1.5s.
// `params` may be a static map or a thunk evaluated on click — the thunk form can read live state
// (e.g. the map camera) and use a null value to delete a key that's now at its default.
export function CopyLinkButton({
  params,
  label,
  copiedLabel,
  ariaLabel,
  preserveParams,
}: {
  params: Record<string, string> | (() => Record<string, string | null>);
  label?: string;
  copiedLabel?: string;
  ariaLabel?: string;
  preserveParams?: readonly string[];
}) {
  const { t } = useTranslation();
  const { state, copy } = useCopyToClipboard();
  const idleLabel = label ?? t("common.copyLink");

  const handleCopy = useCallback(() => {
    const url = new URL(window.location.href);
    if (preserveParams) for (const key of [...url.searchParams.keys()]) if (!preserveParams.includes(key)) url.searchParams.delete(key);
    const resolved = typeof params === "function" ? params() : params;
    for (const [key, value] of Object.entries(resolved)) {
      if (value === null) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    copy(url.toString());
  }, [params, preserveParams, copy]);

  return (
    <button
      type="button"
      className={`inline-flex items-center font-mono text-[11px] font-semibold px-2 py-0.5 rounded-sm border tracking-wider uppercase cursor-pointer transition-colors ${VARIANT_CLASSES[COPY_STATE_VARIANT[state]]}`}
      onClick={handleCopy}
      aria-label={ariaLabel ?? idleLabel}
    >
      {state === "copied" ? copiedLabel ?? t("common.copied") : state === "failed" ? t("common.copyFailed") : idleLabel}
    </button>
  );
}
