import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useChartColors } from "./chartTheme";
import { rolledWindow, useTopAdvertisers, useTopTalkers } from "./useStats";
import { leaderboardOption } from "./chartOptions";
import { Card, ChartCard } from "./cards";
import { Segmented } from "./Segmented";
import { DataTable, type Column } from "../../components/DataTable";
import { Badge } from "../../components/Badge";
import { IataChip } from "../../components/IataChip";
import { formatCount, formatRatePerDay } from "../../lib/formatters";
import { RANGE_MS } from "./types";
import type { AdvertiserSort, TopAdvertiser, StatsRange } from "./types";

interface TalkersTabProps {
  range: StatsRange;
  onViewNode?: (nodeId: string) => void;
}

// grow with the roster so bars stay readable; a floor keeps the loading/empty state from collapsing
function leaderboardHeight(count: number) {
  return Math.max(260, count * 34 + 24);
}

// The server reads rolled hours from the hour holding `since`, so the counts stop at the rolled edge.
function coveredMs(range: StatsRange, fetchedAt: number) {
  const hour = 3_600_000;
  return rolledWindow(range, fetchedAt).until - Math.floor((fetchedAt - RANGE_MS[range]) / hour) * hour;
}

// The "noisy nodes, politely" tab: who's loudest by adverts and by channel chatter. Advertisers list
// their flood/direct advert split with a per-day rate; talkers are grouped by sender display-name.
export function TalkersTab({ range, onViewNode }: TalkersTabProps) {
  const { t } = useTranslation();
  const colors = useChartColors();
  const [advertSort, setAdvertSort] = useState<AdvertiserSort>("flood");
  const topAdvertisers = useTopAdvertisers(range, advertSort, 20);
  const topTalkers = useTopTalkers(range, 20);

  const advertisersLoading = topAdvertisers.isPending || topAdvertisers.isPlaceholderData;
  const talkersLoading = topTalkers.isPending || topTalkers.isPlaceholderData;
  const talkersUnavailable = talkersLoading || topTalkers.isError;
  const advertisers = advertisersLoading || topAdvertisers.isError ? [] : (topAdvertisers.data ?? []);

  const advertiserColumns = useMemo<Column<TopAdvertiser>[]>(() => {
    const windowMs = coveredMs(range, topAdvertisers.dataUpdatedAt);
    // count over the compacted total, then the per-day rate for the same window in muted text
    const split = (count: number) => (
      <span>
        {formatCount(count)} <span className="text-text-dim">{formatRatePerDay(count, windowMs)}</span>
      </span>
    );
    return [
      {
        header: t("talkers.node"),
        cell: (a) => (
          <div className="flex min-w-0 items-center gap-2">
            <span className={`truncate ${a.nodeName ? "text-text-normal" : "italic text-text-dim"}`}>
              {a.nodeName ?? a.publicKey.slice(0, 8)}
            </span>
            <Badge variant="default">{a.nodeTypeName}</Badge>
            <IataChip>{a.iata}</IataChip>
          </div>
        ),
        sortValue: (a) => a.nodeName ?? a.publicKey,
      },
      { header: t("talkers.flood"), className: "tabular-nums", cell: (a) => split(a.floodAdvertCount), sortValue: (a) => a.floodAdvertCount },
      { header: t("talkers.direct"), className: "tabular-nums", cell: (a) => split(a.directAdvertCount), sortValue: (a) => a.directAdvertCount },
    ];
  }, [range, t, topAdvertisers.dataUpdatedAt]);

  const talkerRows = useMemo(
    () => (talkersUnavailable ? [] : (topTalkers.data ?? [])).map((row) => ({ name: row.senderName, value: row.messageCount, color: colors.primary })),
    [topTalkers.data, colors, talkersUnavailable],
  );
  const talkersOption = useMemo(() => leaderboardOption(talkerRows, colors), [talkerRows, colors]);

  const rangeLabel = t(`stats.ranges.${range}`);
  return (
    <div className="mx-auto grid w-full min-w-0 max-w-[1200px] grid-cols-1 items-start gap-3.5 p-4 lg:grid-cols-2">
      <Card title={t("talkers.topAdvertisers", { range: rangeLabel })} right={
        <Segmented
          size="xs"
          ariaLabel={t("talkers.sortBy")}
          value={advertSort}
          onChange={(v) => setAdvertSort(v as AdvertiserSort)}
          options={[{ value: "flood", label: t("talkers.flood") }, { value: "direct", label: t("talkers.direct") }]}
        />
      }>
        <div className="flex flex-col" style={{ height: leaderboardHeight(advertisers.length) }}>
          <DataTable
            columns={advertiserColumns}
            rows={advertisers}
            rowKey={(a) => a.publicKey}
            selectedKey={null}
            onSelect={(key) => { const id = advertisers.find((a) => a.publicKey === key)?.nodeId; if (id) onViewNode?.(id); }}
            isLoading={advertisersLoading}
            emptyLabel={topAdvertisers.isError ? t("common.loadFailed") : t("talkers.noAdvertisers")}
          />
        </div>
      </Card>
      <ChartCard
        title={t("talkers.topTalkers", { range: rangeLabel })}
        right={<span className="font-mono text-[10px] text-text-muted">{t("talkers.byName")}</span>}
        height={leaderboardHeight(talkerRows.length)}
        option={talkersOption}
        isLoading={talkersLoading}
        isError={topTalkers.isError}
        isEmpty={talkerRows.length === 0}
      />
    </div>
  );
}
