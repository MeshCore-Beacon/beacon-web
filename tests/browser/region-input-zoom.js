// Open REGION, then run in a real browser at phone, tablet and desktop widths.
// jsdom does not load Tailwind's generated CSS; inspect the rendered input instead.
// Also check on iOS Safari: opening, filtering and closing must leave zoom unchanged.
(function checkRegionInputZoom() {
  const input = document.querySelector('header input[placeholder="Filter IATA or name…"]');
  if (!input) throw new Error("Open the region picker first");
  const fontSize = Number.parseFloat(getComputedStyle(input).fontSize);
  if (fontSize < 16 || !Number.isFinite(fontSize)) {
    throw new Error(`Region filter is ${fontSize}px; small focused inputs can trigger Safari zoom`);
  }
  if (document.activeElement !== input) throw new Error("Region filter did not receive focus");
  return { viewport: document.documentElement.clientWidth, fontSize, focused: true };
})();
