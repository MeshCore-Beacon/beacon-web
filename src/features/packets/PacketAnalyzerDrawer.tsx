import { useState, useCallback } from "react";
import type { PacketDetail } from "../../types/api";
import { PayloadType, PAYLOAD_TYPE_NAMES, ROUTE_TYPE_NAMES, type PayloadTypeValue, type RouteTypeValue } from "../../types/enums";
import { Badge } from "../../components/Badge";
import { Tooltip } from "../../components/Tooltip";
import { VARIANT_CLASSES, payloadTypeVariant } from "../../components/badge-utils";
import { ScopeTag } from "../../components/ScopeTag";
import { formatHex, formatPropagation } from "../../lib/formatters";
import { Timestamp } from "../../components/Timestamp";
import { buildObservationFrame, computeFieldRanges, ColoredHexDump, HeaderBitBreakdown, PathLengthBitBreakdown, ColorAccentField, DrawerSection, ObservationDetail } from "./packet-structure";
import { PayloadBreakdown } from "./payload-renderers";
import { ObservationCard } from "./ObservationCard";
import { PathData } from "./PathData";

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
      className={`inline-flex items-center font-mono text-[11px] font-semibold px-2 py-0.5 rounded-sm border tracking-wider uppercase cursor-pointer transition-colors ${copied ? VARIANT_CLASSES.live : VARIANT_CLASSES.text}`}
      onClick={handleCopy}
      aria-label="Copy packet link"
    >
      {copied ? "Copied" : "Copy Link"}
    </button>
  );
}

interface PacketAnalyzerDrawerProps {
  detail: PacketDetail | undefined;
  selectedObservationId: number | null;
  open: boolean;
  onToggle: () => void;
  onSelectObservation?: (id: number) => void;
  onViewNode?: (nodeId: string) => void;
  loading?: boolean;
  // false when embedded in a modal overlay: the header chevron becomes a Close (×) instead of collapse.
  collapsible?: boolean;
}

// collapsible side panel showing packet structure and payload breakdown

export function PacketAnalyzerDrawer({ detail, selectedObservationId, open, onToggle, onSelectObservation, onViewNode, loading, collapsible = true }: PacketAnalyzerDrawerProps) {
  const selectedObs = detail?.observations.find((o) => o.id === selectedObservationId)
    ?? detail?.observations[0]
    ?? null;

  const rawHex = detail ? buildObservationFrame(detail, selectedObs) : "";
  const totalBytes = rawHex.length / 2;

  const fieldRanges = detail
    ? computeFieldRanges(detail, selectedObs, totalBytes)
    : {};

  const headerHex = rawHex.slice(0, 2);

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
            aria-label={collapsible ? "Collapse analyzer" : "Close analyzer"}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d={collapsible ? "M6 4L10 8L6 12" : "M4 4L12 12M12 4L4 12"}
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
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
            <span className="text-[13px] font-mono">{loading ? "Loading…" : "Select a packet to analyze"}</span>
          </div>
        ) : (
          <>
            <DrawerSection title="Summary" first>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-xs font-semibold text-primary tracking-wider">
                  {formatHex(detail.packetHash)}
                </span>
                <Badge variant={payloadTypeVariant(detail.header.payloadType)}>
                  {PAYLOAD_TYPE_NAMES[detail.header.payloadType as PayloadTypeValue] ?? "Unknown"}
                </Badge>
                {detail.scope && <ScopeTag>{detail.scope}</ScopeTag>}
                <Tooltip
                  label={`Heard by ${detail.observations.length} observer${detail.observations.length === 1 ? "" : "s"}`}
                  className="ml-auto"
                >
                  <span
                    className="font-mono text-[13px] text-primary font-semibold bg-primary/6 px-1.5 rounded-sm"
                    aria-label={`Heard by ${detail.observations.length} observer${detail.observations.length === 1 ? "" : "s"}`}
                  >
                    ×{detail.observations.length}
                  </span>
                </Tooltip>
              </div>
              <div className="flex items-center gap-3 text-[13px] font-mono">
                <span><span className="text-text-dim">First </span><Timestamp value={detail.firstHeardAt} className="text-text-normal" /></span>
                <span className="text-[6px] text-border" aria-hidden>·</span>
                <span><span className="text-text-dim">Last </span><Timestamp value={detail.lastHeardAt} className="text-text-normal" /></span>
                <span className="text-[6px] text-border" aria-hidden>·</span>
                <span><span className="text-text-dim">Propagation </span><span className="text-text-normal">{formatPropagation(detail.firstToLastMs)}</span></span>
              </div>
            </DrawerSection>

            {selectedObs && (
              <DrawerSection title="Observation">
                <ObservationDetail observation={selectedObs} />
              </DrawerSection>
            )}

            {detail.observations.length >= 1 && (
              <DrawerSection title={`Observations (${detail.observations.length})`} collapsible defaultOpen={false}>
                <div className="flex flex-col gap-1">
                  {detail.observations.map((obs) => (
                    <ObservationCard
                      key={obs.id}
                      observation={obs}
                      selected={selectedObs?.id === obs.id}
                      onClick={onSelectObservation ? () => onSelectObservation(obs.id) : undefined}
                      onViewNode={onViewNode}
                      isTrace={detail.header.payloadType === PayloadType.TRACE}
                    />
                  ))}
                </div>
              </DrawerSection>
            )}

            {rawHex && (
              <DrawerSection title="Raw Packet">
                <div className="bg-bg-base border border-border rounded p-2 max-h-40 overflow-y-auto">
                  <ColoredHexDump data={rawHex} ranges={fieldRanges} />
                </div>
              </DrawerSection>
            )}

            <DrawerSection title="Packet Structure">
              <div className="flex flex-col gap-2.5 font-mono text-[13px]">
                {/* Header byte */}
                <ColorAccentField field="header">
                  <div className="text-text-dim text-xs font-medium uppercase tracking-wider mb-1">Header Byte</div>
                  <div className="flex gap-x-4">
                    <span><span className="text-text-dim">Ver </span><span className="text-text-normal">{detail.header.payloadVersion}</span></span>
                    <span><span className="text-text-dim">Type </span><span className="text-text-normal">{PAYLOAD_TYPE_NAMES[detail.header.payloadType as PayloadTypeValue] ?? "?"} ({detail.header.payloadType})</span></span>
                    <span><span className="text-text-dim">Route </span><span className="text-text-normal">{ROUTE_TYPE_NAMES[detail.header.routeType as RouteTypeValue] ?? "?"} ({detail.header.routeType})</span></span>
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
                      <span><span className="text-text-dim">Hash Size </span><span className="text-text-normal">{selectedObs.pathLength.hashSize}B</span></span>
                      <span><span className="text-text-dim">Hops </span><span className="text-text-normal">{selectedObs.pathLength.hopCount}</span></span>
                    </div>
                    <PathLengthBitBreakdown pathLengthByte={parseInt(selectedObs.pathLength.raw, 16)} />
                  </ColorAccentField>
                )}

                {/* Path data — for TRACE the path bytes are per-hop SNR samples, so show them raw */}
                {selectedObs?.pathBytes && (
                  <ColorAccentField field="pathData">
                    {detail.header.payloadType === PayloadType.TRACE ? (
                      <>
                        <div className="text-text-dim text-xs font-medium uppercase tracking-wider mb-1">Path SNR Data</div>
                        <div className="font-mono text-[13px] text-text-normal break-all">
                          {selectedObs.pathBytes.toUpperCase()}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-text-dim text-xs font-medium uppercase tracking-wider mb-1">Path Data</div>
                        <PathData pathBytes={selectedObs.pathBytes} hashSize={selectedObs.pathLength.hashSize} resolvedPath={selectedObs.resolvedPath} onViewNode={onViewNode} />
                      </>
                    )}
                  </ColorAccentField>
                )}

                {detail.originPubkey && detail.header.payloadType !== PayloadType.ADVERT && (
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
                  <PayloadBreakdown payload={detail.parsedPayload} resolvedRoute={detail.resolvedRoute} onViewNode={onViewNode} />
                </div>
              </DrawerSection>
            )}

            {detail.parsedPayload && typeof detail.parsedPayload === "string" && (() => {
              const hex = decodePayloadHex(detail.parsedPayload);
              if (!hex) return null;
              return (
                <DrawerSection title="Payload Data">
                  <div className="bg-bg-base border border-border rounded p-2 max-h-40 overflow-y-auto">
                    <pre className="text-[13px] font-mono text-text-muted leading-relaxed whitespace-pre-wrap">
                      {(hex.match(/.{1,2}/g) ?? []).reduce((acc, b, i) => {
                        const sep = i > 0 ? " " : "";
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
