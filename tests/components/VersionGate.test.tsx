import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { VersionGate } from "../../src/components/VersionGate";
import { getServerInfo } from "../../src/api/client";

vi.mock("../../src/api/client", () => ({ getServerInfo: vi.fn() }));
const mockGetServerInfo = vi.mocked(getServerInfo);

const info = (minWebVersion: string | null) => ({ minAppVersion: null, minWebVersion, serverVersion: "2.0.4" });

function renderGate(currentVersion = "2.0.2") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><VersionGate currentVersion={currentVersion} /></QueryClientProvider>);
}

const blocked = () => screen.queryByRole("alertdialog");

beforeEach(() => {
  mockGetServerInfo.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  focusManager.setFocused(undefined);
});

describe("VersionGate", () => {
  it("blocks a web version older than the server's minimum", async () => {
    mockGetServerInfo.mockResolvedValue(info("2.0.3"));
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    renderGate("2.0.2");

    expect(await screen.findByRole("alertdialog")).toHaveTextContent(/needs Beacon Web 2\.0\.3 or newer \(this is 2\.0\.2\)/);
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it.each([
    ["an equal version", info("2.0.3")],
    ["no minimum", info(null)],
    ["a malformed minimum", info("2.0")],
  ])("lets the app through with %s", async (_label, value) => {
    mockGetServerInfo.mockResolvedValue(value);
    renderGate("2.0.3");
    await waitFor(() => expect(mockGetServerInfo).toHaveBeenCalled());
    await act(async () => {});
    expect(blocked()).toBeNull();
  });

  it("fails open when the server has no /info", async () => {
    mockGetServerInfo.mockRejectedValue(Object.assign(new Error("not found"), { status: 404 }));
    renderGate("2.0.2");
    await waitFor(() => expect(mockGetServerInfo).toHaveBeenCalled());
    await act(async () => {});
    expect(blocked()).toBeNull();
  });

  it("fails open on a network error", async () => {
    mockGetServerInfo.mockRejectedValue(new TypeError("Failed to fetch"));
    renderGate("2.0.2");
    await waitFor(() => expect(mockGetServerInfo).toHaveBeenCalled());
    await act(async () => {});
    expect(blocked()).toBeNull();
  });

  it("re-checks when the tab regains focus, at most once a minute", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGetServerInfo.mockResolvedValue(info(null));
    renderGate("2.0.2");
    await waitFor(() => expect(mockGetServerInfo).toHaveBeenCalledTimes(1));

    act(() => { focusManager.setFocused(false); focusManager.setFocused(true); });
    await act(async () => {});
    expect(mockGetServerInfo).toHaveBeenCalledTimes(1);

    mockGetServerInfo.mockResolvedValue(info("2.0.3"));
    await act(async () => { vi.advanceTimersByTime(61_000); });
    act(() => { focusManager.setFocused(false); focusManager.setFocused(true); });
    await waitFor(() => expect(mockGetServerInfo).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  });
});
