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
});
