import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Segmented } from "../../../src/features/stats/Segmented";

const options = [{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }];

describe("Segmented", () => {
  it("sizes to its content by default", () => {
    render(<Segmented options={options} value="a" onChange={() => {}} ariaLabel="Pick" />);
    expect(screen.getByRole("group", { name: "Pick" })).toHaveClass("inline-flex");
    expect(screen.getByRole("group", { name: "Pick" })).not.toHaveClass("w-full");
    expect(screen.getByRole("button", { name: "Alpha" })).not.toHaveClass("flex-1");
  });

  it("fills its container in equal parts when stretched, and still reports the pick", () => {
    const onChange = vi.fn();
    render(<Segmented stretch options={options} value="a" onChange={onChange} ariaLabel="Pick" />);
    expect(screen.getByRole("group", { name: "Pick" })).toHaveClass("flex", "w-full");
    expect(screen.getByRole("group", { name: "Pick" })).not.toHaveClass("inline-flex");
    for (const name of ["Alpha", "Beta"]) expect(screen.getByRole("button", { name })).toHaveClass("flex-1", "justify-center");
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
