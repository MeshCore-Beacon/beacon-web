import { useRef, type ReactNode } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";

// Right-anchored modal: dims the surface, focuses and traps keyboard focus within the panel, and
// closes on a backdrop click — only when the press started there, so releasing a text selection over
// the backdrop doesn't close. Escape closes only this active layer and stops before parent handlers.
// Pass `inactive` when another overlay is stacked on top so this one steps out of the modal/a11y
// path — it stops being an active modal and is hidden from assistive tech, while staying mounted so
// focus can return into it when the overlay above closes.
export function ModalOverlay({ label, onClose, inactive = false, children }: {
  label: string;
  onClose: () => void;
  inactive?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pressedBackdrop = useRef(false);
  useFocusTrap(ref);

  return (
    <div
      ref={ref}
      className="absolute inset-0 z-40 flex justify-end bg-black/50 fade-in"
      role="dialog"
      aria-modal={!inactive}
      aria-label={label}
      aria-hidden={inactive || undefined}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !inactive) {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
      onMouseDown={(e) => { pressedBackdrop.current = e.target === e.currentTarget; }}
      onClick={() => { if (!inactive && pressedBackdrop.current) onClose(); }}
    >
      <div className="h-full flex shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
