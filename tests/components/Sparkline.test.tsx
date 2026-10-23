import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Sparkline } from "../../src/components/Sparkline";

describe("sparkline evidence", () => {
  it("draws isolated measured zeros and dashed bridges, without changing the input", () => {
    const values = [null, 0, null, 4, 5, null];
    const { container } = render(<Sparkline values={values} color="cyan" />);
    expect(container.querySelectorAll("[data-gap]")).toHaveLength(1);
    expect(container.querySelector("[data-gap]")).toHaveAttribute("stroke-dasharray", "3 3");
    expect(container.querySelectorAll("[data-sample]")).toHaveLength(1);
    expect(values).toEqual([null, 0, null, 4, 5, null]);
  });
  it("marks a long time gap and a single reading, without extrapolating measured points", () => {
    const { container, rerender } = render(<Sparkline values={[1, 2, 3]} times={[0, 1, 100]} gapMs={10} color="green" />);
    expect(container.querySelectorAll("[data-gap]")).toHaveLength(1);
    rerender(<Sparkline values={[0]} color="green" />);
    expect(container.querySelectorAll("[data-sample]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-gap]")).toHaveLength(0);
  });
});
