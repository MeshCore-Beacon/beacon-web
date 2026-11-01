import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MeshMapperSection } from "../../../src/features/nodes/MeshMapperSection";
import type { MeshMapperRepeater } from "../../../src/features/nodes/types";

const profile: MeshMapperRepeater = { fetchedAt: 1793490000000, site: {}, carpeater: false, admins: [], scopes: [] };

describe("MeshMapper profile evidence", () => {
  it("keeps ASL-only and zero-valued manually entered data, escaping text", () => {
    const { container } = render(<MeshMapperSection mm={{ ...profile, site: { heightAslM: 0, power: "<script>bad()</script>", notes: "site\nnotes" } }} />);
    expect(screen.getByText("0 m ASL")).toBeInTheDocument();
    expect(screen.getByText("<script>bad()</script>")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText(/entered by owners/)).toBeInTheDocument();
  });
  it("shows cached failure and provider evidence without claiming Beacon routes", () => {
    render(<MeshMapperSection mm={{ ...profile, refreshFailed: true, status: "ambiguous", backbone: false, backboneShare: 0, advertBytes: 3, currentPreset: "910.525,62.5,7", neighbors: [{ key: "0123456789ABCDEF", resolved: false, snr: 0 }], profileUrl: "https://ykf.meshmapper.net/?repeater=ABC123%2C43%2C-80" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("last fetched data");
    fireEvent.click(screen.getByText("MeshMapper observations"));
    expect(screen.getByText("ID ambiguity")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Uploaded neighbour table (1)"));
    expect(screen.getByText(/do not create Beacon routes/)).toBeInTheDocument();
    expect(screen.getByText("Unresolved prefix")).toBeInTheDocument();
    expect(screen.getByText("0 dB")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("rel", "noopener noreferrer");
  });
  it.each(["javascript:alert(1)", "https://meshmapper.net.evil.invalid/", "https://key@ykf.meshmapper.net/"])("rejects untrusted links %s", url => {
    render(<MeshMapperSection mm={{ ...profile, site: { hardware: "Board" }, profileUrl: url }} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("omits an empty optional profile", () => {
    const { container } = render(<MeshMapperSection mm={profile} />);
    expect(container).toBeEmptyDOMElement();
  });
});
