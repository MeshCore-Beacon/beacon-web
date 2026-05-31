// The canonical MeshCore device types: server `nodeTypeName` plus a singular UI label, in display
// order. Everything else derives from this list — the map icons, the icon `match` expression, and the
// type filters on both tabs — so the names, labels, and order can't drift apart.
export const NODE_TYPES = [
  { name: "companion", label: "Companion" },
  { name: "repeater", label: "Repeater" },
  { name: "room_server", label: "Room" },
  { name: "sensor", label: "Sensor" },
] as const;

export type NodeTypeName = (typeof NODE_TYPES)[number]["name"];

export const NODE_TYPE_NAMES = NODE_TYPES.map((t) => t.name) as NodeTypeName[];

// {value, label} options for the type-filter controls ("" = All is added by callers).
export const NODE_TYPE_OPTIONS: { value: string; label: string }[] = NODE_TYPES.map((t) => ({
  value: t.name,
  label: t.label,
}));
