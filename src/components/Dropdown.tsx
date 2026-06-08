import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { useClickOutside } from "../hooks/useClickOutside";

export function Dropdown({ renderTrigger, align = "right", width = "w-48", fullWidth = false, children }: {
  renderTrigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  align?: "left" | "right";
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
      if (e.key === "Escape") close();
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
            : `absolute top-full mt-1 ${align === "left" ? "left-0" : "right-0"} ${width} max-w-[calc(100vw-1.5rem)] bg-bg-raised border border-border rounded-md shadow-lg z-50 py-1 max-h-80 overflow-y-auto`
        }>
          {children(close)}
        </div>
      )}
    </div>
  );
}
