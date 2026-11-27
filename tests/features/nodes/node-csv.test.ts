import { expect, it } from "vitest";
import { nodeCsv } from "../../../src/features/nodes/node-csv";
import type { NodeSummary } from "../../../src/features/nodes/types";
const node: NodeSummary = { id: "one", publicKey: "aa".repeat(32), name: "Name", nodeType: 2, nodeTypeName: "repeater", lat: 0, lng: -80.5, iatas: [{ iata: "YKF", lastHeard: 0 }], knownNeighborCount: 0, isObserver: false };

it("keeps missing values blank, real zeros/negative coordinates, Unicode and quoted multiline text", () => {
  const csv = nodeCsv([{ ...node, name: 'Répeté, "test"\nnext', radio: undefined }]);
  expect(csv).toContain('"Répeté, ""test""\nnext"');
  expect(csv).toContain('"0","-80.5",');
  expect(csv).toContain('"0","false","false",""');
  expect(csv.startsWith("\uFEFF")).toBe(true);
  expect(csv.endsWith("\r\n")).toBe(true);
});
it.each(["=SUM(1)", "+command", "-command", "@command", " \t=command", "\ttext"])("neutralizes spreadsheet formulas in supplied text: %s", name => {
  expect(nodeCsv([{ ...node, name }])).toContain(`"'${name}"`);
});
it("exports only supplied rows and uses stable UTC times without inventing missing readings", () => {
  const csv = nodeCsv([{ ...node, lastSeen: 0 }, { ...node, id: "two", lat: NaN, lastSeen: Infinity }]);
  expect(csv).toContain("1970-01-01T00:00:00.000Z");
  expect(csv).not.toMatch(/NaN|Infinity|undefined/);
  expect(csv.split("\r\n")).toHaveLength(4);
});
it("puts is_poller after is_observer and carries the value", () => {
  const [header, row] = nodeCsv([{ ...node, isPoller: true }]).replace("\uFEFF", "").split("\r\n");
  expect(header).toContain('"is_observer","is_poller","last_heard_utc"');
  expect(row).toContain('"false","true",""');
});
