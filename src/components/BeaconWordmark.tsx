// BEACON wordmark: beacon icon + app name (VITE_APP_NAME, default "BEACON") in Chakra Petch.
// `text-primary` on the wrapper drives both the icon (currentColor) and the
// text color, so the whole mark follows the active theme.

import { BeaconLogo } from "./BeaconLogo";
import { APP_NAME } from "../lib/constants";

const DEFAULT_NAME = "BEACON";

interface BeaconWordmarkProps {
  iconSize?: number;
  textClassName?: string;
  className?: string;
  pulse?: boolean;
}

export function BeaconWordmark({
  iconSize = 22,
  textClassName = "text-base",
  className,
  pulse = false,
}: BeaconWordmarkProps) {
  // A name longer than the default gives up some spacing and size on narrow screens before it truncates.
  const long = APP_NAME.length > DEFAULT_NAME.length;
  const fit = long ? "max-md:tracking-[0.08em] max-md:text-[13px]" : "";
  return (
    <span className={`inline-flex min-w-0 items-center gap-2 text-primary ${className ?? ""}`}>
      <BeaconLogo size={iconSize} pulse={pulse} className="shrink-0" />
      <span
        className={`min-w-0 truncate font-medium uppercase tracking-[0.18em] leading-none ${textClassName} ${fit}`}
        style={{ fontFamily: "'Chakra Petch', sans-serif" }}
      >
        {APP_NAME}
      </span>
    </span>
  );
}
