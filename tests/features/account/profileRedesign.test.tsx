import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, renderHook, screen, waitFor, within } from "@testing-library/react";
import { AccountViews } from "../../../src/features/account/AccountViews";
import { useFlash } from "../../../src/features/account/sections/useFlash";
import { me, requests } from "../../../src/api/auth";
import { mocks, renderAt, resetMocks, user } from "./helpers";
import { req } from "./requestsHelpers";

vi.mock("../../../src/api/auth", async (orig) => {
  const actual = await orig<typeof import("../../../src/api/auth")>();
  return {
    ...actual,
    auth: { login: vi.fn(), logout: vi.fn(), appCode: vi.fn() },
    me: {
      get: vi.fn(), setDisplayName: vi.fn(), changePassword: vi.fn(), changeEmail: vi.fn(),
      deleteAccount: vi.fn(), sessions: vi.fn(), endSession: vi.fn(), endOtherSessions: vi.fn(),
    },
    requests: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  };
});
vi.mock("../../../src/hooks/useFeatures", () => ({
  useFeatures: () => mocks.features,
  useFeaturesLoading: () => mocks.featuresLoading,
}));

beforeEach(() => {
  resetMocks();
  mocks.features = { ...mocks.features, telemetryRequests: true };
  vi.mocked(me.get).mockResolvedValue({ user });
  vi.mocked(me.sessions).mockResolvedValue({ sessions: [] });
});
afterEach(() => vi.clearAllMocks());

const poller = (state?: string) => ({ observerId: "o1", name: "North", ...(state ? { state } : {}) });

async function openRequests(list: ReturnType<typeof req>[]) {
  vi.mocked(requests.list).mockResolvedValue({ limit: 3, requests: list });
  renderAt("?tab=Map&view=profile", <AccountViews />);
  await screen.findByRole("heading", { name: "Profile" });
  return within(await screen.findByRole("region", { name: "Telemetry requests" }));
}

describe("profile page", () => {
  it("makes every section its own card with a heading", async () => {
    vi.mocked(requests.list).mockResolvedValue({ limit: 3, requests: [] });
    renderAt("?tab=Map&view=profile", <AccountViews />);
    await screen.findByRole("heading", { name: "Profile" });
    for (const name of ["Account", "Password", "Telemetry requests", "Devices", "Delete account"]) {
      const card = screen.getByRole("region", { name });
      expect(card.className).toContain("rounded-lg");
      expect(within(card).getByRole("heading", { level: 2, name })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("disables the primary buttons until the form is valid", async () => {
    vi.mocked(requests.list).mockResolvedValue({ limit: 3, requests: [] });
    renderAt("?tab=Map&view=profile", <AccountViews />);
    await screen.findByRole("heading", { name: "Profile" });
    const pw = within(screen.getByRole("region", { name: "Password" }));
    expect(pw.getByRole("button", { name: "Change password" })).toBeDisabled();
    fireEvent.change(pw.getByLabelText("Current password"), { target: { value: "old password 1" } });
    fireEvent.change(pw.getByLabelText("New password"), { target: { value: "a much longer new password" } });
    expect(pw.getByRole("button", { name: "Change password" })).toBeEnabled();
    const acct = within(screen.getByRole("region", { name: "Account" }));
    expect(acct.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(acct.getByRole("button", { name: "Change email" })).toBeDisabled();
    fireEvent.change(acct.getByLabelText("New email"), { target: { value: "not an address" } });
    fireEvent.change(acct.getByLabelText("Current password"), { target: { value: "x" } });
    expect(acct.getByRole("button", { name: "Change email" })).toBeDisabled();
  });

  it("clears the saved confirmation on its own", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { result } = renderHook(() => useFlash(1000));
      act(() => result.current.show());
      expect(result.current.on).toBe(true);
      act(() => { vi.advanceTimersByTime(1100); });
      expect(result.current.on).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets Cancel back out of signing a device out", async () => {
    const phone = { id: "s2", kind: "app" as const, label: "Pixel 8", current: false, createdAt: 1, lastUsedAt: 2, expiresAt: 3 };
    const here = { ...phone, id: "s1", label: "Firefox", current: true };
    vi.mocked(me.sessions).mockResolvedValue({ sessions: [here, phone] });
    vi.mocked(requests.list).mockResolvedValue({ limit: 3, requests: [] });
    renderAt("?tab=Map&view=profile", <AccountViews />);
    await screen.findByText("Pixel 8");
    expect(screen.queryByRole("button", { name: "Sign out Firefox" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign out Pixel 8" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(me.endSession).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign out Pixel 8" })).toBeInTheDocument();
  });

  it("points an empty request list at the Nodes tab", async () => {
    const region = await openRequests([]);
    expect(await region.findByText(/not asked for any telemetry/)).toBeInTheDocument();
    expect(region.getByRole("link", { name: "Open the Nodes tab" })).toHaveAttribute("href", "/?tab=Nodes");
  });
});

describe("what the observer reports on a request", () => {
  const cases: Array<[string, string, string]> = [
    ["ok", "Being polled by North", "ok"],
    ["pending", "Assigned to North. First poll is on its way.", "wait"],
    ["not_direct", "Assigned to North, which cannot hear this repeater directly right now.", "wait"],
    ["no_reply", "North is asking, but the repeater is not answering.", "wait"],
    ["not_claimed", "Assigned to North. Waiting for it to pick this up.", "wait"],
    ["login_failed", "North reported a password problem. Checking.", "wait"],
    ["admin_stop", "North reported a password problem. Checking.", "wait"],
  ];
  it.each(cases)("shows %s on the row with its dot", async (state, text, tone) => {
    const region = await openRequests([req({ poller: poller(state) })]);
    const row = within(region.getByText("Hilltop").closest("li") as HTMLElement);
    const line = row.getByText(text);
    expect(line.previousElementSibling).toHaveAttribute("data-tone", tone);
  });

  it("keeps today's text for a missing or unknown state", async () => {
    for (const state of [undefined, "brand_new"]) {
      const region = await openRequests([req({ poller: poller(state) })]);
      expect(region.getByText("Being polled")).toBeInTheDocument();
      expect(region.getByText(/North/)).toBeInTheDocument();
      document.body.innerHTML = "";
    }
  });

  it("does not let the poller state hide a stopped status", async () => {
    const region = await openRequests([req({ status: "login_failed", poller: poller("ok") })]);
    expect(region.getByText("Stopped: password refused")).toBeInTheDocument();
    expect(region.queryByText("Being polled by North")).not.toBeInTheDocument();
  });

  it("asks before removing a request", async () => {
    vi.mocked(requests.remove).mockResolvedValue(undefined);
    const region = await openRequests([req({ poller: poller("ok") })]);
    fireEvent.click(region.getByRole("button", { name: "Remove Hilltop" }));
    expect(requests.remove).not.toHaveBeenCalled();
    await waitFor(() => expect(region.getByRole("button", { name: "Yes, remove" })).toBeInTheDocument());
  });
});
