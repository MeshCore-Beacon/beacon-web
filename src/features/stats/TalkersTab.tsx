import { useMemo } from "react";
import { useChartColors } from "./chartTheme";
import { useTopAdvertisers, useTopTalkers } from "./useStats";
import { leaderboardOption } from "./chartOptions";
import { Card, ChartCard } from "./cards";
import { DataTable, type Column } from "../../components/DataTable";
import { Badge } from "../../components/Badge";
import { IataChip } from "../../components/IataChip";
import { formatCount, formatRatePerDay } from "../../lib/formatters";
import { RANGE_MS } from "./types";
import type { TopAdvertiser, StatsRange } from "./types";

interface TalkersTabProps {
  range: StatsRange;
}

// grow with the roster so bars stay readable; a floor keeps the loading/empty state from collapsing
function leaderboardHeight(count: number) {
  return Math.max(260, count * 34 + 24);
}

// The "noisy nodes, politely" tab: who's loudest by adverts and by channel chatter. Advertisers list
// their flood/direct advert split with a per-day rate; talkers are grouped by sender display-name.
export function TalkersTab({ range }: TalkersTabProps) {
  const colors = useChartColors();
  const topAdvertisers = useTopAdvertisers(range, 20);
  const topTalkers = useTopTalkers(range, 20);

  const advertisersLoading = topAdvertisers.isPending || topAdvertisers.isLoading || topAdvertisers.isPlaceholderData;
  const talkersLoading = topTalkers.isPending || topTalkers.isLoading || topTalkers.isPlaceholderData;
  const talkersUnavailable = talkersLoading || topTalkers.isError;
  const advertisers = advertisersLoading || topAdvertisers.isError ? [] : (topAdvertisers.data ?? []);

  const advertiserColumns = useMemo<Column<TopAdvertiser>[]>(() => {
    const windowMs = RANGE_MS[range];
    // count over the compacted total, then the per-day rate for the same window in muted text
    const split = (count: number) => (
      <span>
        {formatCount(count)} <span className="text-text-dim">{formatRatePerDay(count, windowMs)}</span>
      </span>
    );
    return [
      {
        header: "Node",
        cell: (a) => (
          <div className="flex min-w-0 items-center gap-2">
            <span className={`truncate ${a.nodeName ? "text-text-normal" : "italic text-text-dim"}`}>
              {a.nodeName ?? a.nodeId.slice(0, 8)}
            </span>
            <Badge variant="default">{a.nodeTypeName}</Badge>
            <IataChip>{a.iata}</IataChip>
          </div>
        ),
        sortValue: (a) => a.nodeName ?? a.nodeId,
      },
      { header: "Flood", className: "tabular-nums", cell: (a) => split(a.floodAdvertCount), sortValue: (a) => a.floodAdvertCount },
      { header: "Direct", className: "tabular-nums", cell: (a) => split(a.directAdvertCount), sortValue: (a) => a.directAdvertCount },
    ];
  }, [range]);

  const talkerRows = useMemo(
    () => (talkersUnavailable ? [] : (topTalkers.data ?? [])).map((t) => ({ name: t.senderName, value: t.messageCount, color: colors.secondary })),
    [topTalkers.data, colors, talkersUnavailable],
  );
  const talkersOption = useMemo(() => leaderboardOption(talkerRows, colors), [talkerRows, colors]);

  return (
    <div className="mx-auto grid max-w-[1100px] grid-cols-1 items-start gap-3.5 px-4 py-4 lg:grid-cols-2">
      <Card title={<>Top advertisers · {range}</>} right={<span className="font-mono text-[10px] text-text-muted">flood · direct</span>}>
        <div className="flex flex-col" style={{ height: leaderboardHeight(advertisers.length) }}>
          <DataTable
            columns={advertiserColumns}
            rows={advertisers}
            rowKey={(a) => a.nodeId}
            selectedKey={null}
            onSelect={() => {}}
            isLoading={advertisersLoading}
            emptyLabel={topAdvertisers.isError ? "Failed to load" : "No advertisers"}
          />
        </div>
      </Card>
      <ChartCard
        title={<>Top talkers · {range}</>}
        right={<span className="font-mono text-[10px] text-text-muted">by name</span>}
        height={leaderboardHeight(talkerRows.length)}
        option={talkersOption}
        isLoading={talkersLoading}
        isError={topTalkers.isError}
        isEmpty={talkerRows.length === 0}
      />
    </div>
  );
}
