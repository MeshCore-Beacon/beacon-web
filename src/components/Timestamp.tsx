import { useTick } from "../hooks/useTick";
import { Tooltip } from "./Tooltip";
import { timeAgoMs, formatAbsolute } from "../lib/formatters";

interface TimestampProps {
  value: number; // epoch ms
  mode?: "relative" | "absolute"; // default "relative"
  ms?: boolean; // include .mmm in the absolute form (default false)
  className?: string;
}

// The single way to render a timestamp across the app. Defaults to a relative label ("2m ago") with
// the full absolute time on hover (via the custom Tooltip, which shows instantly — the native title
// attribute lagged ~1s); "absolute" mode flips the two. Self-refreshes via the shared ticker, so
// callers don't sprinkle useTick() or build their own tooltips.
export function Timestamp({ value, mode = "relative", ms, className }: TimestampProps) {
  useTick(); // keep the relative label fresh

  const relative = `${timeAgoMs(value)} ago`;
  const absolute = formatAbsolute(value, { ms });

  return (
    <Tooltip label={mode === "absolute" ? relative : absolute} className={className}>
      {mode === "absolute" ? absolute : relative}
    </Tooltip>
  );
}
