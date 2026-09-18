import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { useClickOutside } from "../hooks/useClickOutside";

const ALIGN_CLASS = { left: "left-0", right: "right-0", "left-below-md": "left-0 md:left-auto md:right-0" } as const;

export function Dropdown({ renderTrigger, align = "right", width = "w-48", fullWidth = false, children }: {
  renderTrigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  // left-below-md: the trigger sits at the left edge of a phone row but mid-row on desktop
  align?: "left" | "right" | "left-below-md";
  width?: string;
  // stretch + render the panel inline (accordion) for the mobile filter sheet
  fullWidth?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  useClickOutside(ref, open, close);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation(); // innermost layer wins — don't let an enclosing sheet/modal close too
      close();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, close]);

  return (
    <div ref={ref} className={`relative ${fullWidth ? "w-full" : ""}`}>
      {renderTrigger({ open, toggle })}
      {open && (
        <div className={
          fullWidth
            ? "mt-1 w-full bg-bg-raised border border-border rounded-md py-1 max-h-72 overflow-y-auto"
            : `absolute top-full mt-1 ${ALIGN_CLASS[align]} ${width} max-w-[calc(100vw-1.5rem)] bg-bg-raised border border-border rounded-md shadow-lg z-50 py-1 max-h-80 overflow-y-auto`
        }>
          {children(close)}
        </div>
      )}
    </div>
  );
}
