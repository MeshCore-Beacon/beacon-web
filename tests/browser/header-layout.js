// Paste into a real browser console at 320, 390, 768 and 1280 CSS pixels,
// with both header pickers closed/open and a long region selection.
// jsdom does not perform layout, so this check intentionally uses browser geometry.
(function checkHeaderLayout() {
  const header = document.querySelector("header");
  if (!header) throw new Error("Header is missing");
  const viewport = document.documentElement.clientWidth;
  const bounds = header.getBoundingClientRect();
  const controls = header.querySelectorAll("button, a, span, div");
  const panels = new Set();
  const failures = [];
  for (const element of controls) {
    if (!element.getClientRects().length) continue;
    let floating = null;
    for (let parent = element; parent && parent !== header; parent = parent.parentElement) {
      if (["absolute", "fixed"].includes(getComputedStyle(parent).position)) floating = parent;
    }
    if (floating) { panels.add(floating); continue; }
    const rect = element.getBoundingClientRect();
    if (rect.left < -0.5 || rect.right > viewport + 0.5 || rect.top < bounds.top - 0.5 || rect.bottom > bounds.bottom + 0.5) {
      failures.push(element.getAttribute("aria-label") || element.textContent.trim());
    }
  }
  for (const panel of panels) {
    const rect = panel.getBoundingClientRect();
    if (rect.left < -0.5 || rect.right > viewport + 0.5) failures.push("Open picker outside viewport");
  }
  if (failures.length) throw new Error(`Header overflows at ${viewport}px: ${failures.join(", ")}`);
  return { viewport, headerHeight: bounds.height, openPickers: panels.size, fits: true };
})();
