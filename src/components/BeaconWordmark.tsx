// BEACON wordmark: beacon icon + "BEACON" text in Chakra Petch.
// `text-primary` on the wrapper drives both the icon (currentColor) and the
// text color, so the whole mark follows the active theme.

import { BeaconLogo } from "./BeaconLogo";

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
  return (
    <span className={`inline-flex items-center gap-2 text-primary ${className ?? ""}`}>
      <BeaconLogo size={iconSize} pulse={pulse} />
      <span
        className={`font-medium tracking-[0.18em] uppercase leading-none ${textClassName}`}
        style={{ fontFamily: "'Chakra Petch', sans-serif" }}
      >
        BEACON
      </span>
    </span>
  );
}
