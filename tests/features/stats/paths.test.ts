import { describe, expect, it } from "vitest";
import { pathHours, pathLengthOption, pathTrendOption } from "../../../src/features/stats/paths";
import { readChartColors } from "../../../src/features/stats/chartTheme";
import type { PathStats } from "../../../src/features/stats/types";
import i18n from "../../../src/i18n";

const hour = 3_600_000;
const fixture: PathStats = { since: hour / 2, until: 3 * hour, receptions: 10, hashed: 6, empty: 2, trace: 1, unclassified: 1,
  hashWidths: [{ bytes: 1, receptions: 2 }, { bytes: 2, receptions: 3 }, { bytes: 3, receptions: 1 }],
  pathLengths: [{ entries: 0, receptions: 2 }, { entries: 2, receptions: 5 }, { entries: 63, receptions: 1 }],
  hourly: [{ hour: 0, receptions: 8, oneByte: 2, twoByte: 3, threeByte: 1, empty: 1, trace: 1, unclassified: 0 }, { hour: 2 * hour, receptions: 2, oneByte: 0, twoByte: 0, threeByte: 0, empty: 1, trace: 0, unclassified: 1 }] };

describe("path analytics charts", () => {
  it("keeps absent hours distinct from known zero hash-path hours and preserves response values", () => {
    const before = JSON.stringify(fixture), hours = pathHours(fixture);
    expect(hours.map((h) => h.hour)).toEqual([0, hour, 2 * hour]);
    expect(hours.map((h) => h.oneByte)).toEqual([2, null, 0]);
    expect(hours.map((h) => h.twoByte)).toEqual([3, null, 0]);
    expect(JSON.stringify(fixture)).toBe(before);
    expect(pathHours(undefined)).toEqual([]);
    expect(pathHours({ ...fixture, until: 30 * 24 * hour + hour / 2 })).toHaveLength(721);
  });
  it("fills zero-count length bins while preserving empty-path counts and visible single-hour points", () => {
    const c = readChartColors();
    const length = pathLengthOption(fixture.pathLengths, c, i18n.getFixedT("en"));
    expect(length).toMatchObject({ animation: false, tooltip: { renderMode: "richText" }, aria: { enabled: true } });
    const option = length as { xAxis: { data: number[] }; series: { data: { value: number }[] }[] };
    expect(option.xAxis.data).toHaveLength(64);
    expect(option.series[0]!.data[0]!.value).toBe(2);
    expect(option.series[0]!.data[1]!.value).toBe(0);
    expect(option.series[0]!.data.reduce((n, d) => n + d.value, 0)).toBe(8);
    expect(pathTrendOption(pathHours(fixture), c, i18n.getFixedT("en"))).toMatchObject({ animation: false, useUTC: true, legend: { top: 0 }, series: [{ connectNulls: false, showSymbol: true, data: [[0, 2], [hour, null], [2 * hour, 0]] }, { data: [[0, 3], [hour, null], [2 * hour, 0]] }, { data: [[0, 1], [hour, null], [2 * hour, 0]] }] });
  });

  it("translates chart descriptions and width labels without changing numerical data or gaps", () => {
    const c = readChartColors(), hours = pathHours(fixture);
    const en = i18n.getFixedT("en"), fr = i18n.getFixedT("fr");
    const before = pathTrendOption(hours, c, en), after = pathTrendOption(hours, c, fr);
    expect(after).toMatchObject({ useUTC: true, aria: { label: { description: expect.stringContaining("lacunes") } }, series: [
      { name: "1 octet", connectNulls: false, data: [[0, 2], [hour, null], [2 * hour, 0]] },
      { name: "2 octets", data: [[0, 3], [hour, null], [2 * hour, 0]] },
      { name: "3 octets", data: [[0, 1], [hour, null], [2 * hour, 0]] },
    ] });
    const data = (option: typeof before) => (Array.isArray(option.series) ? option.series : [option.series]).map((series) => series?.data);
    expect(data(after)).toEqual(data(before));
    const length = pathLengthOption(fixture.pathLengths, c, fr);
    expect(length).toMatchObject({ xAxis: { name: "Entrées du chemin" }, series: [{ name: "Réceptions" }], aria: { label: { description: expect.stringContaining("Zéro") } } });
    expect(data(length)).toEqual(data(pathLengthOption(fixture.pathLengths, c, en)));
  });
});
