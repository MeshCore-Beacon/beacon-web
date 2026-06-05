import { useEffect, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

// Keeps keyboard focus inside a modal container: focuses the container itself on open (so a screen
// reader announces the dialog before Tab moves into the controls), cycles Tab/Shift+Tab within it so
// focus can't escape behind the overlay, and on close returns focus to the triggering element (only
// if it's still a real, connected control). The container must carry tabIndex={-1} to be focusable.
export function useFocusTrap<T extends HTMLElement>(ref: RefObject<T | null>): void {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const restoreTo = document.activeElement as HTMLElement | null;

    const focusable = () => Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
    // Focus the dialog itself (it carries tabIndex={-1}) so a screen reader announces its name before
    // the first Tab moves into the controls.
    node.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const els = focusable();
      const first = els[0];
      const last = els[els.length - 1];
      if (!first || !last) {
        e.preventDefault(); // nothing focusable inside — don't let Tab escape the modal
        return;
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
      // Only return focus to a real, still-connected trigger. If the modal was opened from a click that
      // left focus on <body>, restoring would blur wherever the user has since moved.
      if (restoreTo && restoreTo !== document.body && document.contains(restoreTo)) restoreTo.focus();
    };
  }, [ref]);
}
