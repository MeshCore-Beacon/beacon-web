import { describe, it, expect } from "vitest";
import { activityParamsFor, activityRefetchInterval } from "../../../src/features/stats/useTelemetry";
import { ApiError } from "../../../src/api/client";

describe("activityParamsFor", () => {
  it("pairs each stats range with the bucket the charts are sized for", () => {
    expect(activityParamsFor("24h")).toEqual({ range: "24h", interval: "15m" });
    expect(activityParamsFor("7d")).toEqual({ range: "168h", interval: "1h" });
    expect(activityParamsFor("30d")).toEqual({ range: "720h", interval: "6h" });
  });
});

describe("activityRefetchInterval", () => {
  it("polls every minute so the right edge of the heard charts keeps moving", () => {
    expect(activityRefetchInterval(null)).toBe(60_000);
    expect(activityRefetchInterval(new Error("network"))).toBe(60_000);
  });

  it("stops polling once the server has said it has no activity endpoint", () => {
    expect(activityRefetchInterval(new ApiError(404, "unknown", "not found"))).toBe(false);
  });
});
