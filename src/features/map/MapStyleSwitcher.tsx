import { useTranslation } from "react-i18next";
import { MAP_STYLES } from "./types";
import { SegmentedControl } from "./SegmentedControl";

interface MapStyleSwitcherProps {
  styleId: string;
  onChange: (id: string) => void;
  className?: string;
}

export function MapStyleSwitcher({ styleId, onChange, className }: MapStyleSwitcherProps) {
  const { t } = useTranslation();
  return (
    <SegmentedControl
      ariaLabel={t("map.style")}
      options={MAP_STYLES.map((s) => ({ value: s.id, label: t(`map.styles.${s.id}`, { defaultValue: s.name }) }))}
      value={styleId}
      onChange={onChange}
      className={className}
    />
  );
}
