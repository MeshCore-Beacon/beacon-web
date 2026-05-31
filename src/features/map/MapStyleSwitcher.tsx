import { MAP_STYLES } from "./types";
import { SegmentedControl } from "./SegmentedControl";

interface MapStyleSwitcherProps {
  styleId: string;
  onChange: (id: string) => void;
  className?: string;
}

export function MapStyleSwitcher({ styleId, onChange, className }: MapStyleSwitcherProps) {
  return (
    <SegmentedControl
      ariaLabel="Map style"
      options={MAP_STYLES.map((s) => ({ value: s.id, label: s.name }))}
      value={styleId}
      onChange={onChange}
      className={className}
    />
  );
}
