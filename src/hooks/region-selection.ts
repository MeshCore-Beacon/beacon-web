// Region selection: the geographic filter shared across the app. A selection is a set of region
// slugs (each expands to its member IATAs) plus individually-picked IATA codes. Everything downstream
// — query keys, REST params, WS subscription — works off the resolved, flattened IATA list, so these
// helpers are the single place that knows how a selection becomes a list of IATAs and a URL.

export interface RegionSelection {
  regions: string[]; // region slugs, e.g. "western-canada"
  iatas: string[]; // individual IATA codes, e.g. "YVR"
}

// The empty selection means "all regions" — no server-side filter.
export const ALL_REGIONS: RegionSelection = { regions: [], iatas: [] };

export function isAllRegions(s: RegionSelection): boolean {
  return s.regions.length === 0 && s.iatas.length === 0;
}

// Flatten a selection to the sorted, deduped IATA codes to query. Region slugs are expanded via
// regionIatas (slug → member codes); a slug missing from the map (details not loaded yet) contributes
// nothing. Returns undefined for an empty selection so callers can treat it as "no filter".
export function resolveIatas(
  selection: RegionSelection,
  regionIatas: ReadonlyMap<string, string[]>,
): string[] | undefined {
  if (isAllRegions(selection)) return undefined;
  const set = new Set<string>();
  for (const slug of selection.regions) {
    for (const code of regionIatas.get(slug) ?? []) set.add(code);
  }
  for (const code of selection.iatas) set.add(code);
  if (set.size === 0) return undefined;
  return [...set].sort();
}

// Stable query-key fragment for a resolved IATA list. "*" stands in for "all regions".
export function regionKey(iatas: string[] | undefined): string {
  return iatas && iatas.length > 0 ? iatas.join(",") : "*";
}

function splitCsv(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Read a selection from URL params. ?iata is a comma-separated IATA list, ?regions a slug list. A
// legacy single ?region is folded in as an IATA so old shared links (?region=YVR) keep working.
export function parseSelection(params: URLSearchParams): RegionSelection {
  const regions = splitCsv(params.get("regions"));
  const iatas = splitCsv(params.get("iata")).map((c) => c.toUpperCase());
  const legacy = params.get("region")?.trim();
  if (legacy) iatas.push(legacy.toUpperCase());
  return { regions, iatas };
}

// Apply a selection onto a copy of the given params: set ?iata/?regions (or drop them when empty) and
// always clear the legacy ?region. Unrelated params are left untouched.
export function selectionToParams(selection: RegionSelection, base: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(base);
  if (selection.iatas.length > 0) next.set("iata", selection.iatas.join(","));
  else next.delete("iata");
  if (selection.regions.length > 0) next.set("regions", selection.regions.join(","));
  else next.delete("regions");
  next.delete("region");
  return next;
}

export function serializeSelection(selection: RegionSelection): string {
  return JSON.stringify(selection);
}

// Parse a stored selection, tolerating anything malformed by falling back to all-regions.
export function deserializeSelection(raw: string | null): RegionSelection {
  if (!raw) return ALL_REGIONS;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      Array.isArray(parsed.regions) &&
      Array.isArray(parsed.iatas) &&
      parsed.regions.every((r: unknown) => typeof r === "string") &&
      parsed.iatas.every((i: unknown) => typeof i === "string")
    ) {
      return { regions: parsed.regions, iatas: parsed.iatas };
    }
  } catch {
    // fall through
  }
  return ALL_REGIONS;
}
