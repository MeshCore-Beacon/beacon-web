import { useState, useRef, useCallback, type ReactNode } from "react";
import { useClickOutside } from "../hooks/useClickOutside";

export function Dropdown({ renderTrigger, align = "right", width = "w-48", children }: {
  renderTrigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  align?: "left" | "right";
  width?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  useClickOutside(ref, open, close);

  return (
    <div ref={ref} className="relative">
      {renderTrigger({ open, toggle })}
      {open && (
        <div className={`absolute ${align === "left" ? "left-0" : "right-0"} top-full mt-1 ${width} bg-bg-raised border border-border rounded-md shadow-lg z-50 py-1 max-h-80 overflow-y-auto`}>
          {children(close)}
        </div>
      )}
    </div>
  );
}
