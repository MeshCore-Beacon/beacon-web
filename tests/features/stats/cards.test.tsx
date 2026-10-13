import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card, StatCard } from "../../../src/features/stats/cards";

it("keeps the header on one line unless a caller asks for the right slot to wrap", () => {
  const view = render(<Card title="Plain" right={<button type="button">Act</button>}>body</Card>);
  const header = screen.getByRole("button", { name: "Act" }).parentElement!;
  expect(header).not.toHaveClass("flex-wrap");
  view.unmount();
  render(<Card title="Wrapping" wrap right={<button type="button">Act</button>}>body</Card>);
  expect(screen.getByRole("button", { name: "Act" }).parentElement).toHaveClass("flex-wrap");
});

it("keeps a compact tile's value small and its chart at the foot so stretched tiles stay uniform", () => {
  const { container } = render(<StatCard label="Mean RSSI" value="-77.2 dBm" accent="red" spark={[1, 2]} compact />);
  const tile = container.firstElementChild!;
  expect(tile).toHaveClass("flex", "flex-col");
  expect(screen.getByText("-77.2 dBm")).toHaveClass("text-xl");
  expect(screen.getByText("-77.2 dBm")).not.toHaveClass("sm:text-2xl");
  expect(container.querySelector("svg")!.parentElement).toHaveClass("mt-auto");
});

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

it("keeps isolated readings visible without connecting across missing hours", () => {
  const { container } = render(<StatCard label="Signal" value="2 dB" accent="green" spark={[0, null, 4]} />);
  expect(container.querySelectorAll("polyline")).toHaveLength(0);
  const points = [...container.querySelectorAll("[data-sample]")];
  expect(points.map(point => point.getAttribute("x1"))).toEqual(["0", "120"]);
});

it("draws a single known value at a finite position, including zero", () => {
  const { container } = render(<StatCard label="Signal" value="0 dB" accent="green" spark={[0]} />);
  const point = container.querySelector("[data-sample]");
  expect(point).not.toBeNull();
  expect(point?.getAttribute("x1")).toBe("60");
  expect(Number.isFinite(Number(point?.getAttribute("y1")))).toBe(true);
});
