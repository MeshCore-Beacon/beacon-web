// BEACON mark: concentric flat-top hexagon "signal" rings + pulsing core.
// All strokes/fills use currentColor, so a `text-primary` wrapper recolors it
// with the active theme. Geometry recreated from the original design export.

interface BeaconLogoProps {
  size?: number;
  className?: string;
  pulse?: boolean;
}

export function BeaconLogo({ size = 24, className, pulse = false }: BeaconLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      role="img"
      aria-label="BEACON"
      className={className}
    >
      {/* rings drawn outermost -> innermost so the bright core sits on top.
          When pulsing, each ring carries the radiating wave; delays run
          inner (ring-1) -> outer (ring-3) so the signal travels outward. */}
      <polygon
        points="90,50 70,84.64 30,84.64 10,50 30,15.36 70,15.36"
        fill="none"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinejoin="round"
        opacity="0.3"
        className={pulse ? "beacon-ring beacon-ring-3" : undefined}
      />
      <polygon
        points="78,50 64,74.25 36,74.25 22,50 36,25.75 64,25.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinejoin="round"
        opacity="0.6"
        className={pulse ? "beacon-ring beacon-ring-2" : undefined}
      />
      <polygon
        points="66,50 58,63.86 42,63.86 34,50 42,36.14 58,36.14"
        fill="none"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinejoin="round"
        opacity="0.95"
        className={pulse ? "beacon-ring beacon-ring-1" : undefined}
      />
      <circle
        cx="50"
        cy="50"
        r="6.5"
        fill="currentColor"
        className={pulse ? "beacon-core-pulse" : undefined}
      />
    </svg>
  );
}
