import { useState, useCallback } from "react";
import { VARIANT_CLASSES } from "./badge-utils";

// Copy-to-clipboard pill, styled to match the analyzer's "Copy Link" button: flips to a green
// "Copied" state for 1.5s after a click. aria-label defaults to the visible label.
export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  ariaLabel,
  className,
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);

  return (
    <button
      type="button"
      className={`inline-flex items-center font-mono text-[11px] font-semibold px-2 py-0.5 rounded-sm border tracking-wider uppercase cursor-pointer transition-colors ${copied ? VARIANT_CLASSES.live : VARIANT_CLASSES.text} ${className ?? ""}`}
      onClick={handleCopy}
      aria-label={ariaLabel ?? label}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
