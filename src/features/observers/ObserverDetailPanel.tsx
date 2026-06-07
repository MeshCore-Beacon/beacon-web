import type { Observer } from "./types";
import { useQuery } from "@tanstack/react-query";
import { getObserver } from "../../api/client";
import { Badge } from "../../components/Badge";
import { DetailPanel, Section, Field } from "../../components/DetailPanel";
import { formatUptime, formatBattery } from "../../lib/formatters";
import { Timestamp } from "../../components/Timestamp";
import type { BadgeVariant } from "../../components/badge-utils";
import { IataChip } from "../../components/IataChip";
import { ScopeTag } from "../../components/ScopeTag";

interface Stats {
  noise_floor?: number;
  rx_air_secs?: number;
  tx_air_secs?: number;
  queue_len?: number;
  recv_errors?: number;
  errors?: number;
  internal_heap?: number;
}

// broker freshness badge: <5m = live, <30m = stale
function brokerStatusVariant(lastPacketAt: number | null): BadgeVariant {
  if (!lastPacketAt) return "offline";
  const ageMs = Date.now() - lastPacketAt;
  return ageMs < 5 * 60_000 ? "live" : ageMs < 30 * 60_000 ? "stale" : "offline";
}

// stats shape depends on the observer's firmware, so we just grab what we recognize
function getStats(metadata: Record<string, unknown> | undefined): Stats | null {
  if (!metadata?.stats || typeof metadata.stats !== "object") return null;
  return metadata.stats as Stats;
}

function formatAirtime(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${m}m`;
}

function RadioSection({ observer, noiseFloor }: { observer: Observer; noiseFloor?: number | null }) {
  const parts = [
    observer.radioFreqMhz && `${observer.radioFreqMhz} MHz`,
    observer.radioSf && `SF${observer.radioSf}`,
    observer.radioBwKhz && `${observer.radioBwKhz} kHz`,
    observer.radioCr && `CR 4/${observer.radioCr}`,
  ].filter(Boolean) as string[];

  return (
    <Section title="Radio">
      <div className="font-mono text-[13px] text-text-muted">
        {parts.join(" · ")}
      </div>
      {noiseFloor != null && (
        <div className="font-mono text-[13px] mt-1">
          <Field label="Noise floor" value={`${noiseFloor} dBm`} />
        </div>
      )}
    </Section>
  );
}

interface ObserverDetailPanelProps {
  observerId: string;
  onClose: () => void;
}

export function ObserverDetailPanel({ observerId, onClose }: ObserverDetailPanelProps) {
  const { data: observer, isLoading } = useQuery({
    queryKey: ["observer", observerId],
    queryFn: () => getObserver(observerId),
    staleTime: 30_000,
  });

  const stats = observer ? getStats(observer.statusMetadata) : null;

  return (
    <DetailPanel
      title="Observer Detail"
      onClose={onClose}
      isLoading={isLoading}
      notFound={!observer}
      notFoundLabel="Observer not found"
      notFoundIcon={
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-border">
          <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.2" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      }
    >
      {observer && (
        <>
          <Section title="Summary" first>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-xs font-semibold text-primary tracking-wider">
                  {observer.displayName ?? observer.id.slice(0, 8)}
                </span>
                <Badge variant={observer.status === "online" ? "live" : "offline"}>
                  {observer.status}
                </Badge>
              </div>
              <div className="font-mono text-[13px] text-text-muted truncate mb-1.5" title={observer.publicKey}>
                {observer.publicKey}
              </div>
              <div className="flex items-center gap-3 font-mono text-[13px]">
                <Field label="Observations" value={observer.observationCount.toLocaleString()} />
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                {observer.observerType && <Badge variant="default">{observer.observerType}</Badge>}
                <IataChip>{observer.iata}</IataChip>
                {observer.scopes?.map((s) => (
                  <ScopeTag key={s}>{s}</ScopeTag>
                ))}
              </div>
            </Section>

            {(observer.radioFreqMhz || observer.radioSf || observer.radioBwKhz || observer.radioCr) && (
              <RadioSection observer={observer} noiseFloor={stats?.noise_floor} />
            )}

            {(observer.firmwareVersion || observer.softwareVersion || observer.hardwareModel) && (
              <Section title="Firmware">
                <div className="flex flex-col gap-0.5 font-mono text-[13px]">
                  {observer.firmwareVersion && <Field label="Version" value={observer.firmwareVersion} />}
                  {observer.softwareVersion && <Field label="Software" value={observer.softwareVersion} />}
                  {observer.hardwareModel && <Field label="Hardware" value={observer.hardwareModel} />}
                </div>
              </Section>
            )}

            <Section title="Status">
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[13px]">
                {observer.batteryLevel != null && <Field label="Battery" value={formatBattery(observer.batteryLevel)} />}
                {observer.uptimeSeconds != null && <Field label="Uptime" value={formatUptime(observer.uptimeSeconds)} />}
                {stats?.queue_len != null && <Field label="Queue" value={stats.queue_len} />}
              </div>
              {observer.lastStatusAt && (
                <div className="font-mono text-[13px] mt-1">
                  <Field label="Last status" value={<Timestamp value={observer.lastStatusAt} />} />
                </div>
              )}
            </Section>

            {stats && (stats.rx_air_secs != null || stats.tx_air_secs != null || stats.recv_errors != null) && (
              <Section title="Airtime">
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[13px]">
                  {stats.rx_air_secs != null && <Field label="RX" value={formatAirtime(stats.rx_air_secs)} />}
                  {stats.tx_air_secs != null && <Field label="TX" value={formatAirtime(stats.tx_air_secs)} />}
                </div>
                {(stats.recv_errors != null || stats.errors != null) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[13px] mt-1">
                    {stats.recv_errors != null && <Field label="Recv errors" value={stats.recv_errors.toLocaleString()} />}
                    {stats.errors != null && <Field label="Errors" value={stats.errors.toLocaleString()} />}
                  </div>
                )}
              </Section>
            )}

            {observer.brokers.length > 0 && (
              <Section title="Brokers">
                <div className="flex flex-col gap-1.5">
                  {[...observer.brokers].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map((b) => {
                    const variant = brokerStatusVariant(b.lastPacketAt);
                    return (
                      <div key={b.name} className="flex items-center gap-3">
                        <Badge variant={variant}>{b.name}</Badge>
                        <div className="flex items-center gap-3 font-mono text-[13px]">
                          <Field label="Seen" value={<Timestamp value={b.lastSeenAt} />} />
                          <Field label="Packet" value={b.lastPacketAt ? <Timestamp value={b.lastPacketAt} /> : "—"} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            <Section title="Timestamps">
              <div className="flex items-center gap-3 font-mono text-[13px]">
                <Field label="First" value={<Timestamp value={observer.firstSeen} />} />
                <span className="text-[6px] text-border" aria-hidden>·</span>
                <Field label="Last" value={<Timestamp value={observer.lastSeen} />} />
              </div>
            </Section>
        </>
      )}
    </DetailPanel>
  );
}
