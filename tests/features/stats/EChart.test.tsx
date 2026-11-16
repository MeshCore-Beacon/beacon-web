import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { EChart } from "../../../src/features/stats/EChart";
import i18n from "../../../src/i18n";

const init = vi.hoisted(() =>
  vi.fn(() => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn(), on: vi.fn(), off: vi.fn(), isDisposed: () => false })),
);
vi.mock("../../../src/features/stats/echarts-setup", () => ({ echarts: { init } }));
vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
beforeEach(() => init.mockClear());
afterEach(() => vi.restoreAllMocks());

it("coalesces layout notifications and cancels pending work on unmount", () => {
  let resized = () => {};
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resized = callback; } observe() {} disconnect() {} });
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(fn => { frames.set(++id, fn); return id; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(key => { frames.delete(key); });
  const view = render(<EChart option={{}} />);
  const chart = init.mock.results.at(-1)!.value;
  act(() => { resized(); resized(); resized(); });
  expect(frames.size).toBe(1);
  act(() => { const fn = frames.values().next().value!; frames.clear(); fn(0); });
  expect(chart.resize).toHaveBeenCalledTimes(1);
  act(() => resized());
  view.unmount();
  expect(frames.size).toBe(0);
  expect(chart.dispose).toHaveBeenCalledTimes(1);
});

it("initialises charts with the French locale and rebuilds on a language switch", async () => {
  render(<EChart option={{}} />);
  expect(init).toHaveBeenLastCalledWith(expect.anything(), null, expect.objectContaining({ locale: "EN" }));
  await act(() => i18n.changeLanguage("fr"));
  expect(init).toHaveBeenCalledTimes(2);
  expect(init).toHaveBeenLastCalledWith(expect.anything(), null, expect.objectContaining({ locale: "FR" }));
});
