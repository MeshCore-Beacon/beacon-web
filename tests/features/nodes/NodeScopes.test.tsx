import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NodeScopes } from "../../../src/features/nodes/NodeScopes";
import type { Node } from "../../../src/features/nodes/types";

describe("node scope evidence", () => {
  it("shows the full heard/reported list separately from default and repeat counts", () => {
    const node = { nodeType: 2, defaultScope: "#default", scopeEvidence: { since: 1, until: 2, conflictingReports: true,
      scopes: [{ name: "#on", repeatObservations: 15, reported: true, minHashBytes: 2 }, { name: "*", repeatObservations: 2, reported: true }, { name: "?", repeatObservations: 20 }, { name: "#heard", repeatObservations: 0, heardAt: 1 }] } } as Node;
    render(<NodeScopes node={node} />);
    expect(screen.getByText("#default")).toBeInTheDocument();
    expect(screen.getByText("#on")).toBeInTheDocument();
    expect(screen.getByText("Unscoped / wildcard (*)")).toBeInTheDocument();
    expect(screen.getByText("Scoped · name unresolved")).toBeInTheDocument();
    expect(screen.getByText("#heard")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("Advert default")).toBeInTheDocument();
    expect(screen.getByText("Heard by observer")).toBeInTheDocument();
    expect(screen.getByText(/Stored scope-list replies differ/)).toBeInTheDocument();
  });
});
