import type { SubscriptionFilter, WsServerMessage, WsPacketObservation, WsLagged, WsChannelMessage, WsObserverStatus, WsNodeUpdate } from "../types/ws";
import {
  WS_PING_INTERVAL_MS,
  WS_RECONNECT_BASE_MS,
  WS_RECONNECT_MAX_MS,
  WS_RECONNECT_JITTER,
} from "../lib/constants";

// handler types and status

export type WsStatus = "connected" | "connecting" | "disconnected" | "error";

type PacketHandler = (data: WsPacketObservation["data"]) => void;
type LaggedHandler = (data: WsLagged) => void;
type ChannelMessageHandler = (data: WsChannelMessage["data"]) => void;
type ObserverStatusHandler = (data: WsObserverStatus["data"]) => void;
type NodeUpdateHandler = (data: WsNodeUpdate["data"]) => void;
type StatusHandler = (status: WsStatus) => void;

export class WsManager {
  private ws: WebSocket | null = null;
  private url: string;
  private filter: SubscriptionFilter | null = null;
  private subscriptionId: string | null = null;
  private status: WsStatus = "disconnected";
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private msgCounter = 0;
  private lastEventTimestamp: number = Date.now();

  private packetHandlers: PacketHandler[] = [];
  private laggedHandlers: LaggedHandler[] = [];
  private channelMessageHandlers: ChannelMessageHandler[] = [];
  private observerStatusHandlers: ObserverStatusHandler[] = [];
  private nodeUpdateHandlers: NodeUpdateHandler[] = [];
  private statusHandlers: StatusHandler[] = [];

  constructor(url: string) {
    this.url = url;
  }

  getStatus(): WsStatus {
    return this.status;
  }

  getLastEventTimestamp(): number {
    return this.lastEventTimestamp;
  }

  onPacketObservation(handler: PacketHandler): () => void {
    this.packetHandlers.push(handler);
    return () => {
      this.packetHandlers = this.packetHandlers.filter((h) => h !== handler);
    };
  }

  onLagged(handler: LaggedHandler): () => void {
    this.laggedHandlers.push(handler);
    return () => {
      this.laggedHandlers = this.laggedHandlers.filter((h) => h !== handler);
    };
  }

  onChannelMessage(handler: ChannelMessageHandler): () => void {
    this.channelMessageHandlers.push(handler);
    return () => {
      this.channelMessageHandlers = this.channelMessageHandlers.filter((h) => h !== handler);
    };
  }

  onObserverStatus(handler: ObserverStatusHandler): () => void {
    this.observerStatusHandlers.push(handler);
    return () => {
      this.observerStatusHandlers = this.observerStatusHandlers.filter((h) => h !== handler);
    };
  }

  onNodeUpdate(handler: NodeUpdateHandler): () => void {
    this.nodeUpdateHandlers.push(handler);
    return () => {
      this.nodeUpdateHandlers = this.nodeUpdateHandlers.filter((h) => h !== handler);
    };
  }

  onStatusChange(handler: StatusHandler): () => void {
    this.statusHandlers.push(handler);
    return () => {
      this.statusHandlers = this.statusHandlers.filter((h) => h !== handler);
    };
  }

  // connection lifecycle

  connect(filter: SubscriptionFilter): void {
    this.filter = filter;
    this.doConnect();
  }

  updateSubscription(filter: SubscriptionFilter): void {
    this.filter = filter;

    if (this.ws?.readyState !== WebSocket.OPEN) return;

    if (this.subscriptionId) {
      this.send({ v: 1, type: "unsubscribe", id: `unsub-${this.nextId()}`, subscriptionId: this.subscriptionId });
      this.subscriptionId = null;
    }

    this.sendSubscribe();
  }

  disconnect(): void {
    this.clearTimers();
    this.ws?.close();
    this.ws = null;
    this.setStatus("disconnected");
  }

  // exponential backoff w/ jitter to avoid thundering herd on reconnect

  private doConnect(): void {
    this.clearTimers();
    this.setStatus("connecting");

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
    };

    this.ws.onmessage = (e: MessageEvent) => {
      let msg: WsServerMessage;
      try {
        msg = JSON.parse(e.data as string) as WsServerMessage;
      } catch {
        // FIXME: should probably log parse failures somewhere
        return;
      }
      this.handleMessage(msg);
    };

    this.ws.onclose = (e: CloseEvent) => {
      this.clearTimers();
      if (e.code === 1000) {
        this.setStatus("disconnected");
        return;
      }
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.setStatus("error");
    };
  }

  private handleMessage(msg: WsServerMessage): void {
    switch (msg.type) {
      case "hello":
        this.setStatus("connected");
        this.startPing();
        this.sendSubscribe();
        break;

      case "subscribed":
        this.subscriptionId = msg.subscriptionId;
        break;

      case "pong":
        break;

      case "event":
        this.lastEventTimestamp = Date.now();
        if (msg.event === "packetObservation") {
          for (const handler of this.packetHandlers) {
            handler(msg.data);
          }
        } else if (msg.event === "channelMessage") {
          for (const handler of this.channelMessageHandlers) {
            handler(msg.data);
          }
        } else if (msg.event === "observerStatus") {
          for (const handler of this.observerStatusHandlers) {
            handler(msg.data);
          }
        } else if (msg.event === "nodeUpdate") {
          for (const handler of this.nodeUpdateHandlers) {
            handler(msg.data);
          }
        }
        break;

      case "lagged":
        for (const handler of this.laggedHandlers) {
          handler(msg);
        }
        break;

      case "error":
        break;
    }
  }

  private sendSubscribe(): void {
    if (!this.filter) return;
    this.send({
      v: 1,
      type: "subscribe",
      id: `sub-${this.nextId()}`,
      scope: this.filter,
    });
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      this.send({ v: 1, type: "ping", id: `p-${this.nextId()}` });
    }, WS_PING_INTERVAL_MS);
  }

  private scheduleReconnect(): void {
    this.setStatus("connecting");
    const base = Math.min(WS_RECONNECT_BASE_MS * 2 ** this.reconnectAttempt, WS_RECONNECT_MAX_MS);
    const jitter = base * WS_RECONNECT_JITTER * (Math.random() * 2 - 1);
    const delay = Math.max(base + jitter, 100);
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      this.doConnect();
    }, delay);
  }

  // internal helpers

  private send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private nextId(): number {
    return ++this.msgCounter;
  }

  private setStatus(status: WsStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const handler of this.statusHandlers) {
      handler(status);
    }
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
