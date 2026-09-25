import { expect, it } from "vitest";
import { scopeSummary, scopeChartOption } from "../../../src/features/stats/scopes";
import { readChartColors } from "../../../src/features/stats/chartTheme";
import i18n from "../../../src/i18n";

it("totals memberships explicitly and bounds charts without dropping the remainder", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ name: `#s${i}`, packetCount: i + 1, observerCount: 2, nodeCount: 1 }));
  const original = JSON.stringify(rows);
  expect(scopeSummary(rows)).toEqual({ active: 20, packets: 210, memberships: 40, nodes: 20 });
  const option = scopeChartOption(rows, "packetCount", readChartColors(), i18n.getFixedT("en"));
  expect(option).toMatchObject({ animation: false, tooltip: { renderMode: "richText" } });
  expect(JSON.stringify(option)).toContain("Other scopes");
  const bars = option as { series: { data: { value: number }[] }[] };
  expect(bars.series[0]!.data.reduce((sum, row) => sum + row.value, 0)).toBe(210);
  expect(JSON.stringify(rows)).toBe(original);
  expect(scopeSummary([])).toEqual({ active: 0, packets: 0, memberships: 0, nodes: 0 });
});

it("translates only the remainder and description for every metric, preserving names, ranking and colors", () => {
  const rows = Array.from({ length: 15 }, (_, i) => ({ name: `#scope${i}`, packetCount: i, observerCount: 15 - i, nodeCount: i % 3 }));
  const before = JSON.stringify(rows), colors = readChartColors();
  for (const metric of ["packetCount", "observerCount", "nodeCount"] as const) {
    const en = scopeChartOption(rows, metric, colors, i18n.getFixedT("en"));
    const fr = scopeChartOption(rows, metric, colors, i18n.getFixedT("fr"));
    const values = (option: typeof fr) => (Array.isArray(option.series) ? option.series : [option.series]).map((series) => series?.data);
    expect(values(fr)).toEqual(values(en));
    const labels = (option: typeof fr) => (option.yAxis as { data: string[] }).data;
    expect(labels(fr).slice(0, 12)).toEqual(labels(en).slice(0, 12));
    expect(labels(en).at(-1)).toBe("Other scopes");
    expect(labels(fr).at(-1)).toBe("Autres scopes");
    expect(fr).toMatchObject({ aria: { label: { description: expect.stringContaining("valeurs exactes") } } });
    const bars = fr as { series: { data: { value: number }[] }[] };
    expect(bars.series[0]!.data.reduce((sum, row) => sum + row.value, 0)).toBe(rows.reduce((sum, row) => sum + row[metric], 0));
  }
  expect(JSON.stringify(rows)).toBe(before);
});
