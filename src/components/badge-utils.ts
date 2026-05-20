// variant styles for badge colors

export type BadgeVariant = "advert" | "text" | "trace" | "ack" | "group" | "request" | "default" | "live" | "stale" | "offline";

export const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  advert: "bg-green/8 text-green border-green/12",
  text: "bg-primary/6 text-primary border-primary/12",
  trace: "bg-warn/7 text-warn border-warn/12",
  ack: "bg-text-muted/10 text-text-muted border-text-muted/12",
  group: "bg-secondary/6 text-secondary border-secondary/12",
  request: "bg-warn/7 text-warn border-warn/12",
  default: "bg-text-muted/10 text-text-muted border-text-muted/12",
  live: "bg-green/8 text-green border-green/15",
  stale: "bg-warn/7 text-warn border-warn/15",
  offline: "bg-danger/8 text-danger border-danger/15",
};

// maps MeshCore payload type codes to badge variants

const PAYLOAD_TYPE_TO_VARIANT: Record<number, BadgeVariant> = {
  0x00: "request",
  0x01: "request",
  0x02: "text",
  0x03: "ack",
  0x04: "advert",
  0x05: "group",
  0x06: "group",
  0x07: "request",
  0x08: "default",
  0x09: "trace",
  0x0a: "default",
  0x0f: "default",
};

export function payloadTypeVariant(payloadType: number): BadgeVariant {
  return PAYLOAD_TYPE_TO_VARIANT[payloadType] ?? "default";
}
