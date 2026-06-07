import type { ReactNode } from "react";
import { Badge } from "../../components/Badge";
import { formatSnr, snrLevel, SIGNAL_LEVEL_CLASSES } from "../../lib/formatters";
import { Timestamp } from "../../components/Timestamp";
import { ColorAccentField, AdvertFlagsBitBreakdown, PathLengthBitBreakdown, FIELD_COLORS } from "./packet-structure";
import type { FieldId } from "./packet-structure";
import { ResolvedHopBlock } from "./PathData";
import type { ResolvedHop } from "../../types/api";

// shared layout primitives for payload fields

interface PayloadProps {
  payload: Record<string, unknown>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-text-dim text-xs font-medium uppercase tracking-wider mb-1">{children}</div>;
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-text-dim">{label} </span>
      {children}
    </div>
  );
}

function TruncatedHex({ label, value, maxChars = 16, accentClass }: {
  label: string;
  value: string;
  maxChars?: number;
  accentClass?: string;
}) {
  const display = value.length > maxChars ? value.slice(0, maxChars).toUpperCase() + "…" : value.toUpperCase();
  const bytes = value.length / 2;
  return (
    <div className={`pl-2 -mx-1 py-0.5 -my-0.5 border-l-2 ${accentClass ?? "border-l-secondary/50"}`}>
      <span className="text-text-dim">{label} </span>
      <span className="text-text-normal">{display}</span>
      <span className="text-text-dim"> ({bytes}B)</span>
    </div>
  );
}

function HexBadge({ value }: { value: string }) {
  return (
    <span className="px-1.5 py-px rounded-sm bg-primary/6 text-primary font-semibold">
      {value.toUpperCase()}
    </span>
  );
}

function BooleanValue({ value }: { value: boolean }) {
  return <span className={value ? "text-green" : "text-text-muted"}>{value ? "Yes" : "No"}</span>;
}

function FlagChip({ label, active, variant = "green" }: { label: string; active: boolean; variant?: "green" | "danger" }) {
  const activeClasses = variant === "danger"
    ? "bg-danger/8 text-danger border-danger/15"
    : "bg-green/8 text-green border-green/15";
  return (
    <span className={`text-xs px-1.5 py-px rounded-sm border font-medium ${
      active ? activeClasses : "bg-bg-base text-text-dim border-border-subtle"
    }`}>
      {label}
    </span>
  );
}

function EncryptedIndicator() {
  return (
    <div className="flex items-center gap-1.5 text-text-muted text-xs bg-text-muted/5 border border-text-muted/10 rounded px-2 py-1">
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="shrink-0">
        <rect x="3" y="8" width="10" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
        <path d="M5 8V5.5C5 3.567 6.567 2 8.5 2V2C10.433 2 12 3.567 12 5.5V8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
      <span className="italic">Encrypted — key not available</span>
    </div>
  );
}

function EncryptedEnvelope({ payload, headerSlot, children }: {
  payload: Record<string, unknown>;
  headerSlot?: ReactNode;
  children: (decrypted: Record<string, unknown>) => ReactNode;
}) {
  const destinationHash = payload.destinationHash as string | undefined;
  const sourceHash = payload.sourceHash as string | undefined;
  const cipherMac = payload.cipherMac as string | undefined;
  const ciphertext = payload.ciphertext as string | undefined;
  const decrypted = payload.decrypted as Record<string, unknown> | null | undefined;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1">
        {destinationHash && (
          <ColorAccentField field="destinationHash">
            <span className="text-text-dim">To </span><HexBadge value={destinationHash} />
            <span className="text-text-dim"> ({destinationHash.length / 2}B)</span>
          </ColorAccentField>
        )}
        {sourceHash && (
          <ColorAccentField field="sourceHash">
            <span className="text-text-dim">From </span><HexBadge value={sourceHash} />
            <span className="text-text-dim"> ({sourceHash.length / 2}B)</span>
          </ColorAccentField>
        )}
        {headerSlot}
        {cipherMac && <TruncatedHex label="MAC" value={cipherMac} maxChars={32} accentClass={FIELD_COLORS.cipherMac.accent} />}
        {ciphertext && <TruncatedHex label="Ciphertext" value={ciphertext} accentClass={FIELD_COLORS.ciphertext.accent} />}
      </div>

      {decrypted ? (
        <div>
          <SectionLabel>Decrypted</SectionLabel>
          {children(decrypted)}
        </div>
      ) : (
        <EncryptedIndicator />
      )}
    </div>
  );
}

// per-payload-type renderers

function AdvertPayload({ payload }: PayloadProps) {
  const p = payload;
  const publicKey = p.publicKey as string | undefined;
  const signature = p.signature as string | undefined;
  const timestamp = p.timestamp as number | undefined;
  const appData = (p.appData ?? {}) as Record<string, unknown>;
  const flags = (appData.flags ?? {}) as Record<string, unknown>;
  const flagsByte = typeof flags.raw === "string" ? parseInt(flags.raw, 16) : undefined;
  const latitude = appData.latitude as number | null | undefined;
  const longitude = appData.longitude as number | null | undefined;
  const hasLocation = flags.hasLocation as boolean | undefined;
  const name = appData.name as string | null | undefined;

  return (
    <div className="flex flex-col gap-2.5">
      {publicKey && (
        <ColorAccentField field="publicKey">
          <span className="text-text-dim">Public Key </span>
          <span className="text-text-normal">{publicKey.slice(0, 16).toUpperCase()}…</span>
          <span className="text-text-dim"> ({publicKey.length / 2}B)</span>
        </ColorAccentField>
      )}

      {timestamp != null && (
        <ColorAccentField field="advertTimestamp">
          <span className="text-text-dim">Timestamp </span>
          <Timestamp value={timestamp * 1000} className="text-text-normal" />
          <span className="text-text-dim"> (4B LE)</span>
        </ColorAccentField>
      )}

      {signature && (
        <ColorAccentField field="signature">
          <span className="text-text-dim">Signature </span>
          <span className="text-text-normal">{signature.slice(0, 16).toUpperCase()}…</span>
          <span className="text-text-dim"> ({signature.length / 2}B)</span>
        </ColorAccentField>
      )}

      <ColorAccentField field="flags">
        <div className="text-text-dim text-xs font-medium uppercase tracking-wider mb-1">App Flags</div>
        <div className="flex gap-x-4">
          <span><span className="text-text-dim">Role </span><span className="text-text-normal">{String(flags.deviceRoleName ?? "?")}</span></span>
          <span><span className="text-text-dim">Loc </span><BooleanValue value={!!flags.hasLocation} /></span>
          <span><span className="text-text-dim">F1 </span><BooleanValue value={!!flags.hasFeature1} /></span>
          <span><span className="text-text-dim">F2 </span><BooleanValue value={!!flags.hasFeature2} /></span>
          <span><span className="text-text-dim">Name </span><BooleanValue value={!!flags.hasName} /></span>
        </div>
        {flagsByte != null && !Number.isNaN(flagsByte) && <AdvertFlagsBitBreakdown flagsByte={flagsByte} />}
      </ColorAccentField>

      {/* Coordinates render as raw decimal degrees by design — intentionally not D°M' / N·S·E·W formatted. */}
      {hasLocation && (latitude != null || longitude != null) && (
        <ColorAccentField field="location">
          <span className="text-text-dim">Location </span>
          <span className="text-text-normal">
            {latitude != null ? latitude.toFixed(5) : "—"}
            {", "}
            {longitude != null ? longitude.toFixed(5) : "—"}
          </span>
          <span className="text-text-dim"> (8B LE)</span>
        </ColorAccentField>
      )}

      {name && (
        <ColorAccentField field="advertName">
          <span className="text-text-dim">Name </span>
          <span className="text-text-normal">{name}</span>
          <span className="text-text-dim"> ({new TextEncoder().encode(name).length}B UTF-8)</span>
        </ColorAccentField>
      )}
    </div>
  );
}

function TracePayload({ payload, resolvedRoute, onViewNode }: PayloadProps & {
  resolvedRoute?: ResolvedHop[];
  onViewNode?: (nodeId: string) => void;
}) {
  const traceTag = payload.traceTag as string | undefined;
  const authCode = payload.authCode as number | undefined;
  const flags = payload.flags as number | undefined;
  const pathHashes = payload.pathHashes as string[] | undefined;
  const snrValues = payload.snrValues as number[] | undefined;

  return (
    <div className="flex flex-col gap-2.5">
      {traceTag && (
        <ColorAccentField field="traceTag">
          <span className="text-text-dim">Trace Tag </span>
          <span className="text-text-normal">{traceTag.toUpperCase()}</span>
          <span className="text-text-dim"> ({traceTag.length / 2}B)</span>
        </ColorAccentField>
      )}

      {authCode != null && (
        <ColorAccentField field="authCode">
          <span className="text-text-dim">Auth Code </span>
          <span className="text-text-normal">0x{authCode.toString(16).toUpperCase()}</span>
          <span className="text-text-dim"> (4B)</span>
        </ColorAccentField>
      )}

      {flags != null && (
        <ColorAccentField field="flags">
          <span className="text-text-dim">Flags </span>
          <span className="text-text-normal">0x{flags.toString(16).toUpperCase().padStart(2, "0")}</span>
        </ColorAccentField>
      )}

      {pathHashes && pathHashes.length > 0 && (
        <ColorAccentField field="tracePath">
          <div className="text-text-dim text-xs font-medium uppercase tracking-wider mb-1">Trace Path</div>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[13px]">
            {pathHashes.map((hash, i) => {
              const snr = snrValues?.[i];
              const level = snr != null ? snrLevel(snr) : null;
              const sigClass = level ? SIGNAL_LEVEL_CLASSES[level] : "text-text-normal";
              // When the packet detail resolved this trace's route, overlay it onto each hash block:
              // tint by match confidence and reveal the resolved node(s) on hover. Falls back to the
              // plain hash badge when there's no resolution (e.g. live/WS view).
              const resolved = resolvedRoute?.[i];
              return (
                <span key={i} className="contents">
                  {i > 0 && <span className="text-text-dim" aria-hidden>→</span>}
                  <span className="inline-flex flex-col items-center gap-0.5">
                    {resolvedRoute ? (
                      <ResolvedHopBlock hop={resolved} label={hash.toUpperCase()} onViewNode={onViewNode} />
                    ) : (
                      <HexBadge value={hash} />
                    )}
                    {/* keep a sub-line on every hop (SNR, or a "-" placeholder when there's no reading)
                        so the hash badges across the row stay aligned */}
                    {snr != null ? (
                      <span className={`text-[11px] ${sigClass}`}>{formatSnr(snr)} dB</span>
                    ) : (
                      <span className="text-[11px] text-text-dim" aria-hidden>-</span>
                    )}
                  </span>
                </span>
              );
            })}
          </div>
        </ColorAccentField>
      )}
    </div>
  );
}

function GroupTextPayload({ payload }: PayloadProps) {
  const channelHash = payload.channelHash as string | undefined;
  const cipherMac = payload.cipherMac as string | undefined;
  const ciphertext = payload.ciphertext as string | undefined;
  const decrypted = payload.decrypted as Record<string, unknown> | null | undefined;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1">
        {channelHash && <TruncatedHex label="Channel" value={channelHash} maxChars={32} accentClass={FIELD_COLORS.channelHash.accent} />}
        {cipherMac && <TruncatedHex label="MAC" value={cipherMac} maxChars={32} accentClass={FIELD_COLORS.cipherMac.accent} />}
        {ciphertext && <TruncatedHex label="Ciphertext" value={ciphertext} accentClass={FIELD_COLORS.ciphertext.accent} />}
      </div>

      {decrypted ? (
        <div>
          <SectionLabel>Decrypted</SectionLabel>
          <div className="flex flex-col gap-1">
            {decrypted.sender != null && (
              <div>
                <span className="text-text-dim">Sender </span>
                <span className="text-text-normal font-semibold">{String(decrypted.sender)}</span>
              </div>
            )}
            {decrypted.content != null && (
              <div>
                <span className="text-text-dim">Message </span>
                <span className="text-text-bright break-all">{String(decrypted.content)}</span>
              </div>
            )}
            {decrypted.sentAt != null && (
              <div className="text-text-dim"><Timestamp value={decrypted.sentAt as number} /></div>
            )}
          </div>
        </div>
      ) : (
        <EncryptedIndicator />
      )}
    </div>
  );
}

function TextPayload({ payload }: PayloadProps) {
  return (
    <EncryptedEnvelope payload={payload}>
      {(d) => (
        <div className="flex flex-col gap-1">
          {d.message != null && (
            <div className="text-text-bright break-all">{String(d.message)}</div>
          )}
          <div className="flex gap-x-4 text-text-dim">
            {d.timestamp != null && <Timestamp value={(d.timestamp as number) * 1000} />}
            {d.attempt != null && <span>Attempt {String(d.attempt)}</span>}
            {d.flags != null && <span>Flags {String(d.flags)}</span>}
          </div>
        </div>
      )}
    </EncryptedEnvelope>
  );
}

function RequestPayload({ payload }: PayloadProps) {
  return (
    <EncryptedEnvelope payload={payload}>
      {(d) => (
        <div className="flex flex-col gap-1.5">
          {d.requestTypeName != null && (
            <div><Badge variant="request">{String(d.requestTypeName)}</Badge></div>
          )}
          {d.requestData != null && (
            <TruncatedHex label="Data" value={String(d.requestData)} />
          )}
          {d.timestamp != null && (
            <FieldRow label="Time">
              <Timestamp value={(d.timestamp as number) * 1000} className="text-text-normal" />
            </FieldRow>
          )}
        </div>
      )}
    </EncryptedEnvelope>
  );
}

function ResponsePayload({ payload }: PayloadProps) {
  return (
    <EncryptedEnvelope payload={payload}>
      {(d) => (
        <div className="flex flex-col gap-1">
          {d.tag != null && (
            <FieldRow label="Tag"><span className="text-text-normal">{String(d.tag)}</span></FieldRow>
          )}
          {d.content != null && (
            <div className="text-text-bright break-all">{String(d.content)}</div>
          )}
        </div>
      )}
    </EncryptedEnvelope>
  );
}

function AckPayload({ payload }: PayloadProps) {
  const checksum = payload.checksum as string | undefined;
  if (!checksum) return null;

  return (
    <ColorAccentField field="checksum">
      <span className="text-text-dim">Checksum </span>
      <HexBadge value={checksum} />
      <span className="text-text-dim"> ({checksum.length / 2}B)</span>
    </ColorAccentField>
  );
}

function PathPayload({ payload }: PayloadProps) {
  return (
    <EncryptedEnvelope payload={payload}>
      {(d) => <PathDecryptedContent decrypted={d} />}
    </EncryptedEnvelope>
  );
}

function PathDecryptedContent({ decrypted }: { decrypted: Record<string, unknown> }) {
  const pathLength = decrypted.pathLength as number | undefined;
  const pathHashSize = decrypted.pathHashSize as number | undefined;
  const pathHashes = decrypted.pathHashes as string[] | undefined;
  const extraTypeName = decrypted.extraTypeName as string | undefined;
  const extraData = decrypted.extraData as string | undefined;

  const pathLenByte = pathLength != null && pathHashSize != null
    ? ((pathHashSize - 1) << 6) | (pathLength & 0x3f)
    : null;

  return (
    <div className="flex flex-col gap-2.5">
      <div>
        <div className="flex gap-x-4">
          {pathLength != null && (
            <FieldRow label="Hops"><span className="text-text-normal">{pathLength}</span></FieldRow>
          )}
          {pathHashSize != null && (
            <FieldRow label="Hash Size"><span className="text-text-normal">{pathHashSize}B</span></FieldRow>
          )}
        </div>
        {pathLenByte != null && <PathLengthBitBreakdown pathLengthByte={pathLenByte} />}
      </div>

      {pathHashes && pathHashes.length > 0 && (
        <div>
          <SectionLabel>Path</SectionLabel>
          <div className="flex flex-wrap items-center gap-1">
            {pathHashes.map((hash, i) => (
              <span key={i} className="contents">
                {i > 0 && <span className="text-text-dim text-xs" aria-hidden>→</span>}
                <HexBadge value={hash} />
              </span>
            ))}
          </div>
        </div>
      )}

      {(extraTypeName || extraData) && (
        <div className="flex flex-col gap-1">
          {extraTypeName && (
            <div>
              <span className="text-text-dim">Bundled Type </span>
              <Badge variant="default">{extraTypeName}</Badge>
            </div>
          )}
          {extraData && <TruncatedHex label="Bundled Data" value={extraData} />}
        </div>
      )}
    </div>
  );
}

function DiscoverReqFields({ payload }: PayloadProps) {
  const tag = payload.tag as number | undefined;
  const typeFilterNames = payload.typeFilterNames as string[] | undefined;
  const since = payload.since as number | null | undefined;
  const prefixOnly = payload.prefixOnly as boolean | undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {tag != null && (
        <FieldRow label="Tag">
          <span className="text-text-normal">0x{tag.toString(16).toUpperCase()}</span>
        </FieldRow>
      )}
      {typeFilterNames && typeFilterNames.length > 0 && (
        <div>
          <span className="text-text-dim">Type Filter </span>
          <span className="inline-flex gap-1 flex-wrap">
            {typeFilterNames.map((name) => (
              <FlagChip key={name} label={name} active />
            ))}
          </span>
        </div>
      )}
      {since != null && (
        <FieldRow label="Since">
          <Timestamp value={since * 1000} className="text-text-normal" />
        </FieldRow>
      )}
      {prefixOnly != null && (
        <FieldRow label="Prefix Only"><BooleanValue value={prefixOnly} /></FieldRow>
      )}
    </div>
  );
}

function DiscoverRespFields({ payload }: PayloadProps) {
  const tag = payload.tag as number | undefined;
  const nodeTypeName = payload.nodeTypeName as string | undefined;
  const snr = payload.snr as number | undefined;
  const publicKey = payload.publicKey as string | undefined;
  const publicKeyLength = payload.publicKeyLength as number | undefined;

  const level = snr != null ? snrLevel(snr) : null;
  const sigClass = level ? SIGNAL_LEVEL_CLASSES[level] : "text-text-normal";

  return (
    <div className="flex flex-col gap-1.5">
      {tag != null && (
        <FieldRow label="Tag">
          <span className="text-text-normal">0x{tag.toString(16).toUpperCase()}</span>
        </FieldRow>
      )}
      {nodeTypeName && (
        <div>
          <span className="text-text-dim">Node Type </span>
          <Badge variant="default">{nodeTypeName}</Badge>
        </div>
      )}
      {snr != null && (
        <FieldRow label="SNR"><span className={sigClass}>{formatSnr(snr)} dB</span></FieldRow>
      )}
      {publicKey && (
        <TruncatedHex label={publicKeyLength === 32 ? "Public Key" : "Key Prefix"} value={publicKey} accentClass={FIELD_COLORS.publicKey.accent} />
      )}
    </div>
  );
}

function ControlPayload({ payload }: PayloadProps) {
  const subTypeName = payload.subTypeName as string | undefined;

  return (
    <div className="flex flex-col gap-2.5">
      {subTypeName && <div><Badge variant="request">{subTypeName}</Badge></div>}
      {subTypeName === "DISCOVER_REQ" && <DiscoverReqFields payload={payload} />}
      {subTypeName === "DISCOVER_RESP" && <DiscoverRespFields payload={payload} />}
      {subTypeName !== "DISCOVER_REQ" && subTypeName !== "DISCOVER_RESP" && (
        <GenericPayload payload={payload} />
      )}
    </div>
  );
}

function RawPayload({ payload }: PayloadProps) {
  // RAW packets carry the bytes under `data`; older shapes used `raw`.
  const raw = (payload.raw ?? payload.data) as string | undefined;
  if (!raw) return null;
  return <TruncatedHex label="Raw" value={raw} maxChars={32} />;
}

// generic key-value renderer for unknown payload types

function humanizeKey(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim();
}

function GenericPayload({ payload }: PayloadProps) {
  const hidden = new Set(["type", "ciphertextLength"]);
  for (const key of Object.keys(payload)) {
    if (payload[`${key}Name`] !== undefined) hidden.add(key);
  }

  const isHex = (v: unknown): v is string => typeof v === "string" && /^[0-9a-fA-F]+$/.test(v);
  const entries = Object.entries(payload).filter(([key]) => !hidden.has(key));

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-2.5">
      {entries.map(([key, value]) => {
        if (value !== null && typeof value === "object" && !Array.isArray(value)) {
          return (
            <div key={key}>
              <SectionLabel>{humanizeKey(key)}</SectionLabel>
              <div className="flex flex-col gap-1">
                {Object.entries(value as Record<string, unknown>).map(([sk, sv]) => (
                  <div key={sk}>
                    <span className="text-text-dim">{humanizeKey(sk)} </span>
                    <span className="text-text-normal break-all">{String(sv)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        if (Array.isArray(value)) {
          return (
            <div key={key}>
              <span className="text-text-dim">{humanizeKey(key)} </span>
              <span className="inline-flex flex-wrap items-center gap-1">
                {(value as unknown[]).map((item, i) => {
                  if (typeof item === "string" && /^[0-9a-fA-F]+$/.test(item)) {
                    return (
                      <span key={i} className="contents">
                        {i > 0 && <span className="text-text-dim text-xs">→</span>}
                        <HexBadge value={item} />
                      </span>
                    );
                  }
                  return <span key={i} className="text-text-normal">{i > 0 ? ", " : ""}{String(item)}</span>;
                })}
              </span>
            </div>
          );
        }

        if (typeof value === "boolean") {
          return (
            <div key={key}>
              <span className="text-text-dim">{humanizeKey(key)} </span>
              <BooleanValue value={value} />
            </div>
          );
        }

        const fieldColor = key in FIELD_COLORS ? FIELD_COLORS[key as FieldId] : null;
        if (isHex(value) && fieldColor) {
          const display = value.length > 16 ? value.slice(0, 16).toUpperCase() + "…" : value.toUpperCase();
          return (
            <ColorAccentField key={key} field={key as FieldId}>
              <span className="text-text-dim">{humanizeKey(key)} </span>
              <span className="text-text-normal">{display}</span>
              <span className="text-text-dim"> ({value.length / 2}B)</span>
            </ColorAccentField>
          );
        }

        if (isHex(value)) {
          return <TruncatedHex key={key} label={humanizeKey(key)} value={value} />;
        }

        if (
          typeof value === "number" &&
          (key.toLowerCase().includes("timestamp") || key === "since") &&
          value > 1_000_000_000 && value < 10_000_000_000
        ) {
          return (
            <div key={key}>
              <span className="text-text-dim">{humanizeKey(key)} </span>
              <Timestamp value={value * 1000} className="text-text-normal" />
            </div>
          );
        }

        return (
          <div key={key}>
            <span className="text-text-dim">{humanizeKey(key)} </span>
            <span className="text-text-normal break-all">{String(value)}</span>
          </div>
        );
      })}
    </div>
  );
}

function AnonReqPayload({ payload }: PayloadProps) {
  const destination = payload.destination as number | undefined;
  const ephemeralPubKey = payload.ephemeralPubKey as string | undefined;

  return (
    <div className="flex flex-col gap-2.5">
      {destination != null && (
        <FieldRow label="Dest Hash">
          <span className="text-text-normal">0x{destination.toString(16).toUpperCase().padStart(2, "0")}</span>
        </FieldRow>
      )}
      {ephemeralPubKey && (
        <TruncatedHex label="Ephemeral Key" value={ephemeralPubKey} accentClass={FIELD_COLORS.senderPublicKey.accent} />
      )}
    </div>
  );
}

// routes payload.type to the right renderer

export function PayloadBreakdown({ payload, resolvedRoute, onViewNode }: {
  payload: Record<string, unknown>;
  resolvedRoute?: ResolvedHop[]; // trace packets only — packet-level, not part of parsedPayload
  onViewNode?: (nodeId: string) => void;
}) {
  switch (payload.type) {
    case "ADVERT": return <AdvertPayload payload={payload} />;
    case "TRACE": return <TracePayload payload={payload} resolvedRoute={resolvedRoute} onViewNode={onViewNode} />;
    case "GROUP_TEXT": return <GroupTextPayload payload={payload} />;
    case "TEXT_MESSAGE": return <TextPayload payload={payload} />;
    case "REQUEST": return <RequestPayload payload={payload} />;
    case "RESPONSE": return <ResponsePayload payload={payload} />;
    case "ANON_REQUEST": return <AnonReqPayload payload={payload} />;
    case "ACK": return <AckPayload payload={payload} />;
    case "PATH": return <PathPayload payload={payload} />;
    case "CONTROL": return <ControlPayload payload={payload} />;
    case "GROUP_DATA": return <GroupTextPayload payload={payload} />;
    case "RAW": return <RawPayload payload={payload} />;
    // MULTIPART carries structured remaining/wrappedType/wrappedPayload fields, which the
    // generic key/value renderer shows verbatim.
    default: return <GenericPayload payload={payload} />;
  }
}
