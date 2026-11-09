import { beforeEach, describe, expect, it } from "vitest";
import { releasePage, reservePage, resetPagePacer } from "../../src/api/page-pacer";

beforeEach(resetPagePacer);

describe("page pacer", () => {
  it("lets a region-sized load through at once, then spaces pages 300 ms apart", () => {
    const t = 1_000_000;
    for (let i = 0; i < 40; i++) expect(reservePage(t)).toBe(0);
    expect(reservePage(t)).toBe(300);
    expect(reservePage(t)).toBe(600);
  });

  it("refills while idle", () => {
    const t = 1_000_000;
    for (let i = 0; i < 40; i++) reservePage(t);
    for (let i = 0; i < 10; i++) expect(reservePage(t + 12_000)).toBe(0);
  });

  it("never sends more than 240 pages in any minute, however fast pages come back", () => {
    const sends: number[] = [];
    let now = 1_000_000;
    for (let i = 0; i < 1_000; i++) {
      now += reservePage(now); // chain the next page the moment this one may go
      sends.push(now);
      now += 20; // a fast response
    }
    let max = 0;
    for (let i = 0, j = 0; i < sends.length; i++) {
      while (sends[i] - sends[j] >= 60_000) j++;
      max = Math.max(max, i - j + 1);
    }
    expect(max).toBeLessThanOrEqual(240);
    expect(max).toBeGreaterThan(200);
  });

  it("takes back a slot that went unused", () => {
    const t = 1_000_000;
    for (let i = 0; i < 40; i++) reservePage(t);
    expect(reservePage(t)).toBe(300);
    releasePage();
    expect(reservePage(t)).toBe(300);
  });
});
