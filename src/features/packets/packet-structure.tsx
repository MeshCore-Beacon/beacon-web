/* eslint-disable react-refresh/only-export-components */
import { Fragment } from "react";
import type { PacketDetail, Observation } from "../../types/api";
import { RouteType } from "../../types/enums";
import { HopBadge } from "../../components/HopBadge";
import { formatTimeOnly, formatSnr, snrLevel, formatPropagation, SIGNAL_LEVEL_CLASSES } from "../../lib/formatters";

// maps packet bytes to named field ranges for hex coloring

export type FieldId = "header" | "transport" | "pathLength" | "pathData" | "payload" | "channelHash" | "cipherMac" | "ciphertext" | "publicKey" | "signature" | "advertTimestamp" | "flags" | "location" | "advertName" | "destinationHash" | "sourceHash" | "senderPublicKey" | "checksum";

export interface ByteRange {
  start: number;
  end: number;
}

export function computeFieldRanges(
  detail: PacketDetail,
  obs: Observation | null,
  totalBytes: number,
): Partial<Record<FieldId, ByteRange>> {
  const ranges: Partial<Record<FieldId, ByteRange>> = {};

  ranges.header = { start: 0, end: 1 };
  let offset = 1;

  const hasTransport =
    detail.routeType === RouteType.TRANSPORT_FLOOD ||
    detail.routeType === RouteType.TRANSPORT_DIRECT;
  if (hasTransport) {
    ranges.transport = { start: offset, end: offset + 4 };
    offset += 4;
  }

  if (obs) {
    ranges.pathLength = { start: offset, end: offset + 1 };
    offset += 1;

    const pathByteCount = obs.hashSize * obs.hopCount;
    if (pathByteCount > 0) {
      ranges.pathData = { start: offset, end: offset + pathByteCount };
    }
    offset += pathByteCount;
  }

  if (offset < totalBytes) {
    ranges.payload = { start: offset, end: totalBytes };

    const pp = detail.parsedPayload;
    if (pp && typeof pp === "object") {
      if (pp.type === "ADVERT" && typeof pp.publicKey === "string") {
        let sub = offset;
        const pkLen = (pp.publicKey as string).length / 2;
        ranges.publicKey = { start: sub, end: sub + pkLen };
        sub += pkLen;

        ranges.advertTimestamp = { start: sub, end: sub + 4 };
        sub += 4;

        if (typeof pp.signature === "string") {
          const sigLen = (pp.signature as string).length / 2;
          ranges.signature = { start: sub, end: sub + sigLen };
          sub += sigLen;
        }

        if (sub < totalBytes) {
          ranges.flags = { start: sub, end: sub + 1 };
          sub += 1;
        }

        if (pp.hasLocation && sub + 8 <= totalBytes) {
          ranges.location = { start: sub, end: sub + 8 };
          sub += 8;
        }
        if (pp.hasFeature1) sub += 2;
        if (pp.hasFeature2) sub += 2;
        if (pp.hasName && sub < totalBytes) {
          ranges.advertName = { start: sub, end: totalBytes };
        }
      } else {
        let hexFields: FieldId[];
        if (pp.type === "ACK" && pp.checksum) {
          hexFields = ["checksum"];
        } else if (pp.senderPublicKey) {
          hexFields = ["destinationHash", "senderPublicKey", "cipherMac", "ciphertext"];
        } else if (pp.destinationHash || pp.sourceHash) {
          hexFields = ["destinationHash", "sourceHash", "cipherMac", "ciphertext"];
        } else if (pp.channelHash) {
          hexFields = ["channelHash", "cipherMac", "ciphertext"];
        } else {
          hexFields = [];
        }
        let subOffset = offset;
        for (const key of hexFields) {
          const val = pp[key];
          if (typeof val !== "string" || !/^[0-9a-fA-F]+$/.test(val)) break;
          const byteLen = val.length / 2;
          ranges[key] = { start: subOffset, end: subOffset + byteLen };
          subOffset += byteLen;
        }
      }
    }
  }

  return ranges;
}

function formatBinary(byte: number): string {
  return byte.toString(2).padStart(8, "0");
}

// drawer UI: hex dump, bit breakdowns, field accents

export const FIELD_COLORS: Record<FieldId, { hex: string; accent: string }> = {
  header:      { hex: "text-secondary",    accent: "border-l-secondary/50" },
  transport:   { hex: "text-warn",         accent: "border-l-warn/50" },
  pathLength:  { hex: "text-primary",      accent: "border-l-primary/50" },
  pathData:    { hex: "text-green",        accent: "border-l-green/50" },
  payload:     { hex: "text-text-muted",   accent: "border-l-text-muted/50" },
  channelHash: { hex: "text-primary", accent: "border-l-primary/50" },
  cipherMac: { hex: "text-warn", accent: "border-l-warn/50" },
  ciphertext: { hex: "text-danger", accent: "border-l-danger/50" },
  publicKey: { hex: "text-green", accent: "border-l-green/50" },
  signature: { hex: "text-secondary", accent: "border-l-secondary/50" },
  advertTimestamp: { hex: "text-primary", accent: "border-l-primary/50" },
  flags: { hex: "text-warn", accent: "border-l-warn/50" },
  location: { hex: "text-green", accent: "border-l-green/50" },
  advertName: { hex: "text-text-normal", accent: "border-l-text-muted/50" },
  destinationHash: { hex: "text-primary", accent: "border-l-primary/50" },
  sourceHash: { hex: "text-secondary", accent: "border-l-secondary/50" },
  senderPublicKey: { hex: "text-green", accent: "border-l-green/50" },
  checksum: { hex: "text-warn", accent: "border-l-warn/50" },
};

export function DrawerSection({ title, children, first }: { title: string; children: React.ReactNode; first?: boolean }) {
  return (
    <div className={`px-3 py-2.5 ${first ? "" : "border-t border-border-subtle"}`}>
      <div className="text-xs font-mono font-medium text-text-bright uppercase tracking-wider mb-1.5">{title}</div>
      {children}
    </div>
  );
}

export function ColoredHexDump({
  data,
  ranges,
}: {
  data: string;
  ranges: Partial<Record<FieldId, ByteRange>>;
}) {
  const bytes = data.match(/.{1,2}/g) ?? [];

  const byteFieldMap = new Map<number, FieldId>();
  for (const [field, range] of Object.entries(ranges) as [FieldId, ByteRange][]) {
    for (let i = range.start; i < range.end; i++) {
      byteFieldMap.set(i, field);
    }
  }

  return (
    <pre className="text-[13px] font-mono leading-relaxed overflow-x-auto whitespace-pre">
      {bytes.map((byte, i) => {
        const field = byteFieldMap.get(i) ?? null;
        const colorClass = field ? FIELD_COLORS[field].hex : "text-text-muted";
        const isLineStart = i % 16 === 0 && i > 0;

        return (
          <Fragment key={i}>
            {isLineStart && "\n"}
            {i % 16 !== 0 && " "}
            <span className={colorClass}>{byte.toUpperCase()}</span>
          </Fragment>
        );
      })}
    </pre>
  );
}

export function HeaderBitBreakdown({ headerHex }: { headerHex: string }) {
  const value = parseInt(headerHex, 16);
  if (Number.isNaN(value)) return null;

  const bits = formatBinary(value);
  const ver = bits.slice(0, 2);
  const typ = bits.slice(2, 6);
  const route = bits.slice(6, 8);

  return (
    <div className="mt-1.5 font-mono text-xs bg-bg-base border border-primary/20 rounded px-2 py-1.5">
      <div className="flex items-start gap-1">
        <span className="text-text-dim leading-none pt-px">0x{headerHex.toUpperCase()} = [</span>
        <span className="flex flex-col items-center leading-none">
          <span className="text-secondary">{ver}</span>
          <span className="text-secondary text-[11px] mt-0.5">ver</span>
        </span>
        <span className="text-text-dim leading-none pt-px">|</span>
        <span className="flex flex-col items-center leading-none">
          <span className="text-warn">{typ}</span>
          <span className="text-warn text-[11px] mt-0.5">type</span>
        </span>
        <span className="text-text-dim leading-none pt-px">|</span>
        <span className="flex flex-col items-center leading-none">
          <span className="text-green">{route}</span>
          <span className="text-green text-[11px] mt-0.5">route</span>
        </span>
        <span className="text-text-dim leading-none pt-px">]</span>
      </div>
    </div>
  );
}

export function PathLengthBitBreakdown({ pathLengthByte }: { pathLengthByte: number }) {
  const bits = formatBinary(pathLengthByte);
  const hashBits = bits.slice(0, 2);
  const hopBits = bits.slice(2, 8);

  const hashSize = (pathLengthByte >> 6) & 0x03;
  const hopCount = pathLengthByte & 0x3f;

  return (
    <div className="mt-1.5 font-mono text-xs bg-bg-base border border-primary/20 rounded px-2 py-1.5">
      <div className="flex items-start gap-1">
        <span className="text-text-dim leading-none pt-px">0x{pathLengthByte.toString(16).toUpperCase().padStart(2, "0")} = [</span>
        <span className="flex flex-col items-center leading-none">
          <span className="text-secondary">{hashBits}</span>
          <span className="text-secondary text-[11px] mt-0.5">hash={hashSize + 1}B</span>
        </span>
        <span className="text-text-dim leading-none pt-px">|</span>
        <span className="flex flex-col items-center leading-none">
          <span className="text-green">{hopBits}</span>
          <span className="text-green text-[11px] mt-0.5">hops={hopCount}</span>
        </span>
        <span className="text-text-dim leading-none pt-px">]</span>
      </div>
    </div>
  );
}

export function AdvertFlagsBitBreakdown({ flagsByte }: { flagsByte: number }) {
  const bits = formatBinary(flagsByte);
  const roleBits = bits.slice(4, 8);
  const loc = bits[3];
  const f1 = bits[2];
  const f2 = bits[1];
  const nm = bits[0];

  const role = flagsByte & 0x0f;
  const DEVICE_ROLE_NAMES: Record<number, string> = {
    0x01: "ChatNode",
    0x02: "Repeater",
    0x03: "RoomServer",
    0x04: "Sensor",
  };
  const roleName = DEVICE_ROLE_NAMES[role] ?? `0x${role.toString(16)}`;

  return (
    <div className="mt-1.5 font-mono text-xs bg-bg-base border border-primary/20 rounded px-2 py-1.5">
      <div className="flex items-start gap-1">
        <span className="text-text-dim leading-none pt-px">0x{flagsByte.toString(16).toUpperCase().padStart(2, "0")} = [</span>
        <span className="flex flex-col items-center leading-none">
          <span className="text-warn">{roleBits}</span>
          <span className="text-warn text-[11px] mt-0.5">{roleName}</span>
        </span>
        <span className="text-text-dim leading-none pt-px">|</span>
        <span className="flex flex-col items-center leading-none">
          <span className={loc === "1" ? "text-green" : "text-text-dim"}>{loc}</span>
          <span className={`text-[11px] mt-0.5 ${loc === "1" ? "text-green" : "text-text-dim"}`}>loc</span>
        </span>
        <span className="text-text-dim leading-none pt-px">|</span>
        <span className="flex flex-col items-center leading-none">
          <span className={f1 === "1" ? "text-green" : "text-text-dim"}>{f1}</span>
          <span className={`text-[11px] mt-0.5 ${f1 === "1" ? "text-green" : "text-text-dim"}`}>f1</span>
        </span>
        <span className="text-text-dim leading-none pt-px">|</span>
        <span className="flex flex-col items-center leading-none">
          <span className={f2 === "1" ? "text-green" : "text-text-dim"}>{f2}</span>
          <span className={`text-[11px] mt-0.5 ${f2 === "1" ? "text-green" : "text-text-dim"}`}>f2</span>
        </span>
        <span className="text-text-dim leading-none pt-px">|</span>
        <span className="flex flex-col items-center leading-none">
          <span className={nm === "1" ? "text-green" : "text-text-dim"}>{nm}</span>
          <span className={`text-[11px] mt-0.5 ${nm === "1" ? "text-green" : "text-text-dim"}`}>name</span>
        </span>
        <span className="text-text-dim leading-none pt-px">]</span>
      </div>
    </div>
  );
}

export function ColorAccentField({
  field,
  children,
  className,
}: {
  field: FieldId;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`pl-2 -mx-1 py-0.5 -my-0.5 border-l-2 ${FIELD_COLORS[field].accent} ${className ?? ""}`}>
      {children}
    </div>
  );
}

export function ObservationDetail({ observation }: { observation: Observation }) {
  const level = snrLevel(observation.snr);
  const sigClass = level ? SIGNAL_LEVEL_CLASSES[level] : "text-text-normal";

  return (
    <div className="flex flex-col gap-1.5 font-mono text-[13px]">
      <div className="flex items-center gap-2">
        <span className="text-text-normal font-semibold">{observation.observerName}</span>
        <span className="text-primary font-semibold text-[13px] bg-primary/6 px-1.5 py-px rounded-sm">
          {observation.iata}
        </span>
        <span className="text-text-dim ml-auto text-[13px]">
          {formatTimeOnly(observation.heardAt)}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[13px]">
        <span><span className="text-text-dim">SNR </span><span className={sigClass}>{formatSnr(observation.snr)}</span></span>
        <span><span className="text-text-dim">RSSI </span><span className={sigClass}>{observation.rssi ?? "—"}</span></span>
        <span><span className="text-text-dim">Prop </span><span className="text-text-normal">{formatPropagation(observation.propagationTimeMs)}</span></span>
        <span><span className="text-text-dim">Hops </span><span className="text-text-normal">{observation.hopCount}</span></span>
      </div>

      {observation.radio && (
        <div className="flex items-center gap-1.5 text-[13px] text-text-muted">
          <span className="text-text-dim text-xs font-medium uppercase tracking-wider mr-0.5">Radio</span>
          <span>{observation.radio.freqMhz} MHz</span>
          <span className="text-[6px] text-border" aria-hidden>·</span>
          <span>SF{observation.radio.spreadFactor}</span>
          <span className="text-[6px] text-border" aria-hidden>·</span>
          <span>{observation.radio.bandwidthKhz} kHz</span>
          <span className="text-[6px] text-border" aria-hidden>·</span>
          <span>CR 4/{observation.radio.codingRate}</span>
        </div>
      )}

      {observation.resolvedPath.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-[13px] pt-1 border-t border-border-subtle">
          <span className="text-text-dim text-xs font-medium uppercase tracking-wider mr-1">Path</span>
          {observation.resolvedPath.map((hop, i) => (
            <span key={i} className="contents">
              {i > 0 && <span className="text-text-dim text-xs" aria-hidden>→</span>}
              <HopBadge hop={hop} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
