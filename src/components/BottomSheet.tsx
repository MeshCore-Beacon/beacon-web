import { useEffect, useRef, type ReactNode } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";

// Mobile-only slide-up sheet. Mount it conditionally (don't toggle a prop) so the focus trap runs
// fresh on open and restores focus on close.
export function BottomSheet({ onClose, label, role = "dialog", children }: {
  onClose: () => void;
  label: string;
  role?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 md:hidden flex flex-col justify-end bg-black/50 fade-in"
      onClick={onClose}
    >
      <div
        ref={ref}
        role={role}
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="bg-bg-surface border-t border-border rounded-t-xl pb-[env(safe-area-inset-bottom)] shadow-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2 pb-1 shrink-0">
          <span className="w-9 h-1 rounded-full bg-border" aria-hidden />
        </div>
        {children}
      </div>
    </div>
  );
}
