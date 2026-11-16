import { useCallback, useEffect, useRef, useState } from "react";

// A confirmation that clears itself: show() turns it on, hide() or the timeout turns it off.
export function useFlash(ms = 5000) {
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setOn(false);
  }, []);
  const show = useCallback(() => {
    clearTimeout(timer.current);
    setOn(true);
    timer.current = setTimeout(() => setOn(false), ms);
  }, [ms]);
  return { on, show, hide };
}
