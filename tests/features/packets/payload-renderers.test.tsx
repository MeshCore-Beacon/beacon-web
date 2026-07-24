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

describe("PayloadBreakdown — resolved source/destination endpoints", () => {
  const envelope = {
    type: "TEXT_MESSAGE",
    sourceHash: "aa",
    destinationHash: "bb",
    cipherMac: "0011",
    ciphertext: "deadbeef",
    decrypted: null,
  };
  const resolvedSource: ResolvedHop = { confidence: "high", nodes: [{ id: "s1", publicKey: "aa", name: "Alice" }] };
  const resolvedDestination: ResolvedHop = { confidence: "high", nodes: [{ id: "d1", publicKey: "bb", name: "Bob" }] };

  it("makes the resolved From/To hashes clickable node blocks", () => {
    const onViewNode = vi.fn();
    render(<PayloadBreakdown payload={envelope} resolvedSource={resolvedSource} resolvedDestination={resolvedDestination} onViewNode={onViewNode} />);
    fireEvent.click(screen.getByRole("button", { name: "BB" })); // To → destination node
    expect(onViewNode).toHaveBeenCalledWith("d1");
    fireEvent.click(screen.getByRole("button", { name: "AA" })); // From → source node
    expect(onViewNode).toHaveBeenCalledWith("s1");
  });

  it("falls back to a plain hash badge when the endpoint did not resolve", () => {
    render(<PayloadBreakdown payload={envelope} />);
    expect(screen.queryByRole("button", { name: "BB" })).not.toBeInTheDocument();
    expect(screen.getByText("BB")).toBeInTheDocument();
  });

  it("resolves an ANON_REQUEST destination hash to a node block", () => {
    const onViewNode = vi.fn();
    const anon = { type: "ANON_REQUEST", destination: 0xbb, ephemeralPubKey: "cc" };
    render(<PayloadBreakdown payload={anon} resolvedDestination={resolvedDestination} onViewNode={onViewNode} />);
    fireEvent.click(screen.getByRole("button", { name: "0xBB" }));
    expect(onViewNode).toHaveBeenCalledWith("d1");
  });
});

describe("PayloadBreakdown — DISCOVER_REQ", () => {
  // Backend emits DISCOVER as a top-level parsedPayload.type (not nested under CONTROL).
  // See beacon-server internal/ingest/packet.go parsedDiscoverReq.
  const reqPayload = {
    type: "DISCOVER_REQ",
    raw: "0b00",
    prefixOnly: true,
    typeFilter: 0x06, // bits 1 and 2 → ADV_TYPE 1 (ChatNode) + 2 (Repeater)
    tag: "0a0b0c0d",
    since: 1_700_000_000, // epoch seconds
  };

  it("decodes the typeFilter bitfield into device-role names", () => {
    render(<PayloadBreakdown payload={reqPayload} />);
    expect(screen.getByText("ChatNode")).toBeInTheDocument();
    expect(screen.getByText("Repeater")).toBeInTheDocument();
  });

  it("renders the tag as a 0x-prefixed hex value", () => {
    render(<PayloadBreakdown payload={reqPayload} />);
    expect(screen.getByText("0x0A0B0C0D")).toBeInTheDocument();
  });
});

describe("PayloadBreakdown — DISCOVER_RESP", () => {
  // See beacon-server internal/ingest/packet.go parsedDiscoverResp.
  const respPayload = {
    type: "DISCOVER_RESP",
    raw: "0b01",
    nodeType: 2,
    nodeTypeName: "repeater",
    requestSnr: -4.5, // responder's node-to-node reading of the request, not observer reception
    tag: "0a0b0c0d",
    pubKey: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    pubKeyPrefixOnly: false,
  };

  it("renders the responder node type and its request SNR", () => {
    render(<PayloadBreakdown payload={respPayload} />);
    expect(screen.getByText("repeater")).toBeInTheDocument();
    expect(screen.getByText(/-4\.50/)).toBeInTheDocument();
  });

  it("labels a full public key vs. an 8-byte prefix", () => {
    const { unmount } = render(<PayloadBreakdown payload={respPayload} />);
    expect(screen.getByText(/Public Key/)).toBeInTheDocument();
    unmount();
    render(<PayloadBreakdown payload={{ ...respPayload, pubKey: "abcdef0011223344", pubKeyPrefixOnly: true }} />);
    expect(screen.getByText(/Key Prefix/)).toBeInTheDocument();
  });
});

describe("PayloadBreakdown — GROUP_TEXT decrypted channel message", () => {
  // Backend GetPacket enrichment nests decrypted:{sender,content,sentAt} (sentAt is epoch ms).
  // See beacon-server db/packets.go + internal/ingest/side_effects.go.
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
