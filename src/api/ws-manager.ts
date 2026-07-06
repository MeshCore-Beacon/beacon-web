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
  // connection-wide toggle for resolvedPath on packetObservation events; survives reconnect (like
  // filter), re-applied on each hello. Default off keeps the event payload small.
  private resolvePath = false;
  private subscriptionId: string | null = null;
  private lastSubscribeId: string | null = null;
  private everConnected = false;
  private status: WsStatus = "disconnected";
  private reconnectAttempt = 0;
  private intentionalClose = false;
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

  // Enable/disable per-hop resolvedPath data on packetObservation events for the whole connection.
  // Stored so it re-applies after a reconnect; sent immediately when the socket is already open.
  setResolvePath(enabled: boolean): void {
    if (this.resolvePath === enabled) return;
    this.resolvePath = enabled;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendConfigure();
    }
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.reconnectAttempt = 0;
    this.clearTimers();
    this.teardownSocket();
    this.subscriptionId = null;
    this.lastSubscribeId = null;
    this.setStatus("disconnected");
  }

  // exponential backoff w/ jitter to avoid thundering herd on reconnect

  private doConnect(): void {
    this.intentionalClose = false;
    this.clearTimers();
    // a previous socket must not keep firing handlers (StrictMode remounts, forced reconnects)
    this.teardownSocket();
    this.subscriptionId = null; // subscription ids are per-connection
    this.lastSubscribeId = null;
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

    this.ws.onclose = () => {
      this.clearTimers();
      if (this.intentionalClose) {
        this.setStatus("disconnected");
        return;
      }
      // any unexpected close — including a server-sent 1000 — gets a reconnect
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.setStatus("error");
    };
  }

  private handleMessage(msg: WsServerMessage): void {
    switch (msg.type) {
      case "hello": {
        const isReconnect = this.everConnected;
        this.everConnected = true;
        this.setStatus("connected");
        this.startPing();
        this.sendSubscribe();
        if (this.resolvePath) this.sendConfigure(); // re-apply the connection-wide toggle
        if (isReconnect) {
          // we were dark during the outage — synthesize a lag notice so live views heal the gap
          const notice: WsLagged = { v: 1, type: "lagged", droppedCount: 0, since: this.lastEventTimestamp };
          for (const handler of this.laggedHandlers) {
            handler(notice);
          }
        }
        break;
      }

      case "subscribed":
        if (msg.id === this.lastSubscribeId) {
          this.subscriptionId = msg.subscriptionId;
        } else {
          // ack for a subscribe we've since replaced — drop the server-side sub it created
          this.send({ v: 1, type: "unsubscribe", id: `unsub-${this.nextId()}`, subscriptionId: msg.subscriptionId });
        }
        break;

      case "configured":
        // ack for our resolvePath toggle; nothing to do beyond the server now honoring it
        break;

      case "pong":
        // a pong proves the link is alive, so it counts as recent activity
        this.lastEventTimestamp = Date.now();
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
        // a lag notice is still server traffic, so it counts as recent activity
        this.lastEventTimestamp = Date.now();
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
    const id = `sub-${this.nextId()}`;
    this.lastSubscribeId = id;
    this.send({
      v: 1,
      type: "subscribe",
      id,
      scope: this.filter,
    });
  }

  private sendConfigure(): void {
    this.send({ v: 1, type: "configure", id: `cfg-${this.nextId()}`, resolvePath: this.resolvePath });
  }

  private startPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer); // a second hello must not double the interval
    this.pingTimer = setInterval(() => {
      if (Date.now() - this.lastEventTimestamp > WS_PING_INTERVAL_MS * 2 + 5_000) {
        // pongs stopped coming back — the link is half-open, rebuild it
        this.forceReconnect();
        return;
      }
      this.send({ v: 1, type: "ping", id: `p-${this.nextId()}` });
    }, WS_PING_INTERVAL_MS);
  }

  private forceReconnect(): void {
    this.clearTimers();
    this.teardownSocket();
    this.subscriptionId = null;
    this.lastSubscribeId = null;
    this.scheduleReconnect();
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

  private teardownSocket(): void {
    const ws = this.ws;
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    try {
      ws.close();
    } catch {
      // already closed
    }
    this.ws = null;
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
