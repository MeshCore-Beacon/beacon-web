import { expect, it } from "vitest";
import { rolledWindow } from "../../../src/features/stats/useStats";

const H = 3_600_000;

it("ends the window at the newest hour the server can have rolled", () => {
  // the hour starting at H becomes rollable at H + 95 min, matching the server's overview window
  expect(rolledWindow("24h", 12 * H + 34 * 60_000)).toEqual({ since: -13 * H, until: 11 * H });
  expect(rolledWindow("24h", 12 * H + 35 * 60_000)).toEqual({ since: -12 * H, until: 12 * H });
  expect(rolledWindow("7d", 12 * H + 35 * 60_000)).toEqual({ since: 12 * H - 7 * 24 * H, until: 12 * H });
});
