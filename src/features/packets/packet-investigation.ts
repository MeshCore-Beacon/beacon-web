import type { Observation } from "../../types/api";

export interface ReportGroup {
  key: string;
  kind: "path" | "empty" | "unavailable";
  hashes: string[];
  reports: Observation[];
}

// Equal prefixes describe equal recorded bytes, not proof of the same physical route.
export function groupPacketReports(reports: Observation[]): ReportGroup[] {
  const groups = new Map<string, ReportGroup>();
  for (const report of [...reports].sort((a, b) => a.heardAt - b.heardAt || a.id - b.id)) {
    const width = report.pathLength?.hashSize;
    const count = report.pathLength?.hopCount;
    const raw = (report.pathBytes ?? "").toUpperCase();
    const valid = [1, 2, 3].includes(width) && Number.isInteger(count) && count >= 0 && raw.length === width * count * 2 && /^[0-9A-F]*$/.test(raw);
    const kind = !valid ? "unavailable" : count === 0 ? "empty" : "path";
    const key = valid ? `${width}:${count}:${raw}` : `unavailable:${report.id}`;
    let group = groups.get(key);
    if (!group) {
      const hashes: string[] = [];
      if (valid) for (let i = 0; i < raw.length; i += width * 2) hashes.push(raw.slice(i, i + width * 2));
      group = { key, kind, hashes, reports: [] }; groups.set(key, group);
    }
    group.reports.push(report);
  }
  return [...groups.values()];
}

export function reportSelection(reports: Observation[], params: URLSearchParams, fallback: number | null) {
  const requested = params.get("observation");
  if (requested != null) {
    const id = Number(requested);
    const selected = params.getAll("observation").length === 1 && /^[1-9]\d*$/.test(requested) && Number.isSafeInteger(id) ? reports.find(o => o.id === id) ?? null : null;
    return { selected, unavailable: selected == null };
  }
  return { selected: reports.find(o => o.id === fallback) ?? reports[0] ?? null, unavailable: false };
}
