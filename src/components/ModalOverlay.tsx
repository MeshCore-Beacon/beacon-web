import { useRef, type ReactNode } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";

// Backdrop close fires only when the press started on the backdrop, so releasing a text
// selection there doesn't close it. Escape stops at this layer.
// `inactive` steps a stacked-under overlay out of the modal/a11y path while keeping it
// mounted, so focus can return to it when the overlay above closes.
// `centered` is a dialog in the middle of the screen instead of the right-side drawer.
export function ModalOverlay({ label, onClose, inactive = false, centered = false, children }: {
  label: string;
  onClose: () => void;
  inactive?: boolean;
  centered?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pressedBackdrop = useRef(false);
  useFocusTrap(ref);

  return (
    <div
      ref={ref}
      className={`absolute inset-0 z-40 flex bg-black/50 fade-in ${centered ? "items-center justify-center p-3 sm:p-6" : "justify-end"}`}
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
      <div className={`flex shadow-2xl ${centered ? "max-h-full w-full max-w-4xl" : "h-full"}`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
