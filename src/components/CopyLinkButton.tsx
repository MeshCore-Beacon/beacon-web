import { useState, useCallback } from "react";
import { VARIANT_CLASSES } from "./badge-utils";

// Copies a shareable deep link to the current page with the given query params set (built fresh from
// the address bar at click time, so region/other params are preserved). Flips to "Copied" for 1.5s.
export function CopyLinkButton({
  params,
  label = "Copy Link",
  copiedLabel = "Copied",
  ariaLabel,
}: {
  params: Record<string, string>;
  label?: string;
  copiedLabel?: string;
  ariaLabel?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [params]);

  return (
    <button
      type="button"
      className={`inline-flex items-center font-mono text-[11px] font-semibold px-2 py-0.5 rounded-sm border tracking-wider uppercase cursor-pointer transition-colors ${copied ? VARIANT_CLASSES.live : VARIANT_CLASSES.text}`}
      onClick={handleCopy}
      aria-label={ariaLabel ?? label}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
