import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoadingPill } from "../../src/components/LoadingPill";

describe("LoadingPill", () => {
  it("shows a loading label with a live region", () => {
    render(<LoadingPill loading count={42} noun="nodes" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading nodes… (42)");
  });

  it("shows a total-failure label when nothing loaded", () => {
    render(<LoadingPill loading={false} error count={0} noun="observers" />);
    expect(screen.getByRole("status")).toHaveTextContent("Failed to load observers");
  });

  it("shows a partial-failure label when some rows loaded", () => {
    render(<LoadingPill loading={false} error count={7} noun="nodes" />);
    expect(screen.getByRole("status")).toHaveTextContent("Some nodes failed to load (7 shown)");
  });

  it("renders nothing when idle (not loading, no error)", () => {
    const { container } = render(<LoadingPill loading={false} count={0} noun="nodes" />);
    expect(container).toBeEmptyDOMElement();
  });
});
