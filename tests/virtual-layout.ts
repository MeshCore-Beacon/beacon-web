import { vi } from "vitest";

// jsdom does no layout: the virtualizer reads offsetHeight for its scroll viewport and for each [data-index] item
export function stubVirtualLayout(viewportPx: number, itemPx: number | ((item: HTMLElement) => number)) {
  return vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    if (!this.hasAttribute("data-index")) return viewportPx;
    return typeof itemPx === "number" ? itemPx : itemPx(this);
  });
}
