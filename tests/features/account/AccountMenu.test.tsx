import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { AccountMenuItems } from "../../../src/features/account/AccountMenu";
import { auth, me } from "../../../src/api/auth";
import { authError, mocks, renderAt, resetMocks, searchOf, user } from "./helpers";

vi.mock("../../../src/api/auth", async (orig) => {
  const actual = await orig<typeof import("../../../src/api/auth")>();
  return { ...actual, auth: { logout: vi.fn() }, me: { get: vi.fn() } };
});
vi.mock("../../../src/hooks/useFeatures", () => ({
  useFeatures: () => mocks.features,
  useFeaturesLoading: () => mocks.featuresLoading,
  useDisplayUnits: () => ({ temperature: "c", distance: "metric" }),
}));

beforeEach(() => {
  resetMocks();
  vi.mocked(me.get).mockImplementation(async () => {
    if (mocks.signedIn) return { user: mocks.signedIn };
    throw authError("not_signed_in", 401);
  });
});
afterEach(() => vi.clearAllMocks());
const search = () => searchOf(screen.getByTestId("search"));

describe("AccountMenuItems", () => {
  it("offers Sign in first when signed out", async () => {
    const onPick = vi.fn();
    renderAt("?tab=Nodes", <AccountMenuItems onPick={onPick} />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign in" }));
    expect(onPick).toHaveBeenCalled();
    expect(search().get("view")).toBe("signin");
    expect(search().get("tab")).toBe("Nodes");
  });

  it("shows the display name with Profile when signed in", async () => {
    mocks.signedIn = user;
    const onPick = vi.fn();
    renderAt("", <AccountMenuItems onPick={onPick} />);
    expect(await screen.findByText("Ridge Walker")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Profile" }));
    expect(onPick).toHaveBeenCalled();
    expect(search().get("view")).toBe("profile");
  });

  it("signs out, clears the session, leaves the profile view and then closes the menu", async () => {
    mocks.signedIn = user;
    vi.mocked(auth.logout).mockResolvedValue(undefined);
    const onPick = vi.fn();
    const { client } = renderAt("?view=profile", <AccountMenuItems onPick={onPick} />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(client.getQueryData(["me"])).toBeNull());
    expect(auth.logout).toHaveBeenCalled();
    expect(search().has("view")).toBe(false);
    expect(onPick).toHaveBeenCalled();
  });

  it("keeps the account and the menu open with an error when sign out fails", async () => {
    mocks.signedIn = user;
    vi.mocked(auth.logout).mockRejectedValue(authError("generic", 503));
    const onPick = vi.fn();
    const { client } = renderAt("?view=profile", <AccountMenuItems onPick={onPick} />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/sign out/i);
    expect(client.getQueryData(["me"])).toEqual(user);
    expect(search().get("view")).toBe("profile");
    expect(onPick).not.toHaveBeenCalled();
  });

  it("counts a 401 from logout as signed out", async () => {
    mocks.signedIn = user;
    vi.mocked(auth.logout).mockRejectedValue(authError("not_signed_in", 401));
    const { client } = renderAt("?view=profile", <AccountMenuItems onPick={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(client.getQueryData(["me"])).toBeNull());
    expect(search().has("view")).toBe(false);
  });

  it("is empty when accounts are off", () => {
    mocks.features = { ...mocks.features, accounts: "off" };
    renderAt("", <AccountMenuItems onPick={() => {}} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("is empty while features or the session are loading", () => {
    mocks.featuresLoading = true;
    mocks.features = { ...mocks.features, accounts: "off" };
    renderAt("", <AccountMenuItems onPick={() => {}} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
