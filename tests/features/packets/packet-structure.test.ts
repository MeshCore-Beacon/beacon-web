import { describe, it, expect } from "vitest";
import { buildObservationFrame, computeFieldRanges } from "../../../src/features/packets/packet-structure";
import { PayloadType, RouteType } from "../../../src/types/enums";
import type { PacketDetail, Observation } from "../../../src/types/api";

// Minimal PacketDetail with a 1-byte header and a non-transport route, so the
// payload starts at byte offset 1 (no transport codes, and obs=null skips the path).
// parsedPayload here is a deliberately minimal stub: computeFieldRanges keys off the numeric
// header type and reads only top-level publicKey/signature plus the raw bytes, so these fixtures
// don't mirror the backend's full shape (which carries `type` and nests advert data under appData).
function makeDetail(opts: {
  payloadType: number;
  parsedPayload?: Record<string, unknown> | string;
  rawPayload: string;
}): PacketDetail {
  return {
    packetHash: "deadbeef",
    header: {
      raw: "01",
      routeType: RouteType.FLOOD,
      routeTypeName: "FLOOD",
      payloadType: opts.payloadType,
      payloadTypeName: "x",
      payloadVersion: 0,
    },
    parsedPayload: opts.parsedPayload,
    rawPayload: opts.rawPayload,
    decrypted: false,
    firstHeardAt: 0,
    lastHeardAt: 0,
    firstToLastMs: 0,
    observationCount: 0,
    observations: [],
  };
}

const rep = (byte: string, n: number) => byte.repeat(n);

function makeObs(opts: { raw: string; hashSize: number; hopCount: number; pathBytes?: string }): Observation {
  return {
    id: 1,
    observerId: "obs-1",
    iata: "YYZ",
    heardAt: 0,
    pathLength: { raw: opts.raw, hashSize: opts.hashSize, hopCount: opts.hopCount },
    pathBytes: opts.pathBytes,
    sourceBroker: "b",
    resolvedPath: [],
  };
}

function rangesFor(detail: PacketDetail) {
  const frame = buildObservationFrame(detail, null);
  return computeFieldRanges(detail, null, frame.length / 2);
}

describe("computeFieldRanges — ADVERT (lean backend shape, no `type` field)", () => {
  it("colors public key, timestamp, signature, flags, location, and name", () => {
    const publicKey = rep("aa", 32); // 32-byte key
    const rawPayload =
      publicKey + // 32B pubkey
      "01020304" + // 4B timestamp
      rep("bb", 64) + // 64B signature (omitted from the parsed payload)
      "90" + // flags 0x90 = location(0x10) + name(0x80)
      rep("cc", 8) + // 8B location
      "4869"; // "Hi" (2B)

    const ranges = rangesFor(
      makeDetail({
        payloadType: PayloadType.ADVERT,
        parsedPayload: { publicKey, name: "Hi", nodeType: "ChatNode", timestamp: 1, lat: 1, lon: 2 },
        rawPayload,
      }),
    );

    expect(ranges.publicKey).toEqual({ start: 1, end: 33 });
    expect(ranges.advertTimestamp).toEqual({ start: 33, end: 37 });
    expect(ranges.signature).toEqual({ start: 37, end: 101 });
    expect(ranges.flags).toEqual({ start: 101, end: 102 });
    expect(ranges.location).toEqual({ start: 102, end: 110 });
    expect(ranges.advertName).toEqual({ start: 110, end: 112 });
  });

  it("omits location and name when their flag bits are clear", () => {
    const publicKey = rep("aa", 32);
    const rawPayload = publicKey + "01020304" + rep("bb", 64) + "00"; // flags 0x00

    const ranges = rangesFor(
      makeDetail({
        payloadType: PayloadType.ADVERT,
        parsedPayload: { publicKey, timestamp: 1 },
        rawPayload,
      }),
    );

    expect(ranges.publicKey).toEqual({ start: 1, end: 33 });
    expect(ranges.signature).toEqual({ start: 37, end: 101 });
    expect(ranges.flags).toEqual({ start: 101, end: 102 });
    expect(ranges.location).toBeUndefined();
    expect(ranges.advertName).toBeUndefined();
  });
});

describe("buildObservationFrame — path-length byte alignment", () => {
  it("reserves a full path-length byte even when pathLength.raw is empty, so the payload stays aligned", () => {
    // computeFieldRanges always reserves one byte for the path length when there's an observation,
    // so the reconstructed frame must too — otherwise every field after the header shifts a byte.
    const obs = makeObs({ raw: "", hashSize: 0, hopCount: 0 });
    const detail = makeDetail({ payloadType: PayloadType.ANON_REQ, rawPayload: "aabbccdd" });

    const frame = buildObservationFrame(detail, obs);
    expect(frame).toBe("01" + "00" + "aabbccdd"); // header + path-length(00) + payload, nothing dropped

    const ranges = computeFieldRanges(detail, obs, frame.length / 2);
    expect(ranges.pathLength).toEqual({ start: 1, end: 2 });
    expect(ranges.payload).toEqual({ start: 2, end: 6 }); // payload begins right after the path-length byte
  });

  it("pads a single-nibble path-length byte to two hex chars", () => {
    const obs = makeObs({ raw: "e", hashSize: 0, hopCount: 0 });
    const detail = makeDetail({ payloadType: PayloadType.ANON_REQ, rawPayload: "aabbccdd" });

    expect(buildObservationFrame(detail, obs)).toBe("01" + "0e" + "aabbccdd");
  });
});

describe("computeFieldRanges — ANON_REQ (lean backend shape, no `type` field)", () => {
  it("colors destination, ephemeral key, MAC, and ciphertext", () => {
    const ephemeralPubKey = rep("dd", 32);
    const rawPayload =
      "2a" + // 1B destination (42)
      ephemeralPubKey + // 32B ephemeral pubkey
      "eeee" + // 2B cipher MAC
      rep("ff", 10); // 10B ciphertext

    const ranges = rangesFor(
      makeDetail({
        payloadType: PayloadType.ANON_REQ,
        parsedPayload: { destination: 42, ephemeralPubKey },
        rawPayload,
      }),
    );

    expect(ranges.destinationHash).toEqual({ start: 1, end: 2 });
    expect(ranges.senderPublicKey).toEqual({ start: 2, end: 34 });
    expect(ranges.cipherMac).toEqual({ start: 34, end: 36 });
    expect(ranges.ciphertext).toEqual({ start: 36, end: 46 });
  });
});

describe("transport frames", () => {
  it("puts the transport codes back after the header as little-endian bytes", () => {
    const d = makeDetail({ payloadType: PayloadType.GROUP_TEXT, rawPayload: "3b5c22" });
    d.header = { ...d.header, raw: "14", routeType: RouteType.TRANSPORT_FLOOD, routeTypeName: "TRANSPORT_FLOOD" };
    d.transportCodes = { regionCode: 49240, subRegionCode: 0 };
    const obs = makeObs({ raw: "81", hashSize: 3, hopCount: 1, pathBytes: "bd6089" });
    const frame = buildObservationFrame(d, obs);
    expect(frame).toBe("14" + "58c00000" + "81" + "bd6089" + "3b5c22");
    const ranges = computeFieldRanges(d, obs, frame.length / 2);
    expect(frame.slice(ranges.pathLength!.start * 2, ranges.pathLength!.end * 2)).toBe("81");
  });
  // older rows can carry a transport route without stored codes; the frame has no bytes for them
  it("keeps the field ranges aligned when a transport route has no codes", () => {
    const d = makeDetail({ payloadType: PayloadType.GROUP_TEXT, rawPayload: "3b5c22" });
    d.header = { ...d.header, raw: "14", routeType: RouteType.TRANSPORT_FLOOD, routeTypeName: "TRANSPORT_FLOOD" };
    const obs = makeObs({ raw: "81", hashSize: 3, hopCount: 1, pathBytes: "bd6089" });
    const frame = buildObservationFrame(d, obs);
    const ranges = computeFieldRanges(d, obs, frame.length / 2);
    expect(ranges.transport).toBeUndefined();
    expect(frame.slice(ranges.pathLength!.start * 2, ranges.pathLength!.end * 2)).toBe("81");
    expect(frame.slice(ranges.payload!.start * 2, ranges.payload!.end * 2)).toBe("3b5c22");
  });
});

it("uses exact trace SNR bytes in the wire frame instead of decoded requested hashes", () => {
 const d = makeDetail({payloadType:PayloadType.TRACE,rawPayload:"010203040000000001aabbccdd"});
 d.header.raw="26";
 const o = {...makeObs({raw:"01",hashSize:2,hopCount:2,pathBytes:"aabbccdd"}),wirePathBytes:"fc"};
 const frame=buildObservationFrame(d,o);
 expect(frame).toBe("2601fc010203040000000001aabbccdd");
 expect(computeFieldRanges(d,o,frame.length/2).pathData).toEqual({start:2,end:3});
 expect(computeFieldRanges(d,o,frame.length/2).payload?.start).toBe(3);
});
