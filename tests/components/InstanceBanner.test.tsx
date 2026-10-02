import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InstanceBanner } from "../../src/components/InstanceBanner";

describe("InstanceBanner", () => {
  it("renders nothing without text", () => {
    const { container } = render(<InstanceBanner text="  " />);
    expect(container).toBeEmptyDOMElement();
  });
  it("shows the text and links any URL in it", () => {
    render(<InstanceBanner text="This is the development instance of Beacon, please use live (https://live.meshcore.ca)" />);
    const banner = screen.getByRole("note");
    expect(banner).toHaveTextContent("This is the development instance of Beacon, please use live (https://live.meshcore.ca)");
    const link = screen.getByRole("link", { name: "https://live.meshcore.ca" });
    expect(link).toHaveAttribute("href", "https://live.meshcore.ca");
  });
  it("turns [label](url) into a labelled link", () => {
    render(<InstanceBanner text="This is the Beacon development instance and may be unstable. For everyday use, visit [live.meshcore.ca](https://live.meshcore.ca)." />);
    expect(screen.getByRole("note")).toHaveTextContent("This is the Beacon development instance and may be unstable. For everyday use, visit live.meshcore.ca.");
    expect(screen.getByRole("link", { name: "live.meshcore.ca" })).toHaveAttribute("href", "https://live.meshcore.ca");
  });
});
