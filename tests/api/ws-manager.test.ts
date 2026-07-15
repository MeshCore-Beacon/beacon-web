import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WsManager } from "../../src/api/ws-manager";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;
  static CONNECTING = 0;
  static CLOSING = 2;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  }

  simulateOpen() {
    this.readyState = 1;
    this.onopen?.();
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateClose(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("WsManager", () => {
  it("connects and sends subscribe on hello", () => {
    const mgr = new WsManager("ws://test/ws");
    mgr.connect({ iatas: ["YOW"] });

    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateMessage({ v: 1, type: "hello", serverTime: 123, connectionId: "abc" });

    expect(ws.sent).toHaveLength(1);
    const sub = JSON.parse(ws.sent[0]!);
    expect(sub.type).toBe("subscribe");
    expect(sub.scope.iatas).toEqual(["YOW"]);
  });

  it("exposes connected status after hello", () => {
    const mgr = new WsManager("ws://test/ws");
    expect(mgr.getStatus()).toBe("disconnected");

    mgr.connect({ iatas: ["YOW"] });
    expect(mgr.getStatus()).toBe("connecting");

    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateMessage({ v: 1, type: "hello", serverTime: 123, connectionId: "abc" });
    expect(mgr.getStatus()).toBe("connected");
  });

  it("calls packet handler on packetObservation event", () => {
    const handler = vi.fn();
    const mgr = new WsManager("ws://test/ws");
    mgr.onPacketObservation(handler);
    mgr.connect({ iatas: ["YOW"] });

    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateMessage({ v: 1, type: "hello", serverTime: 123, connectionId: "abc" });
    ws.simulateMessage({
      v: 1,
      type: "event",
      event: "packetObservation",
      data: { packetHash: "abc123", packet: {}, observation: {} },
    });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]![0].packetHash).toBe("abc123");
  });

  it("reconnects with jittered backoff on unexpected close", () => {
    const mgr = new WsManager("ws://test/ws");
    mgr.connect({ iatas: ["YOW"] });

    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateMessage({ v: 1, type: "hello", serverTime: 123, connectionId: "abc" });
    ws.simulateClose(1006);

    expect(mgr.getStatus()).toBe("connecting");
    expect(MockWebSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(1500);
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it("resubscribes on reconnect", () => {
    const mgr = new WsManager("ws://test/ws");
    mgr.connect({ iatas: ["YOW"] });

    const ws1 = MockWebSocket.instances[0]!;
    ws1.simulateOpen();
    ws1.simulateMessage({ v: 1, type: "hello", serverTime: 123, connectionId: "abc" });
    ws1.simulateClose(1006);

    vi.advanceTimersByTime(1500);
    const ws2 = MockWebSocket.instances[1]!;
    ws2.simulateOpen();
    ws2.simulateMessage({ v: 1, type: "hello", serverTime: 456, connectionId: "def" });

    const sub = JSON.parse(ws2.sent[0]!);
    expect(sub.type).toBe("subscribe");
    expect(sub.scope.iatas).toEqual(["YOW"]);
  });

  it("sends a configure frame when resolvePath is enabled while connected", () => {
    const mgr = new WsManager("ws://test/ws");
    mgr.connect({ iatas: ["YOW"] });

    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateMessage({ v: 1, type: "hello", serverTime: 123, connectionId: "abc" });

    mgr.setResolvePath(true);

    const configure = JSON.parse(ws.sent.at(-1)!);
    expect(configure.type).toBe("configure");
    expect(configure.resolvePath).toBe(true);
  });

  it("re-sends the resolvePath configure after a reconnect", () => {
    const mgr = new WsManager("ws://test/ws");
    mgr.connect({ iatas: ["YOW"] });

    const ws1 = MockWebSocket.instances[0]!;
    ws1.simulateOpen();
    ws1.simulateMessage({ v: 1, type: "hello", serverTime: 123, connectionId: "abc" });
    mgr.setResolvePath(true);
    ws1.simulateClose(1006);

    vi.advanceTimersByTime(1500);
    const ws2 = MockWebSocket.instances[1]!;
    ws2.simulateOpen();
    ws2.simulateMessage({ v: 1, type: "hello", serverTime: 456, connectionId: "def" });

    const frames = ws2.sent.map((s) => JSON.parse(s));
    expect(frames.some((f) => f.type === "configure" && f.resolvePath === true)).toBe(true);
  });

  it("handles a configured reply without throwing", () => {
    const mgr = new WsManager("ws://test/ws");
    mgr.connect({ iatas: ["YOW"] });

    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateMessage({ v: 1, type: "hello", serverTime: 123, connectionId: "abc" });

    expect(() =>
      ws.simulateMessage({ v: 1, type: "configured", id: "cfg-1", resolvePath: true }),
    ).not.toThrow();
  });

  it("updates subscription without reconnecting", () => {
    const mgr = new WsManager("ws://test/ws");
    mgr.connect({ iatas: ["YOW"] });

    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateMessage({ v: 1, type: "hello", serverTime: 123, connectionId: "abc" });
    ws.simulateMessage({ v: 1, type: "subscribed", id: "sub-1", subscriptionId: "s-1" });

    mgr.updateSubscription({ iatas: ["SEA"] });

    expect(MockWebSocket.instances).toHaveLength(1);
    const unsub = JSON.parse(ws.sent[1]!);
    expect(unsub.type).toBe("unsubscribe");
    const newSub = JSON.parse(ws.sent[2]!);
    expect(newSub.scope.iatas).toEqual(["SEA"]);
  });

  it("fires status listeners on state changes", () => {
    const listener = vi.fn();
    const mgr = new WsManager("ws://test/ws");
    mgr.onStatusChange(listener);
    mgr.connect({ iatas: ["YOW"] });

    expect(listener).toHaveBeenCalledWith("connecting");

    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateMessage({ v: 1, type: "hello", serverTime: 123, connectionId: "abc" });

    expect(listener).toHaveBeenCalledWith("connected");
  });

  it("calls lagged handler on lagged message", () => {
    const handler = vi.fn();
    const mgr = new WsManager("ws://test/ws");
    mgr.onLagged(handler);
    mgr.connect({ iatas: ["YOW"] });

    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateMessage({ v: 1, type: "hello", serverTime: 123, connectionId: "abc" });
    ws.simulateMessage({ v: 1, type: "lagged", droppedCount: 47, since: 100, lastObservationId: 12340 });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]![0].droppedCount).toBe(47);
  });

  it("refreshes the last-event timestamp on lagged and pong messages", () => {
    const mgr = new WsManager("ws://test/ws");
    mgr.connect({ iatas: ["YOW"] });

    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateMessage({ v: 1, type: "hello", serverTime: 123, connectionId: "abc" });

    const baseline = mgr.getLastEventTimestamp();

    // a lag notice is still server traffic and should reset the stale timer
    vi.advanceTimersByTime(5000);
    ws.simulateMessage({ v: 1, type: "lagged", droppedCount: 1, since: 0, lastObservationId: 0 });
    const afterLagged = mgr.getLastEventTimestamp();
    expect(afterLagged).toBeGreaterThan(baseline);

    // so should a heartbeat pong
    vi.advanceTimersByTime(5000);
    ws.simulateMessage({ v: 1, type: "pong", id: "p-1" });
    expect(mgr.getLastEventTimestamp()).toBeGreaterThan(afterLagged);
  });

  it("dispatches channelMessage events to handlers", () => {
    const mgr = new WsManager("ws://test/ws");
    const handler = vi.fn();
    mgr.onChannelMessage(handler);

    mgr.connect({ events: ["channelMessage"] });
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateMessage({ v: 1, type: "hello", serverTime: 1, connectionId: "c1" });

    const msgData = {
      id: 1,
      packetHash: "abc123",
      channelHash: "f3",
      senderName: "TestNode",
      content: "hello mesh",
      sentAt: 1779804000000, // epoch ms (2026-05-26T14:00:00Z)
    };

    ws.simulateMessage({ v: 1, type: "event", event: "channelMessage", data: msgData });
    expect(handler).toHaveBeenCalledWith(msgData);
  });

  it("unsubscribes a superseded subscription when its late ack arrives", () => {
    const mgr = new WsManager("ws://test/ws");
    mgr.connect({ iatas: undefined }); // "all"

    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateMessage({ v: 1, type: "hello", serverTime: 1, connectionId: "c1" });
    // region resolves before the first subscribe is acked — the real-world firehose repro
    mgr.updateSubscription({ iatas: ["YOW"] });

    const sent = () => ws.sent.map((s) => JSON.parse(s));
    const [firstSub, secondSub] = sent().filter((m) => m.type === "subscribe");
    expect(firstSub).toBeTruthy();
    expect(secondSub.scope.iatas).toEqual(["YOW"]);

    // late ack for the superseded "all" subscribe must be unsubscribed immediately
    ws.simulateMessage({ v: 1, type: "subscribed", id: firstSub.id, subscriptionId: "s-all" });
    const unsubs = sent().filter((m) => m.type === "unsubscribe");
    expect(unsubs).toHaveLength(1);
    expect(unsubs[0].subscriptionId).toBe("s-all");

    // the current subscribe's ack is kept, and a later update unsubscribes it
    ws.simulateMessage({ v: 1, type: "subscribed", id: secondSub.id, subscriptionId: "s-yow" });
    mgr.updateSubscription({ iatas: ["YYZ"] });
    const unsubs2 = sent().filter((m) => m.type === "unsubscribe");
    expect(unsubs2).toHaveLength(2);
    expect(unsubs2[1].subscriptionId).toBe("s-yow");
  });

  it("ignores close events from a torn-down socket (no reconnect treadmill)", () => {
    const mgr = new WsManager("ws://test/ws");
    mgr.connect({ iatas: ["YOW"] });
    const ws1 = MockWebSocket.instances[0]!;

    mgr.disconnect();
    mgr.connect({ iatas: ["YOW"] }); // StrictMode-style connect/disconnect/connect
    expect(MockWebSocket.instances).toHaveLength(2);

    // a late close from the dead socket must not spawn a parallel reconnect loop
    ws1.simulateClose(1006);
    vi.advanceTimersByTime(60_000);
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it("does not double the ping interval on a second hello", () => {
    const mgr = new WsManager("ws://test/ws");
    mgr.connect({ iatas: ["YOW"] });
    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateMessage({ v: 1, type: "hello", serverTime: 1, connectionId: "c1" });
    ws.simulateMessage({ v: 1, type: "hello", serverTime: 2, connectionId: "c1" });

    ws.sent = [];
    vi.advanceTimersByTime(30_000);
    expect(ws.sent.map((s) => JSON.parse(s)).filter((m) => m.type === "ping")).toHaveLength(1);
  });

  it("forces a reconnect when pongs stop coming (half-open link)", () => {
    const mgr = new WsManager("ws://test/ws");
    mgr.connect({ iatas: ["YOW"] });
    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateMessage({ v: 1, type: "hello", serverTime: 1, connectionId: "c1" });

    // pings go out but nothing ever comes back
    vi.advanceTimersByTime(120_000);
    expect(MockWebSocket.instances.length).toBeGreaterThan(1);
  });

  it("clears the stale subscriptionId across reconnects", () => {
    const mgr = new WsManager("ws://test/ws");
    mgr.connect({ iatas: ["YOW"] });
    const ws1 = MockWebSocket.instances[0]!;
    ws1.simulateOpen();
    ws1.simulateMessage({ v: 1, type: "hello", serverTime: 1, connectionId: "c1" });
    const sub1 = JSON.parse(ws1.sent[0]!);
    ws1.simulateMessage({ v: 1, type: "subscribed", id: sub1.id, subscriptionId: "s-old" });

    ws1.simulateClose(1006);
    vi.advanceTimersByTime(1500);
    const ws2 = MockWebSocket.instances[1]!;
    ws2.simulateOpen();
    ws2.simulateMessage({ v: 1, type: "hello", serverTime: 2, connectionId: "c2" });

    mgr.updateSubscription({ iatas: ["YYZ"] });
    const unsubs = ws2.sent.map((s) => JSON.parse(s)).filter((m) => m.type === "unsubscribe");
    expect(unsubs.map((u) => u.subscriptionId)).not.toContain("s-old");
  });

  it("signals lagged handlers after a reconnect so views can heal the gap", () => {
    const handler = vi.fn();
    const mgr = new WsManager("ws://test/ws");
    mgr.onLagged(handler);
    mgr.connect({ iatas: ["YOW"] });
    const ws1 = MockWebSocket.instances[0]!;
    ws1.simulateOpen();
    ws1.simulateMessage({ v: 1, type: "hello", serverTime: 1, connectionId: "c1" });
    expect(handler).not.toHaveBeenCalled(); // first connect is not a gap

    ws1.simulateClose(1006);
    vi.advanceTimersByTime(1500);
    const ws2 = MockWebSocket.instances[1]!;
    ws2.simulateOpen();
    ws2.simulateMessage({ v: 1, type: "hello", serverTime: 2, connectionId: "c2" });

    expect(handler).toHaveBeenCalledOnce();
  });

  it("unsubscribes channelMessage handler on cleanup", () => {
    const mgr = new WsManager("ws://test/ws");
    const handler = vi.fn();
    const unsub = mgr.onChannelMessage(handler);
    unsub();

    mgr.connect({ events: ["channelMessage"] });
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateMessage({ v: 1, type: "hello", serverTime: 1, connectionId: "c1" });
    ws.simulateMessage({
      v: 1,
      type: "event",
      event: "channelMessage",
      data: { id: 1, packetHash: "x", channelHash: "f3", senderName: "N", content: "hi", sentAt: 1779804000000 },
    });

    expect(handler).not.toHaveBeenCalled();
  });
});
