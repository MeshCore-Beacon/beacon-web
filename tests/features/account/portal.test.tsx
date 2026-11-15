import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { AccountViews } from "../../../src/features/account/AccountViews";
import { me } from "../../../src/api/auth";
import { navigateTo } from "../../../src/features/account/navigate";
import { API_BASE } from "../../../src/lib/constants";
import { authError, mocks, renderAt, resetMocks, user } from "./helpers";

vi.mock("../../../src/api/auth", async (orig) => {
  const actual = await orig<typeof import("../../../src/api/auth")>();
  return {
    ...actual,
    auth: { register: vi.fn(), verify: vi.fn(), resendVerification: vi.fn(), login: vi.fn(), logout: vi.fn(), requestReset: vi.fn(), confirmReset: vi.fn(), appCode: vi.fn() },
    me: {
      get: vi.fn(), setDisplayName: vi.fn(), changePassword: vi.fn(), changeEmail: vi.fn(),
      deleteAccount: vi.fn(), sessions: vi.fn(), endSession: vi.fn(), endOtherSessions: vi.fn(),
    },
  };
});
vi.mock("../../../src/features/account/navigate", () => ({ navigateTo: vi.fn() }));
vi.mock("../../../src/hooks/useFeatures", () => ({
  useFeatures: () => mocks.features,
  useFeaturesLoading: () => mocks.featuresLoading,
}));

const PORTAL = "https://portal.meshmapper.net";
const startUrl = (ret: string) => `${API_BASE}/auth/portal/start?return=${encodeURIComponent(ret)}`;

beforeEach(() => {
  resetMocks();
  mocks.features = { polling: false, accounts: "portal", registration: false, telemetryRequests: false, alerts: false, portalUrl: PORTAL };
  vi.mocked(me.get).mockImplementation(async () => {
    if (mocks.signedIn) return { user: mocks.signedIn };
    throw authError("not_signed_in", 401);
  });
  vi.mocked(me.sessions).mockResolvedValue({ sessions: [] });
});
afterEach(() => vi.clearAllMocks());

describe("portal sign-in view", () => {
  it("shows one button and no password form or links", async () => {
    renderAt("?tab=Nodes&view=signin", <AccountViews />);
    const button = await screen.findByRole("button", { name: "Sign in with MeshMapper" });
    expect(button).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.queryByLabelText("Username or email")).toBeNull();
    expect(screen.queryByRole("button", { name: "Create an account" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Forgot password" })).toBeNull();
  });

  it("navigates to the start route with the current path and query, view removed", async () => {
    renderAt("?tab=Nodes&iata=YOW&view=signin", <AccountViews />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign in with MeshMapper" }));
    expect(navigateTo).toHaveBeenCalledWith(startUrl("/?tab=Nodes&iata=YOW"));
  });

  it("keeps the app bridge parameters and the signin view in the return", async () => {
    renderAt("?view=signin&app=1&code_challenge=abc&state=xyz", <AccountViews />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign in with MeshMapper" }));
    const url = new URL(vi.mocked(navigateTo).mock.calls[0]![0], "http://x");
    expect(url.pathname.endsWith("/auth/portal/start")).toBe(true);
    const ret = new URL(url.searchParams.get("return")!, "http://x");
    expect(ret.searchParams.get("view")).toBe("signin");
    expect(ret.searchParams.get("app")).toBe("1");
    expect(ret.searchParams.get("code_challenge")).toBe("abc");
    expect(ret.searchParams.get("state")).toBe("xyz");
  });

  it("the register and reset views show the same single button", async () => {
    for (const view of ["register", "reset"]) {
      const { unmount } = renderAt(`?view=${view}`, <AccountViews />);
      fireEvent.click(await screen.findByRole("button", { name: "Sign in with MeshMapper" }));
      expect(navigateTo).toHaveBeenLastCalledWith(startUrl("/"));
      expect(screen.queryByRole("textbox")).toBeNull();
      unmount();
    }
  });

  it("error=portal shows one inline line", async () => {
    renderAt("?view=signin&error=portal", <AccountViews />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign-in did not complete. Try again.");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("no error line without the error parameter", async () => {
    renderAt("?view=signin", <AccountViews />);
    await screen.findByRole("button", { name: "Sign in with MeshMapper" });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("local sign-in view", () => {
  it("still renders its form and links", async () => {
    mocks.features = { polling: false, accounts: "local", registration: true, telemetryRequests: false, alerts: false };
    renderAt("?view=signin", <AccountViews />);
    expect(await screen.findByLabelText("Username or email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create an account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forgot password" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign in with MeshMapper" })).toBeNull();
  });
});

describe("portal profile", () => {
  beforeEach(() => { mocks.signedIn = { ...user, provider: "portal", email: "" }; });

  it("replaces the password and email forms with one line and a link", async () => {
    renderAt("?view=profile", <AccountViews />);
    await screen.findByRole("heading", { name: "Profile" });
    expect(screen.getByText(/Your sign-in is managed at the MeshMapper portal/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /MeshMapper portal/i });
    expect(link).toHaveAttribute("href", PORTAL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByLabelText("Current password", { selector: "[name=currentPassword]" })).toBeNull();
    expect(screen.queryByLabelText("New password")).toBeNull();
    expect(screen.queryByLabelText("New email")).toBeNull();
    expect(screen.queryByRole("region", { name: "Password" })).toBeNull();
  });

  it("keeps display name, devices and delete", async () => {
    renderAt("?view=profile", <AccountViews />);
    await screen.findByRole("heading", { name: "Profile" });
    expect(screen.getByLabelText("Display name")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Devices" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Delete account" })).toBeInTheDocument();
  });

  it("shows the line without a link when no portal address is served", async () => {
    mocks.features = { ...mocks.features, portalUrl: undefined };
    renderAt("?view=profile", <AccountViews />);
    await screen.findByText(/Your sign-in is managed at the MeshMapper portal/);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("ignores a portal address that is not http(s)", async () => {
    mocks.features = { ...mocks.features, portalUrl: "javascript:alert(1)" };
    renderAt("?view=profile", <AccountViews />);
    await screen.findByText(/Your sign-in is managed at the MeshMapper portal/);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("local profile still has the password and email forms", async () => {
    mocks.features = { polling: false, accounts: "local", registration: true, telemetryRequests: false, alerts: false };
    mocks.signedIn = user;
    renderAt("?view=profile", <AccountViews />);
    await screen.findByRole("heading", { name: "Profile" });
    expect(screen.getByLabelText("New email")).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.queryByText(/managed at the MeshMapper portal/)).toBeNull();
  });
});
