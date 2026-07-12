import { describe, it, expect, vi } from "vitest";
import { StrictMode } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { SelectionResetOnRegion } from "../src/App";
import { RegionProvider, useRegionSelection } from "../src/hooks/useRegion";

function RegionChanger() {
  const { setSelection } = useRegionSelection();
  return <button onClick={() => setSelection({ regions: [], iatas: ["YYZ"] })}>change</button>;
}

describe("SelectionResetOnRegion", () => {
  // Regression: a deep-linked ?node/?observer selection must survive load. The reset watches the raw
  // selection (not the resolved regionKey) so the async slug→IATA expansion doesn't count as a change,
  // and compares the previous value so StrictMode's double effect invoke can't fire it on mount.
  it("does not reset on mount, even under StrictMode's double effect invoke", () => {
    const onReset = vi.fn();
    render(
      <StrictMode>
        <RegionProvider defaultSelection={{ regions: [], iatas: ["YVR"] }}>
          <SelectionResetOnRegion onRegionChange={onReset} />
        </RegionProvider>
      </StrictMode>,
    );
    expect(onReset).not.toHaveBeenCalled();
  });

  it("resets once when the user changes the region selection", () => {
    const onReset = vi.fn();
    render(
      <RegionProvider defaultSelection={{ regions: [], iatas: ["YVR"] }}>
        <SelectionResetOnRegion onRegionChange={onReset} />
        <RegionChanger />
      </RegionProvider>,
    );
    expect(onReset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("change"));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
