import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { AccountViews } from "../../../src/features/account/AccountViews";
import { me, requests } from "../../../src/api/auth";
import { authError, mocks, renderAt, resetMocks, user } from "./helpers";
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
  vi.mocked(requests.list).mockResolvedValue({
    limit: 3,
    requests: [
      req(),
      req({ id: "r2", node: { id: null, publicKey: "ee", name: "Ridge" }, status: "disabled", statusReason: "Not heard by any observer for 7 days.", statusReasonCode: "offline", statusReasonDays: 7, hasPassword: true, poller: null, latestReadingAt: null }),
    ],
  });
});
afterEach(() => vi.clearAllMocks());

async function open() {
  const view = renderAt("?tab=Map&view=profile", <AccountViews />);
  await screen.findByRole("heading", { name: "Telemetry requests" });
  const region = within(screen.getByRole("region", { name: "Telemetry requests" }));
  await region.findByText("Hilltop");
  return { ...view, region };
}
const row = (name: string) => within(screen.getByText(name).closest("li") as HTMLElement);

describe("telemetry requests section", () => {
  it("is absent when the feature is off and fetches nothing", async () => {
    mocks.features = { ...mocks.features, telemetryRequests: false };
    renderAt("?tab=Map&view=profile", <AccountViews />);
    await screen.findByRole("heading", { name: "Profile" });
    expect(screen.queryByRole("heading", { name: "Telemetry requests" })).not.toBeInTheDocument();
    expect(requests.list).not.toHaveBeenCalled();
  });

  it("lists each request with its status in words, reason, observer, password and count", async () => {
    const { region } = await open();
    expect(region.getByText("2 of 3")).toBeInTheDocument();
    const a = row("Hilltop");
    expect(a.getByRole("link", { name: "Hilltop" })).toHaveAttribute("href", "/?tab=Nodes&node=node-self");
    expect(a.getByText("Being polled")).toBeInTheDocument();
    expect(a.getByText(/Valley observer/)).toBeInTheDocument();
    expect(a.getByText("No password")).toBeInTheDocument();
    const b = row("Ridge");
    expect(b.queryByRole("link")).not.toBeInTheDocument();
    expect(b.getByText("Paused: the repeater has not been heard recently")).toBeInTheDocument();
    expect(b.getByText("Not heard by any observer for 7 days.")).toBeInTheDocument();
    expect(b.getByText("Password set")).toBeInTheDocument();
  });

  it("offers re-enable only for a disabled request", async () => {
    await open();
    expect(row("Hilltop").queryByRole("button", { name: /Re-enable/ })).not.toBeInTheDocument();
    vi.mocked(requests.update).mockResolvedValue(req());
    fireEvent.click(row("Ridge").getByRole("button", { name: /Re-enable/ }));
    await waitFor(() => expect(requests.update).toHaveBeenCalledWith("r2", { enabled: true }));
    await waitFor(() => expect(requests.list).toHaveBeenCalledTimes(2));
  });

  it("changes the password inline and clears the field", async () => {
    vi.mocked(requests.update).mockResolvedValue(req());
    await open();
    fireEvent.click(row("Hilltop").getByRole("button", { name: /Change password/ }));
    const field = screen.getByLabelText("New guest password");
    expect(field).toHaveAttribute("autocomplete", "off");
    expect(field).toHaveAttribute("maxlength", "15");
    fireEvent.change(field, { target: { value: "newpw" } });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));
    await waitFor(() => expect(requests.update).toHaveBeenCalledWith("r1", { password: "newpw" }));
    await waitFor(() => expect(screen.queryByLabelText("New guest password")).not.toBeInTheDocument());
  });

  it("removes the password when the field is left empty", async () => {
    vi.mocked(requests.update).mockResolvedValue(req());
    await open();
    fireEvent.click(row("Ridge").getByRole("button", { name: /Change password/ }));
    expect(screen.getByText("Leave empty to remove the password.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));
    await waitFor(() => expect(requests.update).toHaveBeenCalledWith("r2", { password: null }));
  });

  it("shows a mapped error without echoing the password", async () => {
    vi.mocked(requests.update).mockRejectedValue(authError("password_invalid", 422, "bad secretpw"));
    await open();
    fireEvent.click(row("Hilltop").getByRole("button", { name: /Change password/ }));
    fireEvent.change(screen.getByLabelText("New guest password"), { target: { value: "secretpw" } });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The password must be 1 to 15 characters.");
    expect(document.body.textContent).not.toContain("secretpw");
  });

  it("asks before removing, and removes on confirm", async () => {
    vi.mocked(requests.remove).mockResolvedValue(undefined);
    await open();
    fireEvent.click(row("Hilltop").getByRole("button", { name: /^Remove/ }));
    expect(requests.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove" }));
    await waitFor(() => expect(requests.remove).toHaveBeenCalledWith("r1"));
    await waitFor(() => expect(requests.list).toHaveBeenCalledTimes(2));
  });

  it("can back out of the remove confirmation", async () => {
    await open();
    fireEvent.click(row("Hilltop").getByRole("button", { name: /^Remove/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Yes, remove" })).not.toBeInTheDocument();
    expect(requests.remove).not.toHaveBeenCalled();
  });

  it("says so when there are no requests", async () => {
    vi.mocked(requests.list).mockResolvedValue({ limit: 3, requests: [] });
    renderAt("?tab=Map&view=profile", <AccountViews />);
    expect(await screen.findByText(/You have not asked for any telemetry yet/)).toBeInTheDocument();
    expect(screen.getByText("0 of 3")).toBeInTheDocument();
  });
});
