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
});
