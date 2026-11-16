import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { AccountViews } from "../../../src/features/account/AccountViews";
import i18n from "../../../src/i18n";
import { alerts, me } from "../../../src/api/auth";
import { authError, mocks, renderAt, resetMocks, user } from "./helpers";
import type { AlertRule, AlertTarget, AlertsResponse } from "../../../src/features/account/types";

vi.mock("../../../src/api/auth", async (orig) => {
  const actual = await orig<typeof import("../../../src/api/auth")>();
  return {
    ...actual,
    auth: { login: vi.fn(), logout: vi.fn(), appCode: vi.fn() },
    me: {
      get: vi.fn(), setDisplayName: vi.fn(), changePassword: vi.fn(), changeEmail: vi.fn(),
      deleteAccount: vi.fn(), sessions: vi.fn(), endSession: vi.fn(), endOtherSessions: vi.fn(),
    },
    alerts: { get: vi.fn(), putRule: vi.fn(), deleteRule: vi.fn() },
  };
});
const units = vi.hoisted(() => ({ temperature: "c" as "c" | "f" }));
vi.mock("../../../src/hooks/useFeatures", () => ({
  useFeatures: () => mocks.features,
  useFeaturesLoading: () => mocks.featuresLoading,
  useDisplayUnits: () => ({ temperature: units.temperature, distance: "metric" }),
}));

const rule = (over: Partial<AlertRule> = {}): AlertRule => ({
  id: "u1", kind: "battery_low", threshold: 3500, thresholdHigh: null, enabled: true,
  state: "ok", stateChangedAt: 1_700_000_000_000, lastSentAt: null, ...over,
});
const repeater = (over: Partial<AlertTarget> = {}): AlertTarget => ({
  id: "11111111-1111-1111-1111-111111111111", kind: "node", publicKey: "aabb", name: "Hilltop", polled: true,
  available: ["gone_quiet", "back_online", "clock", "battery_low", "battery_falling", "rebooted", "temperature", "noise_high"],
  unavailable: {}, unavailableCodes: {}, rules: [], ...over,
});
const plain = (): AlertTarget => repeater({
  id: null, publicKey: "ccdd", name: "Ridge", polled: false, available: ["gone_quiet", "back_online"],
  unavailable: { temperature: "This repeater does not report a temperature." }, unavailableCodes: { temperature: "no_data" },
});
const response = (over: Partial<AlertsResponse> = {}): AlertsResponse => ({ delivery: "email", hasDevice: true, targets: [repeater(), plain()], ...over });

beforeEach(() => {
  resetMocks();
  mocks.features = { ...mocks.features, alerts: true, alertDelivery: "email" };
  units.temperature = "c";
  vi.mocked(me.get).mockResolvedValue({ user });
  vi.mocked(me.sessions).mockResolvedValue({ sessions: [] });
  vi.mocked(alerts.get).mockResolvedValue(response());
  vi.mocked(alerts.putRule).mockResolvedValue(rule());
});
afterEach(() => vi.clearAllMocks());

async function open(data: AlertsResponse = response(), collapsed = false) {
  vi.mocked(alerts.get).mockResolvedValue(data);
  const view = renderAt("?tab=Map&view=profile", <AccountViews />);
  const region = within(await screen.findByRole("region", { name: "Alerts" }));
  await waitFor(() => expect(alerts.get).toHaveBeenCalled());
  await region.findByText(data.targets[0]?.name ?? /Alerts are set/);
  if (!collapsed) for (const b of region.queryAllByRole("button", { expanded: false })) fireEvent.click(b);
  return { ...view, region };
}
const block = (name: string) => within(screen.getByRole("group", { name }));
const row = (target: string, kind: string) => within(block(target).getByTestId(`alert-${kind}`));
const put = () => vi.mocked(alerts.putRule);

describe("collapsible radios", () => {
  const head = (name: string) => within(screen.getByRole("group", { name })).getByRole("button", { name: new RegExp(name) });
  const firingRule = (over: Partial<AlertRule> = {}) => rule({ state: "firing", ...over });

  it("starts collapsed with no switches in the tree, even with one radio", async () => {
    const { region } = await open(response({ targets: [repeater()] }), true);
    expect(region.queryAllByRole("switch")).toHaveLength(0);
    expect(head("Hilltop")).toHaveAttribute("aria-expanded", "false");
  });

  it("summarises none, one, several and firing", async () => {
    const one = repeater({ rules: [rule({ id: "a", kind: "gone_quiet", threshold: 24 })] });
    const many = repeater({ publicKey: "m", name: "Many", rules: [rule({ id: "a", kind: "gone_quiet", threshold: 24 }), rule({ id: "b" }), rule({ id: "c", kind: "noise_high", threshold: -90, enabled: false })] });
    const fire1 = repeater({ publicKey: "f1", name: "Fire1", rules: [firingRule(), rule({ id: "z", kind: "rebooted" })] });
    const fire2 = repeater({ publicKey: "f2", name: "Fire2", rules: [firingRule(), firingRule({ id: "y", kind: "noise_high", threshold: -90 })] });
    await open(response({ targets: [plain(), one, many, fire1, fire2] }), true);
    expect(head("Ridge")).toHaveTextContent("No alerts on");
    expect(head("Hilltop")).toHaveTextContent("1 alert on");
    expect(head("Many")).toHaveTextContent("2 alerts on");
    expect(head("Fire1")).toHaveTextContent("Alerting: Battery low · 2 alerts on");
    expect(head("Fire2")).toHaveTextContent("Alerting: 2 alerts · 2 alerts on");
    expect(within(head("Fire1")).getByText("Alerting: Battery low")).toHaveClass("text-danger");
    expect(head("Fire1")).toHaveAttribute("aria-expanded", "false");
  });

  it("expands to the rows, wires aria-controls, and several can be open", async () => {
    await open(response(), true);
    const a = head("Hilltop"), b = head("Ridge");
    fireEvent.click(a);
    fireEvent.click(b);
    expect(a).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(a.getAttribute("aria-controls") as string)).toBeVisible();
    expect(within(screen.getByRole("group", { name: "Hilltop" })).getAllByRole("switch").length).toBeGreaterThan(0);
    expect(within(screen.getByRole("group", { name: "Ridge" })).getAllByRole("switch").length).toBeGreaterThan(0);
    fireEvent.click(a);
    expect(a).toHaveAttribute("aria-expanded", "false");
    expect(within(screen.getByRole("group", { name: "Hilltop" })).queryAllByRole("switch")).toHaveLength(0);
  });

  it("keeps an unsaved threshold across a collapse and expand without refetching", async () => {
    await open(response({ targets: [repeater({ rules: [rule({ kind: "noise_high", threshold: -90 })] })] }), true);
    const calls = vi.mocked(alerts.get).mock.calls.length;
    fireEvent.click(head("Hilltop"));
    fireEvent.change(row("Hilltop", "noise_high").getByLabelText("dBm"), { target: { value: "-77" } });
    fireEvent.click(head("Hilltop"));
    fireEvent.click(head("Hilltop"));
    expect(row("Hilltop", "noise_high").getByLabelText("dBm")).toHaveValue("-77");
    expect(vi.mocked(alerts.get).mock.calls.length).toBe(calls);
  });

  it("updates the summary after a toggle once collapsed", async () => {
    await open(response(), true);
    fireEvent.click(head("Ridge"));
    expect(head("Ridge")).toHaveTextContent("No alerts on");
    vi.mocked(alerts.get).mockResolvedValue(response({ targets: [repeater(), repeater({ publicKey: "ccdd", name: "Ridge", rules: [rule({ id: "n", kind: "gone_quiet", threshold: 24 })] })] }));
    fireEvent.click(row("Ridge", "gone_quiet").getByRole("switch"));
    await waitFor(() => expect(put()).toHaveBeenCalled());
    fireEvent.click(head("Ridge"));
    await waitFor(() => expect(head("Ridge")).toHaveTextContent("1 alert on"));
  });
});

describe("alerts section", () => {
  it("is absent when the feature is off and fetches nothing", async () => {
    mocks.features = { ...mocks.features, alerts: false };
    renderAt("?tab=Map&view=profile", <AccountViews />);
    await screen.findByRole("heading", { name: "Profile" });
    expect(screen.queryByRole("region", { name: "Alerts" })).toBeNull();
    expect(alerts.get).not.toHaveBeenCalled();
  });

  it("says where email alerts go", async () => {
    const { region } = await open();
    expect(region.getByText("Alerts are sent to a@example.org")).toBeInTheDocument();
  });

  it("says push alerts go to the app, with the sign-in line only without a device", async () => {
    const { region, unmount } = await open(response({ delivery: "push", hasDevice: false }));
    expect(region.getByText("Alerts are sent to the Beacon app on your phone")).toBeInTheDocument();
    expect(region.getByText("Sign in to the Beacon app on a phone to receive them.")).toBeInTheDocument();
    unmount();
    const again = await open(response({ delivery: "push", hasDevice: true }));
    expect(again.region.getByText("Alerts are sent to the Beacon app on your phone")).toBeInTheDocument();
    expect(again.region.queryByText(/Sign in to the Beacon app/)).toBeNull();
  });

  it("points to the Atlas tab when the Atlas is empty", async () => {
    const { region } = await open(response({ targets: [] }));
    expect(region.getByText(/set on radios in your Atlas/)).toBeInTheDocument();
    expect(region.getByRole("link", { name: "Open the Atlas tab" })).toHaveAttribute("href", "/?tab=Atlas");
  });

  it("shows one block per target in order with rows in the table order and the always-on sentence", async () => {
    const { region } = await open();
    const heads = region.getAllByRole("group").map((g) => g.getAttribute("aria-label"));
    expect(heads).toEqual(["Hilltop", "Ridge"]);
    const kinds = within(block("Hilltop").getByRole("list")).getAllByRole("listitem").map((li) => li.getAttribute("data-testid"));
    expect(kinds).toEqual(["alert-gone_quiet", "alert-back_online", "alert-battery_low", "alert-battery_falling", "alert-rebooted", "alert-temperature", "alert-noise_high", "alert-clock"]);
    expect(region.getByText(/always told when one of your telemetry requests needs attention/)).toBeInTheDocument();
  });

  it("lists unavailable kinds dimmed with the server reason", async () => {
    await open();
    const note = block("Ridge").getByText("This repeater does not report a temperature.");
    expect(note.closest("li")).toHaveClass("opacity-60");
    expect(within(note.closest("li") as HTMLElement).getByText("Temperature")).toBeInTheDocument();
  });

  it("translates an unavailable reason by its code and falls back to the sentence", async () => {
    const odd = repeater({
      publicKey: "eeff", name: "Odd", available: ["gone_quiet"],
      unavailable: { clock: "Server sentence one.", noise_high: "Server sentence two.", battery_low: "Server sentence three." },
      unavailableCodes: { clock: "brand_new_code", noise_high: "not_polled" },
    });
    await open(response({ targets: [plain(), odd] }));
    expect(block("Ridge").getByText("This repeater does not report a temperature.")).toBeInTheDocument();
    expect(block("Odd").getByText("Server sentence one.")).toBeInTheDocument();
    expect(block("Odd").getByText("Beacon is not polling this repeater. Request telemetry for it first.")).toBeInTheDocument();
    expect(block("Odd").getByText("Server sentence three.")).toBeInTheDocument();
  });

  it("shows the sentence in the user's language when the server's is English", async () => {
    await open(response({ targets: [{ ...plain(), unavailable: { temperature: "ENGLISH" } }] }));
    try {
      await act(() => i18n.changeLanguage("fr"));
      expect(screen.queryByText("ENGLISH")).toBeNull();
      expect(screen.getByText(/Ce répéteur ne remonte pas la température/)).toBeInTheDocument();
    } finally {
      await act(() => i18n.changeLanguage("en"));
    }
  });

  it("shows each rule state in words", async () => {
    const rules = [
      rule({ id: "a", kind: "gone_quiet", threshold: 24, state: "ok" }),
      rule({ id: "b", kind: "battery_low", state: "firing", stateChangedAt: 1_700_000_000_000 }),
      rule({ id: "c", kind: "noise_high", threshold: -90, state: "inactive" }),
      rule({ id: "d", kind: "clock", threshold: 3600, state: "unknown" }),
    ];
    await open(response({ targets: [repeater({ rules })] }));
    expect(row("Hilltop", "gone_quiet").getByText("OK")).toBeInTheDocument();
    expect(row("Hilltop", "battery_low").getByText(/Alerting since/)).toBeInTheDocument();
    expect(row("Hilltop", "noise_high").getByText("No data right now")).toBeInTheDocument();
    expect(row("Hilltop", "clock").getByText("Not checked yet")).toBeInTheDocument();
    expect(row("Hilltop", "rebooted").queryByText("OK")).toBeNull();
  });

  describe("gone quiet hours", () => {
    const options = (el: HTMLElement) => within(el).getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
    it("offers 3 and 6 when the target reports telemetry", async () => {
      await open();
      expect(options(row("Hilltop", "gone_quiet").getByLabelText("Hours") as HTMLElement)).toEqual(["3", "6", "12", "24", "48"]);
    });
    it("offers 3 and 6 for a polled repeater that reports none of the telemetry kinds", async () => {
      await open(response({ targets: [repeater({ polled: true, available: ["gone_quiet", "clock"] })] }));
      expect(options(row("Hilltop", "gone_quiet").getByLabelText("Hours") as HTMLElement)).toEqual(["3", "6", "12", "24", "48"]);
    });
    it("offers only 12, 24, 48 for a repeater that is not polled, whatever it lists", async () => {
      await open(response({ targets: [repeater({ polled: false })] }));
      expect(options(row("Hilltop", "gone_quiet").getByLabelText("Hours") as HTMLElement)).toEqual(["12", "24", "48"]);
    });
    it("offers 3 and 6 for an observer", async () => {
      await open(response({ targets: [repeater({ kind: "observer", available: ["gone_quiet"] })] }));
      expect(options(row("Hilltop", "gone_quiet").getByLabelText("Hours") as HTMLElement)).toEqual(["3", "6", "12", "24", "48"]);
    });
    it("offers only 12, 24, 48 otherwise", async () => {
      await open(response({ targets: [plain()] }));
      expect(options(row("Ridge", "gone_quiet").getByLabelText("Hours") as HTMLElement)).toEqual(["12", "24", "48"]);
    });
  });

  describe("turning rules on and off", () => {
    it("sends the current value when turned on, and refetches", async () => {
      await open();
      fireEvent.change(row("Hilltop", "gone_quiet").getByLabelText("Hours"), { target: { value: "48" } });
      expect(put()).not.toHaveBeenCalled();
      fireEvent.click(row("Hilltop", "gone_quiet").getByRole("switch"));
      await waitFor(() => expect(put()).toHaveBeenCalledWith({ target: { kind: "node", publicKey: "aabb" }, kind: "gone_quiet", threshold: 48, thresholdHigh: null, enabled: true }));
      await waitFor(() => expect(vi.mocked(alerts.get).mock.calls.length).toBeGreaterThan(1));
    });

    it("turns an enabled rule off with enabled false", async () => {
      await open(response({ targets: [repeater({ rules: [rule({ kind: "rebooted", threshold: null })] })] }));
      fireEvent.click(row("Hilltop", "rebooted").getByRole("switch"));
      await waitFor(() => expect(put()).toHaveBeenCalledWith({ target: { kind: "node", publicKey: "aabb" }, kind: "rebooted", threshold: null, thresholdHigh: null, enabled: false }));
    });

    it("battery_low sends millivolts and shows volts", async () => {
      await open(response({ targets: [repeater({ rules: [rule({ enabled: false })] })] }));
      const r = row("Hilltop", "battery_low");
      expect(r.getByLabelText("Volts")).toHaveValue("3.50");
      fireEvent.change(r.getByLabelText("Volts"), { target: { value: "3.65" } });
      fireEvent.click(r.getByRole("switch"));
      await waitFor(() => expect(put()).toHaveBeenCalledWith(expect.objectContaining({ kind: "battery_low", threshold: 3650, enabled: true })));
    });

    it("battery_falling, clock and observer_offline selects send their units", async () => {
      await open(response({ targets: [repeater({ kind: "observer", available: ["battery_falling", "clock", "observer_offline"] })] }));
      fireEvent.change(row("Hilltop", "battery_falling").getByLabelText("Drop per day"), { target: { value: "300" } });
      fireEvent.click(row("Hilltop", "battery_falling").getByRole("switch"));
      await waitFor(() => expect(put()).toHaveBeenCalledWith(expect.objectContaining({ kind: "battery_falling", threshold: 300 })));
      fireEvent.change(row("Hilltop", "clock").getByLabelText("Drift"), { target: { value: "86400" } });
      fireEvent.click(row("Hilltop", "clock").getByRole("switch"));
      await waitFor(() => expect(put()).toHaveBeenCalledWith(expect.objectContaining({ kind: "clock", threshold: 86400 })));
      fireEvent.change(row("Hilltop", "observer_offline").getByLabelText("No report for"), { target: { value: "180" } });
      fireEvent.click(row("Hilltop", "observer_offline").getByRole("switch"));
      await waitFor(() => expect(put()).toHaveBeenCalledWith(expect.objectContaining({ kind: "observer_offline", threshold: 180 })));
    });

    it("noise_high sends dBm", async () => {
      await open();
      const r = row("Hilltop", "noise_high");
      fireEvent.change(r.getByLabelText("dBm"), { target: { value: "-95" } });
      fireEvent.click(r.getByRole("switch"));
      await waitFor(() => expect(put()).toHaveBeenCalledWith(expect.objectContaining({ kind: "noise_high", threshold: -95 })));
    });

    it("temperature sends tenths, either side optional, at least one required", async () => {
      await open();
      const r = row("Hilltop", "temperature");
      fireEvent.click(r.getByRole("switch"));
      expect(await r.findByRole("alert")).toHaveTextContent(/low or a high/i);
      expect(put()).not.toHaveBeenCalled();
      fireEvent.change(r.getByLabelText("High (°C)"), { target: { value: "45.5" } });
      fireEvent.click(r.getByRole("switch"));
      await waitFor(() => expect(put()).toHaveBeenCalledWith(expect.objectContaining({ kind: "temperature", threshold: null, thresholdHigh: 455, enabled: true })));
    });

    it("temperature outside -50 to 150 degrees is refused before sending", async () => {
      await open();
      const r = row("Hilltop", "temperature");
      fireEvent.change(r.getByLabelText("High (°C)"), { target: { value: "150.5" } });
      fireEvent.click(r.getByRole("switch"));
      expect(await r.findByRole("alert")).toHaveTextContent(/between -50 and 150/);
      fireEvent.change(r.getByLabelText("High (°C)"), { target: { value: "" } });
      fireEvent.change(r.getByLabelText("Low (°C)"), { target: { value: "-50.1" } });
      fireEvent.click(r.getByRole("switch"));
      expect(await r.findByRole("alert")).toHaveTextContent(/between -50 and 150/);
      expect(put()).not.toHaveBeenCalled();
    });

    it("temperature low and high both go as tenths", async () => {
      await open();
      const r = row("Hilltop", "temperature");
      fireEvent.change(r.getByLabelText("Low (°C)"), { target: { value: "-5" } });
      fireEvent.change(r.getByLabelText("High (°C)"), { target: { value: "40.2" } });
      fireEvent.click(r.getByRole("switch"));
      await waitFor(() => expect(put()).toHaveBeenCalledWith(expect.objectContaining({ threshold: -50, thresholdHigh: 402 })));
    });

    it("temperature limits under 2 degrees apart are refused before sending", async () => {
      await open();
      const r = row("Hilltop", "temperature");
      fireEvent.change(r.getByLabelText("Low (°C)"), { target: { value: "10" } });
      fireEvent.change(r.getByLabelText("High (°C)"), { target: { value: "11.9" } });
      fireEvent.click(r.getByRole("switch"));
      expect(await r.findByRole("alert")).toHaveTextContent("The high limit must be at least 2.0 °C above the low limit.");
      expect(put()).not.toHaveBeenCalled();
      fireEvent.change(r.getByLabelText("High (°C)"), { target: { value: "12" } });
      fireEvent.click(r.getByRole("switch"));
      await waitFor(() => expect(put()).toHaveBeenCalledWith(expect.objectContaining({ threshold: 100, thresholdHigh: 120 })));
    });

    describe("blur on an enabled temperature limit", () => {
      const temperatureRule = (over: Partial<AlertRule> = {}) => rule({ kind: "temperature", threshold: 355, thresholdHigh: 400, ...over });
      const withRule = (r: AlertRule) => response({ targets: [repeater({ rules: [r] })] });

      it("an unedited limit in F is not rewritten on blur", async () => {
        units.temperature = "f";
        await open(withRule(temperatureRule()));
        const low = row("Hilltop", "temperature").getByLabelText("Low (°F)");
        expect(low).toHaveValue("96");
        fireEvent.focus(low);
        fireEvent.blur(low);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(put()).not.toHaveBeenCalled();
      });

      it("an edited limit in F saves, and the untouched limit keeps its stored tenths", async () => {
        units.temperature = "f";
        await open(withRule(temperatureRule()));
        const low = row("Hilltop", "temperature").getByLabelText("Low (°F)");
        fireEvent.change(low, { target: { value: "15" } });
        fireEvent.blur(low);
        await waitFor(() => expect(put()).toHaveBeenCalledWith(expect.objectContaining({ kind: "temperature", threshold: -94, thresholdHigh: 400 })));
      });

      it("an edited limit in C saves, and the untouched limit keeps its stored tenths", async () => {
        await open(withRule(temperatureRule({ threshold: -100 })));
        const low = row("Hilltop", "temperature").getByLabelText("Low (°C)");
        fireEvent.change(low, { target: { value: "-9.0" } });
        fireEvent.blur(low);
        await waitFor(() => expect(put()).toHaveBeenCalledWith(expect.objectContaining({ threshold: -90, thresholdHigh: 400 })));
      });

      it("turning an F limit back on keeps the stored tenths of both bounds", async () => {
        units.temperature = "f";
        await open(withRule(temperatureRule({ enabled: false, threshold: 355, thresholdHigh: 412 })));
        fireEvent.click(row("Hilltop", "temperature").getByRole("switch"));
        await waitFor(() => expect(put()).toHaveBeenCalledWith(expect.objectContaining({ threshold: 355, thresholdHigh: 412, enabled: true })));
      });

      it("a kept low limit counts at its stored tenths when checking the width", async () => {
        units.temperature = "f";
        await open(withRule(temperatureRule({ threshold: 357, thresholdHigh: 412 })));
        const r = row("Hilltop", "temperature");
        const high = r.getByLabelText("High (°F)");
        fireEvent.change(high, { target: { value: "98" } });
        fireEvent.blur(high);
        expect(await r.findByRole("alert")).toHaveTextContent(/at least/);
        expect(put()).not.toHaveBeenCalled();
      });

      it("a pair exactly 20 tenths wide is accepted", async () => {
        units.temperature = "f";
        await open(withRule(temperatureRule({ threshold: 358, thresholdHigh: 412 })));
        const high = row("Hilltop", "temperature").getByLabelText("High (°F)");
        fireEvent.change(high, { target: { value: "100" } });
        fireEvent.blur(high);
        await waitFor(() => expect(put()).toHaveBeenCalledWith(expect.objectContaining({ threshold: 358, thresholdHigh: 378 })));
      });

      it("a fractional F limit is refused and sends nothing", async () => {
        units.temperature = "f";
        await open(withRule(temperatureRule()));
        const r = row("Hilltop", "temperature");
        const high = r.getByLabelText("High (°F)");
        fireEvent.change(high, { target: { value: "95.5" } });
        fireEvent.blur(high);
        expect(await r.findByRole("alert")).toHaveTextContent("Enter a whole number of degrees °F, such as 95.");
        expect(put()).not.toHaveBeenCalled();
      });

      it("editing only the high F limit keeps the untouched low limit's stored tenths", async () => {
        units.temperature = "f";
        await open(withRule(temperatureRule({ threshold: 355, thresholdHigh: 412 })));
        const high = row("Hilltop", "temperature").getByLabelText("High (°F)");
        fireEvent.change(high, { target: { value: "110" } });
        fireEvent.blur(high);
        await waitFor(() => expect(put()).toHaveBeenCalledWith(expect.objectContaining({ threshold: 355, thresholdHigh: 433, enabled: true })));
      });
    });

    it("the width message is translated in fr and sv", async () => {
      try {
        for (const lng of ["fr", "sv"]) {
          await act(() => i18n.changeLanguage(lng));
          for (const key of ["account.alerts.errors.temperature_width", "account.alerts.errors.temperature_whole"]) {
            expect(i18n.t(key)).not.toBe(key);
            expect(i18n.t(key)).not.toBe(i18n.t(key, { lng: "en" }));
          }
        }
      } finally {
        await act(() => i18n.changeLanguage("en"));
      }
    });
  });

  describe("editing a threshold", () => {
    const enabled = () => response({ targets: [repeater({ rules: [rule({ kind: "noise_high", threshold: -90 })] })] });

    it("sends on blur, not on each keystroke, and not when unchanged", async () => {
      await open(enabled());
      const input = row("Hilltop", "noise_high").getByLabelText("dBm");
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: "-8" } });
      fireEvent.change(input, { target: { value: "-85" } });
      expect(put()).not.toHaveBeenCalled();
      fireEvent.blur(input);
      await waitFor(() => expect(put()).toHaveBeenCalledTimes(1));
      expect(put()).toHaveBeenCalledWith(expect.objectContaining({ kind: "noise_high", threshold: -85, enabled: true }));
      fireEvent.blur(input);
      expect(put()).toHaveBeenCalledTimes(1);
    });

    it("sends a changed select at once on an enabled rule", async () => {
      await open(response({ targets: [repeater({ rules: [rule({ kind: "gone_quiet", threshold: 24 })] })] }));
      fireEvent.change(row("Hilltop", "gone_quiet").getByLabelText("Hours"), { target: { value: "12" } });
      await waitFor(() => expect(put()).toHaveBeenCalledWith(expect.objectContaining({ kind: "gone_quiet", threshold: 12, enabled: true })));
    });

    it("an out of range value shows an inline error and sends nothing", async () => {
      await open(enabled());
      const r = row("Hilltop", "noise_high");
      fireEvent.change(r.getByLabelText("dBm"), { target: { value: "-20" } });
      fireEvent.blur(r.getByLabelText("dBm"));
      expect(await r.findByRole("alert")).toHaveTextContent(/-130 and -50/);
      expect(put()).not.toHaveBeenCalled();
    });

    it("rejects battery volts outside 2.50 to 5.00", async () => {
      await open(response({ targets: [repeater()] }));
      const r = row("Hilltop", "battery_low");
      fireEvent.change(r.getByLabelText("Volts"), { target: { value: "2.4" } });
      fireEvent.click(r.getByRole("switch"));
      expect(await r.findByRole("alert")).toHaveTextContent(/2\.50 and 5\.00/);
      expect(put()).not.toHaveBeenCalled();
    });
  });

  describe("back online", () => {
    it("is disabled with a hint until gone quiet is on", async () => {
      await open();
      const r = row("Hilltop", "back_online");
      expect(r.getByRole("switch")).toBeDisabled();
      expect(r.getByText(/Turn on Gone quiet first/)).toBeInTheDocument();
    });
    it("is enabled with gone quiet on, and sends no threshold", async () => {
      await open(response({ targets: [repeater({ rules: [rule({ kind: "gone_quiet", threshold: 24 })] })] }));
      const r = row("Hilltop", "back_online");
      expect(r.getByRole("switch")).toBeEnabled();
      fireEvent.click(r.getByRole("switch"));
      await waitFor(() => expect(put()).toHaveBeenCalledWith({ target: { kind: "node", publicKey: "aabb" }, kind: "back_online", threshold: null, thresholdHigh: null, enabled: true }));
    });
    it("stays disabled when the gone quiet rule is off", async () => {
      await open(response({ targets: [repeater({ rules: [rule({ kind: "gone_quiet", threshold: 24, enabled: false })] })] }));
      expect(row("Hilltop", "back_online").getByRole("switch")).toBeDisabled();
    });
  });

  describe("server errors", () => {
    const cases: [string, number, string, RegExp, string?][] = [
      ["kind_unavailable", 422, "This repeater does not report a temperature.", /does not report a temperature/],
      ["kind_unavailable", 422, "English sentence.", /Turn on the gone-quiet alert/, "needs_gone_quiet"],
      ["invalid_threshold", 422, "bad", /not an allowed value/],
      ["not_on_atlas", 409, "x", /no longer in your Atlas/],
      ["alerts_disabled", 404, "x", /turned off on this server/],
    ];
    it.each(cases)("%s shows inline text on its row only", async (code, status, message, text, reasonCode) => {
      await open();
      put().mockRejectedValue(authError(code, status, message, undefined, reasonCode));
      fireEvent.click(row("Hilltop", "rebooted").getByRole("switch"));
      expect(await row("Hilltop", "rebooted").findByRole("alert")).toHaveTextContent(text);
      expect(within(block("Hilltop").getByTestId("alert-clock")).queryByRole("alert")).toBeNull();
    });
  });
});
