import type { NodeSummary } from "./types";

function cell(value: string | number | boolean | null | undefined): string {
  if (value == null || (typeof value === "number" && !Number.isFinite(value))) return "";
  let text = String(value);
  // Names and other radio-supplied text must stay text when opened in a spreadsheet.
  if (typeof value === "string" && (/^[\s\uFEFF]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text))) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function nodeCsv(nodes: readonly NodeSummary[]): string {
  const rows: (string | number | boolean | null | undefined)[][] = [[
    "id", "public_key", "name", "type", "latitude", "longitude", "radio",
    "matched_scope", "heard_areas", "known_neighbors", "is_observer", "last_heard_utc",
  ]];
  for (const node of nodes) {
    const date = new Date(node.lastSeen ?? NaN);
    rows.push([node.id, node.publicKey, node.name, node.nodeTypeName, node.lat, node.lng,
      node.radio, node.defaultScope, (node.iatas ?? []).map(i => i.iata).join(";"),
      node.knownNeighborCount, node.isObserver, Number.isNaN(date.valueOf()) ? "" : date.toISOString()]);
  }
  return "\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function downloadNodeCsv(nodes: readonly NodeSummary[]): void {
  const url = URL.createObjectURL(new Blob([nodeCsv(nodes)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `beacon-loaded-nodes-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
