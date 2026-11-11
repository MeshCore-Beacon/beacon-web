import { useTranslation } from "react-i18next";
import { Dropdown } from "../../components/Dropdown";

interface TilePickerProps {
  label: string;
  options: { value: string; label: string }[];
  onPick: (value: string) => void;
  onReset?: () => void; // offered under the choices when the card is off its default layout
  up?: boolean;
}

// A tile's own label is the trigger and the caret hangs in the gap after it, so the picker costs the tile no room.
export function TilePicker({ label, options, onPick, onReset, up }: TilePickerProps) {
  const { t } = useTranslation();
  const name = t("atlas.changeTile", { name: label });
  return (
    <Dropdown
      align="left"
      up={up}
      width="w-38"
      renderTrigger={({ open, toggle }) => (
        <button
          type="button"
          className="relative -m-1 cursor-pointer rounded-sm p-1 font-semibold uppercase tracking-wider hover:text-text-normal"
          aria-label={name}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={toggle}
        >
          {label}
          <span aria-hidden className="absolute left-full top-1/2 -ml-0.5 -translate-y-1/2 text-[8px] text-text-dim">▾</span>
        </button>
      )}
    >
      {(close) => (
        <div className="font-normal normal-case tracking-normal">
          <div role="listbox" aria-label={name}>
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={false}
                className="w-full px-2.5 py-1 text-left font-mono text-xs text-text-muted transition-colors hover:bg-text-normal/3 hover:text-text-normal"
                onClick={() => {
                  onPick(option.value);
                  close();
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          {onReset && (
            <div className="mt-1 border-t border-border pt-1">
              <button
                type="button"
                className="w-full px-2.5 py-1 text-left font-mono text-xs text-primary transition-colors hover:bg-text-normal/3"
                onClick={() => {
                  onReset();
                  close();
                }}
              >
                {t("atlas.resetTiles")}
              </button>
            </div>
          )}
        </div>
      )}
    </Dropdown>
  );
}
