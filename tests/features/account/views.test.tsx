import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { AccountViews } from "../../../src/features/account/AccountViews";
import { auth, me } from "../../../src/api/auth";
import { navigateTo } from "../../../src/features/account/navigate";
import { authError, mocks, renderAt, resetMocks, searchOf, user } from "./helpers";

vi.mock("../../../src/api/auth", async (orig) => {
  const actual = await orig<typeof import("../../../src/api/auth")>();
  return {
    ...actual,
    auth: { register: vi.fn(), verify: vi.fn(), resendVerification: vi.fn(), login: vi.fn(), logout: vi.fn(), requestReset: vi.fn(), confirmReset: vi.fn(), appCode: vi.fn() },
    me: { get: vi.fn() },
  };
});
vi.mock("../../../src/features/account/navigate", () => ({ navigateTo: vi.fn() }));
vi.mock("../../../src/hooks/useFeatures", () => ({
  useFeatures: () => mocks.features,
  useFeaturesLoading: () => mocks.featuresLoading,
}));

beforeEach(() => {
  resetMocks();
  vi.mocked(me.get).mockImplementation(async () => {
    if (mocks.signedIn) return { user: mocks.signedIn };
    throw authError("not_signed_in", 401);
  });
});
afterEach(() => vi.clearAllMocks());

const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const search = () => searchOf(screen.getByTestId("search"));

describe("sign in", () => {
  it("logs in, stores the user and closes the view", async () => {
    vi.mocked(auth.login).mockResolvedValue({ user });
    const { client } = renderAt("?tab=Nodes&view=signin", <AccountViews />);
    await screen.findByRole("heading", { name: "Sign in" });
    type("Username or email", "ridge");
    type("Password", "correct horse battery");
    click("Sign in");
    await waitFor(() => expect(search().has("view")).toBe(false));
    expect(auth.login).toHaveBeenCalledWith("ridge", "correct horse battery");
    expect(client.getQueryData(["me"])).toEqual(user);
    expect(search().get("tab")).toBe("Nodes");
  });

  it("keeps the profile open when signing in from it", async () => {
    vi.mocked(auth.login).mockResolvedValue({ user });
    renderAt("?tab=Nodes&view=profile", <AccountViews />);
    await screen.findByRole("heading", { name: "Sign in" });
    type("Username or email", "ridge");
    type("Password", "correct horse battery");
    click("Sign in");
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Sign in" })).toBeNull());
    expect(search().get("view")).toBe("profile");
  });

  it("shows one generic line for invalid_credentials", async () => {
    vi.mocked(auth.login).mockRejectedValue(authError("invalid_credentials", 401));
    renderAt("?view=signin", <AccountViews />);
    await screen.findByRole("heading", { name: "Sign in" });
    type("Username or email", "ridge");
    type("Password", "wrong wrong wrong");
    click("Sign in");
    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong username, email or password.");
  });

  it("offers to resend the link on email_unverified and uses the typed email", async () => {
    vi.mocked(auth.login).mockRejectedValue(authError("email_unverified", 403));
    vi.mocked(auth.resendVerification).mockResolvedValue({ status: "check_email" });
    renderAt("?view=signin", <AccountViews />);
    await screen.findByRole("heading", { name: "Sign in" });
    type("Username or email", "a@example.org");
    type("Password", "correct horse battery");
    click("Sign in");
    await screen.findByText(/Confirm your email first/);
    click("Send the link again");
    await waitFor(() => expect(auth.resendVerification).toHaveBeenCalledWith("a@example.org"));
    expect(await screen.findByText(/Check your email/)).toBeInTheDocument();
  });

  it("asks for an email to resend to when the login was a username", async () => {
    vi.mocked(auth.login).mockRejectedValue(authError("email_unverified", 403));
    vi.mocked(auth.resendVerification).mockResolvedValue({ status: "check_email" });
    renderAt("?view=signin", <AccountViews />);
    await screen.findByRole("heading", { name: "Sign in" });
    type("Username or email", "ridge");
    type("Password", "correct horse battery");
    click("Sign in");
    await screen.findByText(/Confirm your email first/);
    type("Email", "me@example.org");
    click("Send the link again");
    await waitFor(() => expect(auth.resendVerification).toHaveBeenCalledWith("me@example.org"));
  });

  it.each(["too_many_attempts", "rate_limited"])("%s says when to try again", async (code) => {
    vi.mocked(auth.login).mockRejectedValue(authError(code, 429, code, 120_000));
    renderAt("?view=signin", <AccountViews />);
    await screen.findByRole("heading", { name: "Sign in" });
    type("Username or email", "ridge");
    type("Password", "correct horse battery");
    click("Sign in");
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again in 2 minutes.");
  });

  it("falls back to a generic line for an unknown code", async () => {
    vi.mocked(auth.login).mockRejectedValue(authError("mystery", 500));
    renderAt("?view=signin", <AccountViews />);
    await screen.findByRole("heading", { name: "Sign in" });
    type("Username or email", "ridge");
    type("Password", "correct horse battery");
    click("Sign in");
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Try again.");
  });

  it("links to register only when registration is on, and always to reset", async () => {
    mocks.features = { ...mocks.features, registration: false };
    renderAt("?view=signin", <AccountViews />);
    await screen.findByRole("heading", { name: "Sign in" });
    expect(screen.queryByRole("button", { name: "Create an account" })).not.toBeInTheDocument();
    click("Forgot password");
    expect(search().get("view")).toBe("reset");
  });

  it("Back closes the view", async () => {
    renderAt("?tab=Map&view=signin", <AccountViews />);
    await screen.findByRole("heading", { name: "Sign in" });
    click("Back");
    expect(search().has("view")).toBe(false);
    expect(search().get("tab")).toBe("Map");
  });

  it("shows loading, not the form, until features are known", () => {
    mocks.featuresLoading = true;
    renderAt("?view=signin", <AccountViews />);
    expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("waits for the session before choosing between form and confirmation", async () => {
    mocks.signedIn = user;
    renderAt("?view=signin&app=1&code_challenge=c&state=s", <AccountViews />);
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    await screen.findByRole("button", { name: "Continue" });
  });
});

describe("register", () => {
  const fill = () => {
    type("Username", "ridge");
    type("Email", "a@example.org");
    type("Password", "correct horse battery");
  };

  it("shows Check your email on success", async () => {
    vi.mocked(auth.register).mockResolvedValue({ status: "check_email" });
    renderAt("?view=register", <AccountViews />);
    await screen.findByRole("heading", { name: "Create an account" });
    fill();
    click("Create account");
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(auth.register).toHaveBeenCalledWith({ username: "ridge", email: "a@example.org", password: "correct horse battery" });
    expect(screen.queryByText(/registered|exists|taken/i)).not.toBeInTheDocument();
  });

  it("puts username_taken on the username field", async () => {
    vi.mocked(auth.register).mockRejectedValue(authError("username_taken", 409));
    renderAt("?view=register", <AccountViews />);
    await screen.findByRole("heading", { name: "Create an account" });
    fill();
    click("Create account");
    await waitFor(() => expect(screen.getByLabelText("Username")).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByLabelText("Username")).toHaveAccessibleDescription(expect.stringContaining("That username is taken."));
  });

  it("puts weak_password with the server's reason on the password field", async () => {
    vi.mocked(auth.register).mockRejectedValue(authError("weak_password", 422, "it is too common"));
    renderAt("?view=register", <AccountViews />);
    await screen.findByRole("heading", { name: "Create an account" });
    fill();
    click("Create account");
    await waitFor(() => expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByLabelText("Password")).toHaveAccessibleDescription(/it is too common/);
  });

  it("puts invalid_input on the field the message names", async () => {
    vi.mocked(auth.register).mockRejectedValue(authError("invalid_input", 422, "email is not valid"));
    renderAt("?view=register", <AccountViews />);
    await screen.findByRole("heading", { name: "Create an account" });
    fill();
    click("Create account");
    await waitFor(() => expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true"));
  });

  it("says registration is closed when the feature is off", async () => {
    mocks.features = { ...mocks.features, registration: false };
    renderAt("?view=register", <AccountViews />);
    expect(await screen.findByText("Registration is closed on this server.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Username")).not.toBeInTheDocument();
  });
});

describe("verify", () => {
  it("posts the token once, even in strict mode, then clears it and offers sign in", async () => {
    vi.mocked(auth.verify).mockResolvedValue({ status: "verified" });
    renderAt("?tab=Map&view=verify&token=tok123", <AccountViews />, true);
    expect(await screen.findByText(/Your email is verified/)).toBeInTheDocument();
    expect(auth.verify).toHaveBeenCalledTimes(1);
    expect(auth.verify).toHaveBeenCalledWith("tok123");
    expect(search().has("token")).toBe(false);
    expect(search().get("view")).toBe("verify");
    click("Sign in");
    expect(search().get("view")).toBe("signin");
  });

  it("shows no longer valid with a way to ask for a new link", async () => {
    vi.mocked(auth.verify).mockRejectedValue(authError("token_invalid", 400));
    vi.mocked(auth.resendVerification).mockResolvedValue({ status: "check_email" });
    renderAt("?view=verify&token=old", <AccountViews />);
    expect(await screen.findByText("This link is no longer valid.")).toBeInTheDocument();
    type("Email", "a@example.org");
    click("Send a new link");
    await waitFor(() => expect(auth.resendVerification).toHaveBeenCalledWith("a@example.org"));
  });

  it("treats a missing token as invalid without posting", async () => {
    renderAt("?view=verify", <AccountViews />);
    expect(await screen.findByText("This link is no longer valid.")).toBeInTheDocument();
    expect(auth.verify).not.toHaveBeenCalled();
  });
});

describe("reset", () => {
  it("requests a link and shows a neutral confirmation", async () => {
    vi.mocked(auth.requestReset).mockResolvedValue({ status: "check_email" });
    renderAt("?view=reset", <AccountViews />);
    await screen.findByRole("heading", { name: "Reset your password" });
    type("Email", "a@example.org");
    click("Send reset link");
    expect(await screen.findByText(/If that address has an account/)).toBeInTheDocument();
    expect(auth.requestReset).toHaveBeenCalledWith("a@example.org");
  });

  it("sets a new password with the token, clears it from the URL, and offers sign in", async () => {
    vi.mocked(auth.confirmReset).mockResolvedValue({ status: "password_set" });
    renderAt("?view=reset&token=rt", <AccountViews />);
    await screen.findByRole("heading", { name: "Reset your password" });
    type("New password", "another long passphrase");
    click("Set password");
    expect(await screen.findByText(/Your password is changed/)).toBeInTheDocument();
    expect(auth.confirmReset).toHaveBeenCalledWith("rt", "another long passphrase");
    expect(search().has("token")).toBe(false);
    click("Sign in");
    expect(search().get("view")).toBe("signin");
  });

  it("shows weak_password on the field and keeps the token", async () => {
    vi.mocked(auth.confirmReset).mockRejectedValue(authError("weak_password", 422, "too common"));
    renderAt("?view=reset&token=rt", <AccountViews />);
    await screen.findByRole("heading", { name: "Reset your password" });
    type("New password", "another long passphrase");
    click("Set password");
    await waitFor(() => expect(screen.getByLabelText("New password")).toHaveAttribute("aria-invalid", "true"));
    expect(search().has("token")).toBe(false);
    type("New password", "a better long passphrase");
    click("Set password");
    await waitFor(() => expect(auth.confirmReset).toHaveBeenLastCalledWith("rt", "a better long passphrase"));
  });

  it("moves the token out of the URL as soon as the view opens", async () => {
    renderAt("?view=reset&token=rt", <AccountViews />);
    await screen.findByRole("heading", { name: "Reset your password" });
    expect(search().has("token")).toBe(false);
    expect(search().get("view")).toBe("reset");
  });

  it("token_invalid offers a new link", async () => {
    vi.mocked(auth.confirmReset).mockRejectedValue(authError("token_invalid", 400));
    renderAt("?view=reset&token=rt", <AccountViews />);
    await screen.findByRole("heading", { name: "Reset your password" });
    type("New password", "another long passphrase");
    click("Set password");
    expect(await screen.findByText("This link is no longer valid.")).toBeInTheDocument();
    click("Request a new link");
    expect(await screen.findByLabelText("Email")).toBeInTheDocument();
    expect(search().has("token")).toBe(false);
  });
});

describe("app sign-in bridge", () => {
  const bridge = "?view=signin&app=1&code_challenge=chal&state=st";

  it("tells a signed-out user the app is asking, then confirms after login", async () => {
    vi.mocked(auth.login).mockResolvedValue({ user });
    renderAt(bridge, <AccountViews />);
    expect(await screen.findByText(/Beacon app is asking you to sign in/)).toBeInTheDocument();
    type("Username or email", "ridge");
    type("Password", "correct horse battery");
    click("Sign in");
    expect(await screen.findByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.getByText(/Ridge Walker/)).toBeInTheDocument();
    expect(search().get("app")).toBe("1");
  });

  it("when already signed in, confirms, then redirects only to the server's redirectUri", async () => {
    mocks.signedIn = user;
    vi.mocked(auth.appCode).mockResolvedValue({ code: "CODE+1", redirectUri: "meshcorebeacon://auth" });
    renderAt(bridge, <AccountViews />);
    await screen.findByRole("button", { name: "Continue" });
    click("Continue");
    await waitFor(() => expect(navigateTo).toHaveBeenCalledTimes(1));
    const arg = vi.mocked(auth.appCode).mock.calls[0][0];
    expect(arg.codeChallenge).toBe("chal");
    expect(arg.state).toBe("st");
    expect(arg.deviceLabel.length).toBeLessThanOrEqual(60);
    expect(arg.deviceLabel.length).toBeGreaterThan(0);
    const url = new URL(vi.mocked(navigateTo).mock.calls[0][0]);
    expect(url.protocol).toBe("meshcorebeacon:");
    expect(url.searchParams.get("code")).toBe("CODE+1");
    expect(url.searchParams.get("state")).toBe("st");
    expect(window.location.href).not.toContain("CODE");
    expect(search().toString()).not.toContain("CODE");
  });

  it("refuses a redirectUri that is not the app scheme", async () => {
    mocks.signedIn = user;
    vi.mocked(auth.appCode).mockResolvedValue({ code: "c", redirectUri: "https://evil.example/auth" });
    renderAt(bridge, <AccountViews />);
    await screen.findByRole("button", { name: "Continue" });
    click("Continue");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("does not continue without both code_challenge and state", async () => {
    mocks.signedIn = user;
    renderAt("?view=signin&app=1&state=st", <AccountViews />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/incomplete/);
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
    expect(auth.appCode).not.toHaveBeenCalled();
  });

  it("Cancel closes the view and drops the app params", async () => {
    mocks.signedIn = user;
    renderAt("?tab=Map" + bridge.replace("?", "&"), <AccountViews />);
    await screen.findByRole("button", { name: "Continue" });
    click("Cancel");
    expect([...search().keys()]).toEqual(["tab"]);
    expect(auth.appCode).not.toHaveBeenCalled();
  });
});
