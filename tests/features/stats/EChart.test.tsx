import { expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { EChart } from "../../../src/features/stats/EChart";
import i18n from "../../../src/i18n";

const init = vi.hoisted(() =>
  vi.fn(() => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn(), on: vi.fn(), off: vi.fn(), isDisposed: () => false })),
);
vi.mock("../../../src/features/stats/echarts-setup", () => ({ echarts: { init } }));
vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });

it("initialises charts with the French locale and rebuilds on a language switch", async () => {
  render(<EChart option={{}} />);
  expect(init).toHaveBeenLastCalledWith(expect.anything(), null, expect.objectContaining({ locale: "EN" }));
  await act(() => i18n.changeLanguage("fr"));
  expect(init).toHaveBeenCalledTimes(2);
  expect(init).toHaveBeenLastCalledWith(expect.anything(), null, expect.objectContaining({ locale: "FR" }));
});
