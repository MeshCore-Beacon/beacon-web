import { useRef, type ReactNode } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";

// Backdrop close fires only when the press started on the backdrop, so releasing a text
// selection there doesn't close it. Escape stops at this layer.
// `inactive` steps a stacked-under overlay out of the modal/a11y path while keeping it
// mounted, so focus can return to it when the overlay above closes.
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
