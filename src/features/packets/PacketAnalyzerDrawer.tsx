import { useState, useCallback } from "react";
import type { PacketDetail } from "../../types/api";
import { PayloadType, PAYLOAD_TYPE_NAMES, ROUTE_TYPE_NAMES, type PayloadTypeValue, type RouteTypeValue } from "../../types/enums";
import { Badge } from "../../components/Badge";
import { payloadTypeVariant } from "../../components/badge-utils";
import { formatHex, formatTimestamp } from "../../lib/formatters";
import { computeFieldRanges, ColoredHexDump, HeaderBitBreakdown, PathLengthBitBreakdown, ColorAccentField, DrawerSection, ObservationDetail } from "./packet-structure";
import { PayloadBreakdown } from "./payload-renderers";

function decodePayloadHex(encoded: string): string | null {
  try {
    const inner = JSON.parse(atob(encoded));
    if (typeof inner !== "string") return null;
    const raw = atob(inner);
    return Array.from(raw, (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

function CopyLinkButton({ packetHash }: { packetHash: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "Packets");
    url.searchParams.set("hash", packetHash);
    navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [packetHash]);

  return (
    <button
      type="button"
      className="text-text-dim hover:text-text-normal cursor-pointer transition-colors"
      onClick={handleCopy}
      aria-label="Copy packet link"
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M6.5 10.5L5.5 11.5C4.4 12.6 2.6 12.6 1.5 11.5V11.5C0.4 10.4 0.4 8.6 1.5 7.5L4.5 4.5C5.6 3.4 7.4 3.4 8.5 4.5V4.5C9.1 5.1 9.3 5.9 9.2 6.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <path d="M9.5 5.5L10.5 4.5C11.6 3.4 13.4 3.4 14.5 4.5V4.5C15.6 5.6 15.6 7.4 14.5 8.5L11.5 11.5C10.4 12.6 8.6 12.6 7.5 11.5V11.5C6.9 10.9 6.7 10.1 6.8 9.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

interface PacketAnalyzerDrawerProps {
  detail: PacketDetail | undefined;
  selectedObservationId: number | null;
  open: boolean;
  onToggle: () => void;
}

// collapsible side panel showing packet structure and payload breakdown

export function PacketAnalyzerDrawer({ detail, selectedObservationId, open, onToggle }: PacketAnalyzerDrawerProps) {
  const selectedObs = detail?.observations.find((o) => o.id === selectedObservationId)
    ?? detail?.observations[0]
    ?? null;

  const rawHex = selectedObs?.rawPacket ?? detail?.rawPayload ?? "";
  const hasStructure = !!selectedObs?.rawPacket;
  const totalBytes = rawHex.length / 2;

  const fieldRanges = detail && hasStructure
    ? computeFieldRanges(detail, selectedObs, totalBytes)
    : {};

  const headerHex = hasStructure ? rawHex.slice(0, 2) : detail?.headerByte ?? "";

  if (!open) {
    return (
      <div className="shrink-0 w-8 border-l border-border bg-bg-surface flex flex-col items-center">
        <button
          type="button"
          className="mt-2 text-text-dim hover:text-text-normal cursor-pointer transition-colors"
          onClick={onToggle}
          aria-label="Expand analyzer"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {detail && (
          <div className="mt-3 writing-vertical text-xs font-mono font-medium text-text-dim tracking-wider">
            {formatHex(detail.packetHash)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="shrink-0 w-[400px] border-l border-border bg-bg-surface flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle shrink-0">
        <span className="text-[13px] font-mono font-medium text-text-dim uppercase tracking-wider">Packet Analyzer</span>
        <div className="flex items-center gap-1.5">
          {detail && <CopyLinkButton packetHash={detail.packetHash} />}
          <button
            type="button"
            className="text-text-dim hover:text-text-normal cursor-pointer transition-colors"
            onClick={onToggle}
            aria-label="Collapse analyzer"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {!detail ? (
          <div className="flex flex-col items-center justify-center h-full gap-2.5 text-text-dim">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-border">
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.2" />
              <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth="1.2" />
              <line x1="8" y1="9" x2="8" y2="19" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            <span className="text-[13px] font-mono">Select a packet to analyze</span>
          </div>
        ) : (
          <>
            <DrawerSection title="Summary" first>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-xs font-semibold text-primary tracking-wider">
                  {formatHex(detail.packetHash)}
                </span>
                <Badge variant={payloadTypeVariant(detail.payloadType)}>
                  {PAYLOAD_TYPE_NAMES[detail.payloadType as PayloadTypeValue] ?? "Unknown"}
                </Badge>
                <span className="ml-auto font-mono text-[13px] text-primary font-semibold bg-primary/6 px-1.5 rounded-sm">
                  ×{detail.observations.length}
                </span>
              </div>
              {detail.summary && (
                <div className="text-[13px] text-text-normal font-mono mb-1.5 whitespace-nowrap overflow-hidden text-ellipsis">
                  {detail.summary}
                </div>
              )}
              <div className="flex items-center gap-3 text-[13px] font-mono">
                <span><span className="text-text-dim">First </span><span className="text-text-normal">{formatTimestamp(detail.firstHeardAt)}</span></span>
                <span className="text-[6px] text-border" aria-hidden>·</span>
                <span><span className="text-text-dim">Last </span><span className="text-text-normal">{formatTimestamp(detail.lastHeardAt)}</span></span>
              </div>
            </DrawerSection>

            {selectedObs && (
              <DrawerSection title="Observation">
                <ObservationDetail observation={selectedObs} />
              </DrawerSection>
            )}

            {rawHex && (
              <DrawerSection title="Raw Packet">
                <div className="bg-bg-base border border-border rounded p-2 max-h-40 overflow-y-auto">
                  {hasStructure ? (
                    <ColoredHexDump data={rawHex} ranges={fieldRanges} />
                  ) : (
                    <pre className="text-[13px] font-mono text-text-muted leading-relaxed overflow-x-auto whitespace-pre">
                      {(rawHex.match(/.{1,2}/g) ?? []).reduce((acc, b, i) => {
                        const sep = i > 0 && i % 16 === 0 ? "\n" : i > 0 ? " " : "";
                        return acc + sep + b.toUpperCase();
                      }, "")}
                    </pre>
                  )}
                </div>
              </DrawerSection>
            )}

            <DrawerSection title="Packet Structure">
              <div className="flex flex-col gap-2.5 font-mono text-[13px]">
                {/* Header byte */}
                <ColorAccentField field="header">
                  <div className="text-text-dim text-xs font-medium uppercase tracking-wider mb-1">Header Byte</div>
                  <div className="flex gap-x-4">
                    <span><span className="text-text-dim">Ver </span><span className="text-text-normal">{detail.payloadVersion}</span></span>
                    <span><span className="text-text-dim">Type </span><span className="text-text-normal">{PAYLOAD_TYPE_NAMES[detail.payloadType as PayloadTypeValue] ?? "?"} ({detail.payloadType})</span></span>
                    <span><span className="text-text-dim">Route </span><span className="text-text-normal">{ROUTE_TYPE_NAMES[detail.routeType as RouteTypeValue] ?? "?"} ({detail.routeType})</span></span>
                  </div>
                  {headerHex && (
                    <HeaderBitBreakdown headerHex={headerHex} />
                  )}
                </ColorAccentField>

                {/* Transport codes */}
                {detail.transportCodes && (
                  <ColorAccentField field="transport">
                    <span className="text-text-dim">Transport </span>
                    <span className="text-text-normal">{detail.transportCodes.regionCode} / {detail.transportCodes.subRegionCode}</span>
                  </ColorAccentField>
                )}

                {/* Path length */}
                {selectedObs && (
                  <ColorAccentField field="pathLength">
                    <div className="text-text-dim text-xs font-medium uppercase tracking-wider mb-1">Path Length</div>
                    <div className="flex gap-x-4">
                      <span><span className="text-text-dim">Hash Size </span><span className="text-text-normal">{selectedObs.hashSize}B</span></span>
                      <span><span className="text-text-dim">Hops </span><span className="text-text-normal">{selectedObs.hopCount}</span></span>
                    </div>
                    <PathLengthBitBreakdown pathLengthByte={selectedObs.pathLengthByte} />
                  </ColorAccentField>
                )}

                {/* Path data */}
                {selectedObs?.pathBytes && (
                  <ColorAccentField field="pathData">
                    <div className="text-text-dim text-xs font-medium uppercase tracking-wider mb-1">Path Data</div>
                    <div className="flex flex-wrap items-center gap-1 text-[13px]">
                      {(() => {
                        const chars = selectedObs.hashSize * 2;
                        const hops = selectedObs.pathBytes.match(new RegExp(`.{1,${chars}}`, "g")) ?? [];
                        return hops.map((hop, i) => (
                          <span key={i} className="contents">
                            {i > 0 && <span className="text-text-dim" aria-hidden>→</span>}
                            <span className="px-1.5 py-px rounded-sm bg-primary/6 text-primary font-semibold">{hop.toUpperCase()}</span>
                          </span>
                        ));
                      })()}
                    </div>
                  </ColorAccentField>
                )}

                {detail.originPubkey && detail.payloadType !== PayloadType.ADVERT && (
                  <ColorAccentField field="payload">
                    <span className="text-text-dim text-xs font-medium uppercase tracking-wider">Origin Pubkey</span>
                    <div className="text-text-normal break-all text-[13px]">{detail.originPubkey}</div>
                  </ColorAccentField>
                )}
              </div>
            </DrawerSection>

            {detail.parsedPayload && typeof detail.parsedPayload === "object" && Object.keys(detail.parsedPayload).length > 0 && (
              <DrawerSection title="Payload Breakdown">
                <div className="font-mono text-[13px]">
                  <PayloadBreakdown payload={detail.parsedPayload} />
                </div>
              </DrawerSection>
            )}

            {detail.parsedPayload && typeof detail.parsedPayload === "string" && (() => {
              const hex = decodePayloadHex(detail.parsedPayload);
              if (!hex) return null;
              return (
                <DrawerSection title="Payload Data">
                  <div className="bg-bg-base border border-border rounded p-2 max-h-40 overflow-y-auto">
                    <pre className="text-[13px] font-mono text-text-muted leading-relaxed overflow-x-auto whitespace-pre">
                      {(hex.match(/.{1,2}/g) ?? []).reduce((acc, b, i) => {
                        const sep = i > 0 && i % 16 === 0 ? "\n" : i > 0 ? " " : "";
                        return acc + sep + b.toUpperCase();
                      }, "")}
                    </pre>
                  </div>
                  <div className="text-[11px] text-text-dim mt-1">{hex.length / 2} bytes</div>
                </DrawerSection>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
