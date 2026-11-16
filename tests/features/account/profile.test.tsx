import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { AccountViews } from "../../../src/features/account/AccountViews";
import { auth, me } from "../../../src/api/auth";
import { authError, mocks, renderAt, resetMocks, searchOf, user } from "./helpers";
import type { Session } from "../../../src/features/account/types";

vi.mock("../../../src/api/auth", async (orig) => {
  const actual = await orig<typeof import("../../../src/api/auth")>();
  return {
    ...actual,
    auth: { login: vi.fn(), logout: vi.fn(), appCode: vi.fn() },
    me: {
      get: vi.fn(), setDisplayName: vi.fn(), changePassword: vi.fn(), changeEmail: vi.fn(),
      deleteAccount: vi.fn(), sessions: vi.fn(), endSession: vi.fn(), endOtherSessions: vi.fn(),
    },
  };
});
vi.mock("../../../src/hooks/useFeatures", () => ({
  useFeatures: () => mocks.features,
  useFeaturesLoading: () => mocks.featuresLoading,
  useDisplayUnits: () => ({ temperature: "c", distance: "metric" }),
}));

const here: Session = { id: "s1", kind: "web", label: "Firefox on macOS", current: true, createdAt: 1_700_000_000_000, lastUsedAt: 1_700_000_100_000, expiresAt: 1_800_000_000_000 };
const phone: Session = { id: "s2", kind: "app", label: "Pixel 8", current: false, createdAt: 1_700_000_000_000, lastUsedAt: 1_700_000_100_000, expiresAt: 1_800_000_000_000 };
const other: Session = { id: "s3", kind: "web", label: "Chrome on Windows", current: false, createdAt: 1_700_000_000_000, lastUsedAt: 1_700_000_100_000, expiresAt: 1_800_000_000_000 };

beforeEach(() => {
  resetMocks();
  mocks.signedIn = user;
  vi.mocked(me.get).mockImplementation(async () => {
    if (mocks.signedIn) return { user: mocks.signedIn };
    throw authError("not_signed_in", 401);
  });
  vi.mocked(me.sessions).mockResolvedValue({ sessions: [here, phone] });
});
afterEach(() => vi.clearAllMocks());

const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const search = () => searchOf(screen.getByTestId("search"));
const section = (name: string) => within(screen.getByRole("region", { name }));

async function open() {
  const view = renderAt("?tab=Map&view=profile", <AccountViews />);
  await screen.findByRole("heading", { name: "Profile" });
  return view;
}

describe("account section", () => {
  it("shows the display name, username, email and its verified state in the header", async () => {
    await open();
    const header = within(screen.getByTestId("profile-header"));
    expect(header.getByText("Ridge Walker")).toBeInTheDocument();
    expect(header.getByText("@ridge")).toBeInTheDocument();
    expect(header.getByText("a@example.org")).toBeInTheDocument();
    expect(header.getByText("Verified")).toBeInTheDocument();
    expect(section("Account").getByLabelText("Display name")).toHaveValue("Ridge Walker");
  });

  it("saves the display name and updates the cached user", async () => {
    vi.mocked(me.setDisplayName).mockResolvedValue({ user: { ...user, displayName: "Ridge W" } });
    const { client } = await open();
    type("Display name", "  Ridge W ");
    click("Save");
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(me.setDisplayName).toHaveBeenCalledWith("Ridge W");
    expect(client.getQueryData(["me"])).toMatchObject({ displayName: "Ridge W" });
  });

  it("shows a display name error inside the account section only", async () => {
    vi.mocked(me.setDisplayName).mockRejectedValue(authError("invalid_input", 422));
    await open();
    type("Display name", "x");
    click("Save");
    expect(await section("Account").findByRole("alert")).toHaveTextContent("Check what you entered");
    expect(section("Password").queryByRole("alert")).not.toBeInTheDocument();
  });

  it("changing email shows the neutral line and the pending address, never whether it is in use", async () => {
    vi.mocked(me.changeEmail).mockResolvedValue({ status: "check_email" });
    await open();
    type("New email", "new@example.org");
    fireEvent.change(section("Account").getAllByLabelText("Current password")[0], { target: { value: "correct horse battery" } });
    click("Change email");
    expect(await screen.findByText(/Check your email/)).toBeInTheDocument();
    expect(me.changeEmail).toHaveBeenCalledWith("new@example.org", "correct horse battery");
    expect(screen.getByText(/new@example.org/)).toBeInTheDocument();
    expect(screen.queryByText(/in use|taken|already/i)).not.toBeInTheDocument();
  });

  it("lists a pending address that is already waiting", async () => {
    mocks.signedIn = { ...user, pendingEmail: "wait@example.org" };
    await open();
    expect(screen.getByText(/wait@example.org/)).toBeInTheDocument();
  });

  it("a wrong current password reads as such", async () => {
    vi.mocked(me.changeEmail).mockRejectedValue(authError("invalid_credentials", 401));
    await open();
    type("New email", "new@example.org");
    fireEvent.change(section("Account").getAllByLabelText("Current password")[0], { target: { value: "nope nope nope" } });
    click("Change email");
    expect(await section("Account").findByRole("alert")).toHaveTextContent("That password is not right.");
  });
});

describe("password section", () => {
  const fill = () => {
    fireEvent.change(section("Password").getByLabelText("Current password"), { target: { value: "correct horse battery" } });
    fireEvent.change(section("Password").getByLabelText("New password"), { target: { value: "another long passphrase" } });
  };

  it("changes it, says other devices were signed out and refetches the devices", async () => {
    vi.mocked(me.changePassword).mockResolvedValue(undefined);
    await open();
    await screen.findByText("Pixel 8");
    const before = vi.mocked(me.sessions).mock.calls.length;
    fill();
    click("Change password");
    expect(await screen.findByText(/Your other devices were signed out/)).toBeInTheDocument();
    expect(me.changePassword).toHaveBeenCalledWith("correct horse battery", "another long passphrase");
    await waitFor(() => expect(vi.mocked(me.sessions).mock.calls.length).toBeGreaterThan(before));
  });

  it("shows weak_password with the reason, in its own section", async () => {
    vi.mocked(me.changePassword).mockRejectedValue(authError("weak_password", 422, "it is too common"));
    await open();
    fill();
    click("Change password");
    expect(await section("Password").findByRole("alert")).toHaveTextContent(/it is too common/);
    expect(section("Account").queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("devices section", () => {
  it("marks this device, shows kind, and offers Sign out only on the others", async () => {
    await open();
    const dev = section("Devices");
    await dev.findByText("Firefox on macOS");
    expect(dev.getByText("This device")).toBeInTheDocument();
    expect(dev.getByText("Browser")).toBeInTheDocument();
    expect(dev.getByText("App")).toBeInTheDocument();
    expect(dev.getAllByRole("button", { name: /^Sign out Pixel 8$/ })).toHaveLength(1);
    expect(dev.queryByRole("button", { name: /^Sign out Firefox on macOS$/ })).not.toBeInTheDocument();
  });

  it("removes a row after signing it out, refetching the list", async () => {
    vi.mocked(me.endSession).mockResolvedValue(undefined);
    await open();
    await screen.findByText("Pixel 8");
    vi.mocked(me.sessions).mockResolvedValue({ sessions: [here] });
    click("Sign out Pixel 8");
    expect(me.endSession).not.toHaveBeenCalled();
    expect(screen.getByText("Sign out Pixel 8?")).toBeInTheDocument();
    click("Yes, sign out");
    await waitFor(() => expect(screen.queryByText("Pixel 8")).not.toBeInTheDocument());
    expect(me.endSession).toHaveBeenCalledWith("s2");
  });

  it("signs out everywhere else", async () => {
    vi.mocked(me.sessions).mockResolvedValue({ sessions: [here, phone, other] });
    vi.mocked(me.endOtherSessions).mockResolvedValue(undefined);
    await open();
    await screen.findByText("Pixel 8");
    vi.mocked(me.sessions).mockResolvedValue({ sessions: [here] });
    click("Sign out everywhere else");
    expect(me.endOtherSessions).not.toHaveBeenCalled();
    expect(screen.getByText("Sign out every other device?")).toBeInTheDocument();
    click("Yes, sign out");
    await waitFor(() => expect(screen.queryByText("Chrome on Windows")).not.toBeInTheDocument());
    expect(me.endOtherSessions).toHaveBeenCalledTimes(1);
  });

  it("shows an error under the list when ending fails", async () => {
    vi.mocked(me.endSession).mockRejectedValue(authError("rate_limited", 429, "x", 30_000));
    await open();
    await screen.findByText("Pixel 8");
    click("Sign out Pixel 8");
    click("Yes, sign out");
    expect(await section("Devices").findByRole("alert")).toHaveTextContent("Too many attempts");
    expect(screen.getByText("Pixel 8")).toBeInTheDocument();
  });
});

describe("delete section", () => {
  const pw = () => section("Delete account").getByLabelText("Current password");

  it("explains what is removed and needs the exact username before it can be sent", async () => {
    vi.mocked(me.deleteAccount).mockResolvedValue(undefined);
    await open();
    const del = section("Delete account");
    expect(del.getByText(/permanently removes/)).toBeInTheDocument();
    fireEvent.change(pw(), { target: { value: "correct horse battery" } });
    fireEvent.click(del.getByRole("button", { name: "Delete account" }));
    const confirm = del.getByRole("button", { name: "Delete my account" });
    expect(confirm).toBeDisabled();
    fireEvent.change(del.getByLabelText(/Type ridge to confirm/), { target: { value: "Ridge" } });
    expect(confirm).toBeDisabled();
    fireEvent.change(del.getByLabelText(/Type ridge to confirm/), { target: { value: "ridge" } });
    expect(confirm).toBeEnabled();
    expect(me.deleteAccount).not.toHaveBeenCalled();
  });

  it("on 204 clears the session and returns to the tab view", async () => {
    vi.mocked(me.deleteAccount).mockResolvedValue(undefined);
    const { client } = await open();
    const del = section("Delete account");
    fireEvent.change(pw(), { target: { value: "correct horse battery" } });
    fireEvent.click(del.getByRole("button", { name: "Delete account" }));
    fireEvent.change(del.getByLabelText(/Type ridge to confirm/), { target: { value: "ridge" } });
    fireEvent.click(del.getByRole("button", { name: "Delete my account" }));
    await waitFor(() => expect(search().has("view")).toBe(false));
    expect(me.deleteAccount).toHaveBeenCalledWith("correct horse battery");
    expect(client.getQueryData(["me"])).toBeNull();
    expect(search().get("tab")).toBe("Map");
  });

  it("a wrong password stays on the confirm step with an error", async () => {
    vi.mocked(me.deleteAccount).mockRejectedValue(authError("invalid_credentials", 401));
    await open();
    const del = section("Delete account");
    fireEvent.change(pw(), { target: { value: "nope nope nope" } });
    fireEvent.click(del.getByRole("button", { name: "Delete account" }));
    fireEvent.change(del.getByLabelText(/Type ridge to confirm/), { target: { value: "ridge" } });
    fireEvent.click(del.getByRole("button", { name: "Delete my account" }));
    expect(await del.findByRole("alert")).toHaveTextContent("That password is not right.");
    expect(search().get("view")).toBe("profile");
  });

  it("Cancel closes the confirm step", async () => {
    await open();
    const del = section("Delete account");
    fireEvent.change(pw(), { target: { value: "x" } });
    fireEvent.click(del.getByRole("button", { name: "Delete account" }));
    fireEvent.click(del.getByRole("button", { name: "Cancel" }));
    expect(del.queryByRole("button", { name: "Delete my account" })).not.toBeInTheDocument();
  });
});

describe("signed out and ended elsewhere", () => {
  it("shows the sign-in view when signed out", async () => {
    mocks.signedIn = null;
    renderAt("?view=profile", <AccountViews />);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Profile" })).not.toBeInTheDocument();
  });

  it("a 401 not_signed_in from a profile call clears the session and shows sign in", async () => {
    vi.mocked(me.setDisplayName).mockRejectedValue(authError("not_signed_in", 401));
    const { client } = await open();
    type("Display name", "New");
    click("Save");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(client.getQueryData(["me"])).toBeNull();
  });

  it("a 401 from the devices list does the same", async () => {
    vi.mocked(me.sessions).mockRejectedValue(authError("not_signed_in", 401));
    await open().catch(() => undefined);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("does not render sections for later stages", async () => {
    await open();
    expect(screen.queryByRole("region", { name: /Atlas|Alerts|Telemetry/ })).not.toBeInTheDocument();
  });
});

describe("app sign-in confirmation hardening", () => {
  const bridge = "?view=signin&app=1&code_challenge=chal&state=st";

  it("warns, shows the account, makes Cancel the default focus and never auto-continues", async () => {
    renderAt(bridge, <AccountViews />);
    const cont = await screen.findByRole("button", { name: "Continue" });
    expect(screen.getByText(/only continue if you just chose "Sign in" in the Beacon app on this device/i)).toBeInTheDocument();
    expect(screen.getByText("Ridge Walker")).toBeInTheDocument();
    expect(screen.getByText("@ridge")).toBeInTheDocument();
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel).toHaveFocus();
    expect(cont).not.toHaveFocus();
    expect(cont).toHaveAttribute("type", "button");
    expect(cont.closest("form")).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Enter" });
    fireEvent.keyUp(document.activeElement ?? document.body, { key: "Enter" });
    expect(auth.appCode).not.toHaveBeenCalled();
  });

  it("puts the warning above the buttons", async () => {
    renderAt(bridge, <AccountViews />);
    const cont = await screen.findByRole("button", { name: "Continue" });
    const warning = screen.getByText(/only continue if you just chose/i);
    expect(warning.compareDocumentPosition(cont) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("a busy server (503 service_unavailable)", () => {
  const busy = () => authError("service_unavailable", 503, "The server is busy. Try again in a moment.", 5000);
  const BUSY = "The server is busy. Try again in a moment.";

  it("change password says busy, keeps both fields, stays signed in and can be sent again", async () => {
    vi.mocked(me.changePassword).mockRejectedValue(busy());
    const { client } = await open();
    const pwSection = section("Password");
    fireEvent.change(pwSection.getByLabelText("Current password"), { target: { value: "correct horse battery" } });
    fireEvent.change(pwSection.getByLabelText("New password"), { target: { value: "another long passphrase" } });
    click("Change password");
    expect(await pwSection.findByRole("alert")).toHaveTextContent(BUSY);
    expect(pwSection.queryByText(/not right/)).not.toBeInTheDocument();
    expect(pwSection.getByLabelText("Current password")).toHaveValue("correct horse battery");
    expect(pwSection.getByLabelText("New password")).toHaveValue("another long passphrase");
    expect(pwSection.getByRole("button", { name: "Change password" })).toBeEnabled();
    expect(client.getQueryData(["me"])).not.toBeNull();
  });

  it("change email says busy and keeps what was typed", async () => {
    vi.mocked(me.changeEmail).mockRejectedValue(busy());
    const { client } = await open();
    type("New email", "new@example.org");
    fireEvent.change(section("Account").getAllByLabelText("Current password")[0], { target: { value: "correct horse battery" } });
    click("Change email");
    expect(await section("Account").findByText(BUSY)).toBeInTheDocument();
    expect(screen.getByLabelText("New email")).toHaveValue("new@example.org");
    expect(section("Account").getAllByLabelText("Current password")[0]).toHaveValue("correct horse battery");
    expect(section("Account").getByRole("button", { name: "Change email" })).toBeEnabled();
    expect(client.getQueryData(["me"])).not.toBeNull();
  });

  it("delete account says busy, keeps the password and the confirm step, stays signed in", async () => {
    vi.mocked(me.deleteAccount).mockRejectedValue(busy());
    const { client } = await open();
    const del = section("Delete account");
    fireEvent.change(del.getByLabelText("Current password"), { target: { value: "correct horse battery" } });
    fireEvent.click(del.getByRole("button", { name: "Delete account" }));
    fireEvent.change(del.getByLabelText(/Type ridge to confirm/), { target: { value: "ridge" } });
    fireEvent.click(del.getByRole("button", { name: "Delete my account" }));
    expect(await del.findByRole("alert")).toHaveTextContent(BUSY);
    expect(del.getByLabelText("Current password")).toHaveValue("correct horse battery");
    expect(del.getByRole("button", { name: "Delete my account" })).toBeEnabled();
    expect(client.getQueryData(["me"])).not.toBeNull();
  });
});
