import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../src/lib/constants", () => ({ APP_NAME: "Beacon (DEV)" }));
import { BeaconWordmark } from "../../src/components/BeaconWordmark";

describe("BeaconWordmark", () => {
  it("keeps the name as typed but displays it in capitals, truncating instead of overflowing", () => {
    render(<BeaconWordmark />);
    const text = screen.getByText("Beacon (DEV)");
    expect(text).toHaveClass("uppercase", "truncate", "min-w-0");
    expect(text.parentElement).toHaveClass("min-w-0");
  });

  it("tightens spacing and size on a phone for a name longer than the default, so it fits beside the STALE badge at 390px", () => {
    render(<BeaconWordmark textClassName="text-sm" />);
    const text = screen.getByText("Beacon (DEV)");
    expect(text).toHaveClass("max-md:tracking-[0.08em]", "max-md:text-[13px]", "truncate");
    expect(text.parentElement).toHaveClass("min-w-0");
  });
});
