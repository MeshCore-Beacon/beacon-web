import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PayloadBreakdown } from "../../../src/features/packets/payload-renderers";
import { formatAbsolute, timeAgoMs } from "../../../src/lib/formatters";
import type { ResolvedHop } from "../../../src/types/api";

const tracePayload = {
  type: "TRACE",
  flags: 0,
  pathHashes: ["ab", "cd"],
  snrValues: [-5, -8],
};

const resolvedRoute: ResolvedHop[] = [
  { confidence: "high", nodes: [{ id: "n1", publicKey: "abcdef00", name: "Node A" }] },
  { confidence: "ambiguous", nodes: [{ id: "n2", publicKey: "11" }, { id: "n3", publicKey: "22" }] },
];

describe("PayloadBreakdown — trace resolvedRoute overlay", () => {
  it("tints each trace-path hash block by its resolved confidence", () => {
    render(<PayloadBreakdown payload={tracePayload} resolvedRoute={resolvedRoute} />);
    expect(screen.getByText("AB").className).toContain("text-green"); // high
    expect(screen.getByText("CD").className).toContain("text-warn"); // ambiguous
  });

  it("falls back to the plain hash badge when there is no resolvedRoute", () => {
    render(<PayloadBreakdown payload={tracePayload} />);
    expect(screen.getByText("AB").className).toContain("text-primary");
  });

  it("makes a single-resolution hop's badge directly clickable (like other packets)", () => {
    const onViewNode = vi.fn();
    render(<PayloadBreakdown payload={tracePayload} resolvedRoute={resolvedRoute} onViewNode={onViewNode} />);
    // hop 0 is high-confidence with one node → the hash badge itself opens that node
    fireEvent.click(screen.getByRole("button", { name: "AB" }));
    expect(onViewNode).toHaveBeenCalledWith("n1");
    // hop 1 is ambiguous (two candidates) → not a direct button; resolved via the popover instead
    expect(screen.queryByRole("button", { name: "CD" })).not.toBeInTheDocument();
  });

  it("renders a '-' placeholder under a hop that has no SNR, so badges stay aligned", () => {
    // 3 hashes but only 2 SNR readings → the third hop's sub-line is a placeholder
    const payload = { type: "TRACE", flags: 0, pathHashes: ["ab", "cd", "ef"], snrValues: [-5, -8] };
    render(<PayloadBreakdown payload={payload} resolvedRoute={resolvedRoute} />);
    expect(screen.getByText("-")).toBeInTheDocument();
  });
});

describe("PayloadBreakdown — GROUP_TEXT decrypted channel message", () => {
  // Backend GetPacket enrichment nests decrypted:{sender,content,sentAt} (sentAt is epoch ms).
  // See tower-server db/packets.go + internal/ingest/side_effects.go.
  // chosen so the ms reading (5:43 p.m.) and the wrong seconds reading (1:13 p.m.) differ
  const sentAt = 1_700_001_800_000; // epoch ms
  const payload = {
    type: "GROUP_TEXT",
    channelHash: "ab",
    cipherMac: "00112233",
    ciphertext: "deadbeef",
    decrypted: { sender: "Alice", content: "hello mesh", sentAt },
  };

  it("renders the decrypted sender and message body from content", () => {
    render(<PayloadBreakdown payload={payload} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("hello mesh")).toBeInTheDocument();
  });

  it("formats sentAt as epoch milliseconds, not seconds", () => {
    render(<PayloadBreakdown payload={payload} />);
    // <Timestamp> shows a relative label; hovering reveals the absolute time in the tooltip
    fireEvent.mouseEnter(screen.getByText(`${timeAgoMs(sentAt)} ago`));
    expect(screen.getByRole("tooltip").textContent).toBe(formatAbsolute(sentAt));
    // the seconds interpretation (×1000) would be a far-future date
    expect(screen.getByRole("tooltip").textContent).not.toBe(formatAbsolute(sentAt * 1000));
  });
});
