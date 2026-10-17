import type { ChannelMessage } from "../channels/types";
import type { WsPacketObservation } from "../../types/ws";
import type { Topology } from "./topology";

export const CHAT_MS = 8_000;
export type ChatBubble = { hash: string; sender: string; content: string; nodeId: string; at: number; heardAt: number };
type Pending = { at: number; message?: ChannelMessage; nodeId?: string; heardAt?: number };
// eslint-disable-next-line no-control-regex -- strip control bytes from untrusted display text
const clean = (value: string, limit: number) => value.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").slice(0, limit);

// Join the two existing live events in either arrival order. Never fetch a packet
// per message, infer an identity from its sender text, or replay channel history.
export class LiveChatter {
  private pending = new Map<string, Pending>();
  private entry(hash: string, now: number) {
    let entry = this.pending.get(hash);
    if (!entry) {
      entry = { at: now }; this.pending.set(hash, entry);
      if (this.pending.size > 128) this.pending.delete(this.pending.keys().next().value!);
    }
    return entry;
  }
  message(message: ChannelMessage, now: number) {
    // A server-confirmed decryption key, not the collidable one-byte channel hash/name.
    if (message.isPublic !== true || !message.packetHash || typeof message.content !== "string" || !message.content.trim()) return;
    this.entry(message.packetHash, now).message = message;
  }
  observe(event: WsPacketObservation["data"], graph: Topology, now: number) {
    if (event?.packet?.payloadType !== 5 || !event.packetHash || !Number.isFinite(event.observation?.heardAt)) return;
    const observer = graph.nodes.find(n => n.observerId === event.observation.observerId);
    const first = event.observation.resolvedPath?.[0];
    const relay = (event.packet.routeType === 0 || event.packet.routeType === 1) && first?.confidence === "high" && first.nodes.length === 1 ? graph.byId.get(first.nodes[0]!.id) : undefined;
    const node = observer ?? relay;
    if (!node) return;
    const entry = this.entry(event.packetHash, now);
    if (entry.heardAt == null || event.observation.heardAt < entry.heardAt) {
      entry.nodeId = node.id; entry.heardAt = event.observation.heardAt;
    }
  }
  visible(now: number): ChatBubble[] {
    const bubbles: ChatBubble[] = [];
    for (const [hash, entry] of this.pending) {
      if (now - entry.at > 30_000) { this.pending.delete(hash); continue; }
      if (!entry.message || !entry.nodeId || now - entry.at < 600 || now - entry.at >= CHAT_MS) continue;
      bubbles.push({ hash, sender: clean(entry.message.senderName || "?", 40), content: clean(entry.message.content, 180), nodeId: entry.nodeId, at: entry.at, heardAt: entry.heardAt! });
    }
    return bubbles;
  }
  clear() { this.pending.clear(); }
}
