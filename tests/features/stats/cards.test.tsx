import { expect, it } from "vitest";
import { render } from "@testing-library/react";
import { StatCard } from "../../../src/features/stats/cards";

it("marks the peak hour on a sparkline when asked", () => {
  const { container } = render(<StatCard label="Busiest" value="9" accent="red" spark={[1, 9, null, 4]} markPeak />);
  const dot = container.querySelector("[data-peak]")!;
  expect(dot.getAttribute("x1")).toBe("40");
});

it("draws a presence strip with one bar per run of reporting hours", () => {
  const { container } = render(<StatCard label="Active hours" value="3/5" accent="red" presence={[true, true, false, true, false]} />);
  const bars = [...container.querySelectorAll("rect")];
  expect(bars.map((b) => [b.getAttribute("x"), b.getAttribute("width")])).toEqual([["0", "48"], ["72", "24"]]);
});
