import { expect, it } from "vitest";
import { scopeSummary, scopeChartOption } from "../../../src/features/stats/scopes";
import { readChartColors } from "../../../src/features/stats/chartTheme";

it("totals memberships explicitly and bounds charts without dropping the remainder", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ name: `#s${i}`, packetCount: i + 1, observerCount: 2, nodeCount: 1 }));
  const original = JSON.stringify(rows);
  expect(scopeSummary(rows)).toEqual({ active: 20, packets: 210, memberships: 40, nodes: 20 });
  const option = scopeChartOption(rows, "packetCount", readChartColors());
  expect(option).toMatchObject({ animation: false, tooltip: { renderMode: "richText" } });
  expect(JSON.stringify(option)).toContain("Other scopes");
  const bars = option as { series: { data: { value: number }[] }[] };
  expect(bars.series[0]!.data.reduce((sum, row) => sum + row.value, 0)).toBe(210);
  expect(JSON.stringify(rows)).toBe(original);
  expect(scopeSummary([])).toEqual({ active: 0, packets: 0, memberships: 0, nodes: 0 });
});
