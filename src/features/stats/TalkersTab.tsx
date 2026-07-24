import { useMemo } from "react";
import { useChartColors } from "./chartTheme";
import { useTopTalkers } from "./useStats";
import { leaderboardOption } from "./chartOptions";
import { ChartCard } from "./cards";
import type { StatsRange } from "./types";

interface TalkersTabProps {
  range: StatsRange;
}

// Top talkers by decrypted channel-message count. Grouped by sender display-name (see TopTalker),
// hence the "by name" caption — its own tab so the leaderboard can breathe and later grow.
export function TalkersTab({ range }: TalkersTabProps) {
  const colors = useChartColors();
  const topTalkers = useTopTalkers(range, 20);

  const rows = useMemo(
    () => (topTalkers.data ?? []).map((t) => ({ name: t.senderName, value: t.messageCount, color: colors.secondary })),
    [topTalkers.data, colors],
  );
  const option = useMemo(() => leaderboardOption(rows, colors), [rows, colors]);
  // grow with the roster so bars stay readable; a floor keeps the loading/empty state from collapsing
  const height = Math.max(260, rows.length * 34 + 24);

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-3.5 px-4 py-4">
      <ChartCard
        title={<>Top talkers · {range}</>}
        right={<span className="font-mono text-[10px] text-text-muted">by name</span>}
        height={height}
        option={option}
        isLoading={topTalkers.isLoading}
        isError={topTalkers.isError}
        isEmpty={rows.length === 0}
      />
    </div>
  );
}
