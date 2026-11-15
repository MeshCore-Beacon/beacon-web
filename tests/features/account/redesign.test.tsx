import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AccountViews } from "../../../src/features/account/AccountViews";
import { CheckEmail } from "../../../src/features/account/CheckEmail";
import { FormButton } from "../../../src/components/form/FormButton";
import { auth, me } from "../../../src/api/auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { authError, mocks, renderAt, resetMocks, searchOf } from "./helpers";

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
  vi.mocked(me.get).mockRejectedValue(authError("not_signed_in", 401));
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("sign in description", () => {
  const cases: [string, Record<string, boolean>, string][] = [
    ["both off", {}, "Sync your Atlas."],
    ["telemetry only", { telemetryRequests: true }, "Sync your Atlas and request repeater telemetry."],
    ["alerts only", { alerts: true }, "Sync your Atlas and get alerts."],
    ["both on", { telemetryRequests: true, alerts: true }, "Sync your Atlas, request repeater telemetry and get alerts."],
  ];
  it.each(cases)("lists only what is on: %s", async (_name, flags, text) => {
    mocks.features = { ...mocks.features, ...flags };
    renderAt("?view=signin", <AccountViews />);
    expect(await screen.findByText(text)).toBeInTheDocument();
  });
});

describe("account panel", () => {
  it("has a labelled Close button that closes the view", async () => {
    renderAt("?tab=Map&view=register", <AccountViews />);
    await screen.findByRole("heading", { name: "Create an account" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    const search = searchOf(screen.getByTestId("search"));
    expect(search.has("view")).toBe(false);
    expect(search.get("tab")).toBe("Map");
  });

  it("sets input hints on the sign-in fields", async () => {
    renderAt("?view=signin", <AccountViews />);
    const login = await screen.findByLabelText("Username or email");
    expect(login).toHaveAttribute("autocapitalize", "none");
    expect(login).toHaveAttribute("spellcheck", "false");
    expect(login).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByRole("button", { name: "Show password" })).toHaveTextContent("Show");
  });

  it("hides the Create an account button when registration is closed", async () => {
    mocks.features = { ...mocks.features, registration: false };
    renderAt("?view=signin", <AccountViews />);
    await screen.findByRole("heading", { name: "Sign in" });
    expect(screen.queryByRole("button", { name: "Create an account" })).toBeNull();
  });

  it("makes only Sign in the link in the register footer", async () => {
    renderAt("?view=register", <AccountViews />);
    await screen.findByRole("heading", { name: "Create an account" });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(searchOf(screen.getByTestId("search")).get("view")).toBe("signin");
  });
});

describe("primary button states", () => {
  it("is muted when disabled, filled when enabled and busy while submitting", async () => {
    let finish: (v: never) => void = () => {};
    vi.mocked(auth.login).mockReturnValue(new Promise((res) => { finish = res as never; }));
    renderAt("?view=signin", <AccountViews />);
    await screen.findByRole("heading", { name: "Sign in" });
    const button = screen.getByRole("button", { name: "Sign in" });
    expect(button).toBeDisabled();
    expect(button.className).toContain("disabled:bg-bg-raised");
    fireEvent.change(screen.getByLabelText("Username or email"), { target: { value: "ridge" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct horse battery" } });
    expect(button).toBeEnabled();
    expect(button.className).toContain("bg-primary");
    fireEvent.click(button);
    const busy = await screen.findByRole("button", { name: "Signing in…" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy.className).toContain("bg-primary");
    expect(busy.className).not.toContain("disabled:bg-bg-raised");
    await act(async () => finish({ user: { id: "1" } } as never));
  });

  it("FormButton solid keeps its fill while busy", () => {
    render(<FormButton variant="solid" size="lg" busy busyLabel="Working…">Go</FormButton>);
    const b = screen.getByRole("button", { name: "Working…" });
    expect(b).toHaveAttribute("aria-busy", "true");
    expect(b.className).toContain("bg-primary");
  });
});

// One second at a time: each tick re-renders and schedules the next.
async function tick(seconds: number) {
  for (let i = 0; i < seconds; i++) await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
}

describe("check your email", () => {
  it("names the address, stays neutral and starts the cooldown", async () => {
    vi.mocked(auth.register).mockResolvedValue({ status: "check_email" });
    renderAt("?view=register", <AccountViews />);
    await screen.findByRole("heading", { name: "Create an account" });
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "ridge" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.org" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct horse battery" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByRole("heading", { name: "Check your email" });
    expect(screen.getByText("If a@example.org can be used, a confirmation link is on its way. It can take a minute. Check your spam folder too.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send it again in 60s" })).toBeDisabled();
    // A different email returns to the form.
    fireEvent.click(screen.getByRole("button", { name: "Use a different email" }));
    expect(await screen.findByLabelText("Email")).toHaveValue("a@example.org");
  });

  function renderCheck(kind: "verify" | "reset") {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter><CheckEmail email="a@example.org" kind={kind} onDifferent={() => {}} onSignIn={() => {}} /></MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("counts down 60 seconds, then resends and restarts the cooldown", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(auth.resendVerification).mockResolvedValue({ status: "check_email" });
    renderCheck("verify");
    expect(screen.getByRole("button", { name: "Send it again in 60s" })).toBeDisabled();
    await tick(30);
    expect(screen.getByRole("button", { name: "Send it again in 30s" })).toBeDisabled();
    await tick(30);
    const again = screen.getByRole("button", { name: "Send it again" });
    expect(again).toBeEnabled();
    fireEvent.click(again);
    await waitFor(() => expect(auth.resendVerification).toHaveBeenCalledWith("a@example.org"));
    expect(await screen.findByRole("button", { name: "Send it again in 60s" })).toBeDisabled();
    expect(screen.getByText("Sent again.")).toBeInTheDocument();
  });

  it("the reset variant uses the reset wording and its own resend", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(auth.requestReset).mockResolvedValue({ status: "check_email" });
    renderCheck("reset");
    expect(screen.getByText(/If a@example.org has an account, a reset link is on its way/)).toBeInTheDocument();
    await tick(60);
    fireEvent.click(screen.getByRole("button", { name: "Send it again" }));
    await waitFor(() => expect(auth.requestReset).toHaveBeenCalledWith("a@example.org"));
    expect(auth.resendVerification).not.toHaveBeenCalled();
  });
});

describe("no reserved error space", () => {
  it("sign in has no alert element until it fails", async () => {
    renderAt("?view=signin", <AccountViews />);
    await screen.findByLabelText("Username or email");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector(".min-h-5")).toBeNull();
  });

  it("Check your email has no status or alert before a resend", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><CheckEmail email="a@example.org" kind="verify" onDifferent={() => {}} onSignIn={() => {}} /></MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.querySelector(".min-h-5")).toBeNull();
  });
});

describe("password hint and length error", () => {
  it("shows the short hint, then a too-long error in place of it", async () => {
    renderAt("?view=register", <AccountViews />);
    const field = await screen.findByLabelText("Password");
    expect(screen.getByText("At least 12 characters.")).toBeInTheDocument();
    fireEvent.change(field, { target: { value: "a".repeat(129) } });
    expect(screen.getByRole("alert")).toHaveTextContent("That password is too long.");
    expect(screen.queryByText("At least 12 characters.")).toBeNull();
    fireEvent.change(field, { target: { value: "a".repeat(128) } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("At least 12 characters.")).toBeInTheDocument();
  });
});
