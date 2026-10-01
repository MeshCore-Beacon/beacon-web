import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getObserverAdverts } from "../../api/client";
import { IataChip } from "../../components/IataChip";
import { Timestamp } from "../../components/Timestamp";
import { formatHex, formatSnr, snrLevel, SIGNAL_LEVEL_CLASSES } from "../../lib/formatters";
import type { AdvertObservation } from "./types";

function AdvertRow({ advert, onClick }: { advert: AdvertObservation; onClick: () => void }) {
  const { t } = useTranslation();
  const level = snrLevel(advert.snr);
  const signal = level ? SIGNAL_LEVEL_CLASSES[level] : "text-text-normal";
  return (
    <button type="button" onClick={onClick} className="w-full cursor-pointer rounded border border-border border-l-2 border-l-primary bg-bg-base px-3 py-2 text-left hover:bg-text-normal/3">
      <span className="mb-1.5 flex items-center gap-2 text-[11px]">
        <span className={`truncate font-mono font-semibold tracking-wider ${advert.nodeName ? "text-primary" : "italic text-text-dim"}`}>
          {advert.nodeName ?? (advert.nodePublicKey ? formatHex(advert.nodePublicKey) : t("observerPage.unknownNode"))}
        </span>
        <IataChip>{advert.iata}</IataChip>
        <Timestamp value={advert.heardAt} className="ml-auto font-mono text-[11px] text-text-dim" />
      </span>
      <span className="flex gap-5 font-mono text-xs">
        <span className="flex flex-col"><span className="text-[10px] font-medium uppercase tracking-wider text-text-dim">SNR</span><span className={`font-medium ${signal}`}>{formatSnr(advert.snr)}</span></span>
        <span className="flex flex-col"><span className="text-[10px] font-medium uppercase tracking-wider text-text-dim">RSSI</span><span className={`font-medium ${signal}`}>{advert.rssi ?? "—"}</span></span>
        <span className="flex flex-col"><span className="text-[10px] font-medium uppercase tracking-wider text-text-dim">{t("observerPage.hops")}</span><span className="font-medium text-text-normal">{advert.hopCount ?? "—"}</span></span>
      </span>
    </button>
  );
}

export function ObserverAdverts({ observerId, onAnalyzePacket }: { observerId: string; onAnalyzePacket: (hash: string, observationId: number) => void }) {
  const { t } = useTranslation();
  const { data: adverts, isPending } = useQuery({
    queryKey: ["observer-adverts", observerId],
    queryFn: () => getObserverAdverts(observerId, { limit: 50 }),
    staleTime: 30_000,
  });
  return (
    <details className="rounded-lg border border-border bg-bg-surface p-3.5">
      <summary className="cursor-pointer font-mono text-[11px] font-semibold uppercase tracking-wider text-text-normal">{t("observerPage.advertsHeard")}</summary>
      <div className="mt-2.5">
        {isPending ? <p role="status" className="text-sm text-text-muted">{t("common.loading")}</p>
          : adverts?.items.length ? (
            <div className="grid gap-1.5 md:grid-cols-2">
              {adverts.items.map(a => <AdvertRow key={a.id} advert={a} onClick={() => onAnalyzePacket(a.packetHash, a.id)} />)}
            </div>
          ) : <p className="font-mono text-[13px] text-text-dim">{t("observerPage.noAdverts")}</p>}
      </div>
    </details>
  );
}
