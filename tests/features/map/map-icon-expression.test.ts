import { describe, it, expect } from "vitest";
import { ICON_IMAGE } from "../../../src/features/map/useMapNodes";
import { nodeIconId } from "../../../src/features/map/types";
import { nodeObserverIconId, nodePollerIconId } from "../../../src/features/map/node-icons";

// Minimal evaluator for the expression forms ICON_IMAGE uses: match, case, to-boolean, get.
function evaluate(expr: unknown, props: Record<string, unknown>): unknown {
  if (!Array.isArray(expr)) return expr;
  const [op, ...args] = expr as [string, ...unknown[]];
  switch (op) {
    case "get": return props[args[0] as string];
    case "to-boolean": return !!evaluate(args[0], props);
    case "case": {
      for (let i = 0; i + 1 < args.length; i += 2) if (evaluate(args[i], props)) return evaluate(args[i + 1], props);
      return evaluate(args[args.length - 1], props);
    }
    case "match": {
      const input = evaluate(args[0], props);
      for (let i = 1; i + 1 < args.length; i += 2) if (args[i] === input) return evaluate(args[i + 1], props);
      return evaluate(args[args.length - 1], props);
    }
    default: throw new Error(`unhandled ${op}`);
  }
}

describe("map icon expression", () => {
  const icon = (isObserver: boolean, isPoller: boolean) => evaluate(ICON_IMAGE, { nodeTypeName: "repeater", isObserver, isPoller });

  it("picks the plain, observer and poller ids, and poller wins over observer", () => {
    expect(icon(false, false)).toBe(nodeIconId("repeater"));
    expect(icon(true, false)).toBe(nodeObserverIconId("repeater"));
    expect(icon(false, true)).toBe(nodePollerIconId("repeater"));
    expect(icon(true, true)).toBe(nodePollerIconId("repeater"));
  });

  it("treats a feature without the flags as plain", () => {
    expect(evaluate(ICON_IMAGE, { nodeTypeName: "sensor" })).toBe(nodeIconId("sensor"));
  });
});
