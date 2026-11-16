import { hasMapLocation } from "../map/location";
import type { NodeSummary } from "./types";

// Contact-file field schema used by CoreScope's public/nodes-export.js:
// https://github.com/Kpa-clawbot/CoreScope/blob/d80ce90976d5ca7e31c270badda58187100a8af8/public/nodes-export.js
// Independently implemented for Beacon; this is not a signed meshcore:// advert.
export function nodeContacts(nodes: readonly NodeSummary[]) {
  const seen = new Set<string>();
  const contacts = [];
  for (const node of nodes) {
    if (!node || typeof node.name !== "string" || !node.name.trim()
      || typeof node.publicKey !== "string" || !/^[a-f\d]{64}$/i.test(node.publicKey)
      || !Number.isInteger(node.nodeType) || node.nodeType < 1 || node.nodeType > 4
      || !hasMapLocation(node)) continue;
    const key = node.publicKey.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    contacts.push({
      type: node.nodeType,
      name: node.name.trim(),
      custom_name: null,
      public_key: key,
      flags: 0,
      latitude: String(node.lat),
      longitude: String(node.lng),
      // lastSeen is a hearing time, not an advert/contact-modification time.
      last_advert: 0,
      last_modified: 0,
      out_path_list: null,
    });
  }
  return { file: { contacts }, skipped: nodes.length - contacts.length };
}

export function downloadNodeContacts(file: ReturnType<typeof nodeContacts>["file"]) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `beacon-contacts-loaded-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  try { link.click(); } finally { setTimeout(() => URL.revokeObjectURL(url), 1_000); }
}
