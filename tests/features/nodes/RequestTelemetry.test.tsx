import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { RequestTelemetry } from "../../../src/features/nodes/RequestTelemetry";
import { requests } from "../../../src/api/auth";
import { authError } from "../account/helpers";
import { req } from "../account/requestsHelpers";

vi.mock("../../../src/api/auth", async (orig) => {
  const actual = await orig<typeof import("../../../src/api/auth")>();
  return { ...actual, requests: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() } };
});

vi.mock("../../../src/hooks/useFeatures", () => ({ useFeatures: () => ({ telemetryRequests: true }) }));
vi.mock("../../../src/hooks/useSession", async (orig) => ({
  ...(await orig<typeof import("../../../src/hooks/useSession")>()),
  useSession: () => ({ user: { id: "1" } }),
}));

const node = { id: "node-self", publicKey: "aabbcc" };
const NOTICE = "The guest password is shared with volunteer observers so they can ask this repeater for its stats. Never enter an admin password.";

function mount(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/?tab=Nodes&node=node-self"]}>
        <RequestTelemetry node={node} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { client, ...view };
}

beforeEach(() => {
  vi.mocked(requests.list).mockResolvedValue({ limit: 3, requests: [] });
});
afterEach(() => vi.clearAllMocks());

describe("RequestTelemetry", () => {
  it("offers the form with the notice, the count and a masked guest password", async () => {
    vi.mocked(requests.list).mockResolvedValue({ limit: 3, requests: [req({ id: "x", node: { id: "other", publicKey: "dd", name: "Other" } })] });
    mount();
    expect(await screen.findByRole("button", { name: "Request telemetry" })).toBeEnabled();
    const field = screen.getByLabelText("Guest password (optional)");
    expect(field).toHaveAttribute("type", "password");
    expect(field).toHaveAttribute("autocomplete", "off");
    expect(field).toHaveAttribute("maxlength", "15");
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    expect(screen.getByText("1 of 3 requests used")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(field).toHaveAttribute("type", "text");
  });

  it("creates the request with the password, then clears the field and refetches", async () => {
    vi.mocked(requests.create).mockResolvedValue(req());
    mount();
    const field = await screen.findByLabelText("Guest password (optional)");
    fireEvent.change(field, { target: { value: "guest" } });
    fireEvent.click(screen.getByRole("button", { name: "Request telemetry" }));
    await waitFor(() => expect(requests.create).toHaveBeenCalledWith("node-self", "guest"));
    await waitFor(() => expect(requests.list).toHaveBeenCalledTimes(2));
    expect((screen.queryByLabelText("Guest password (optional)") as HTMLInputElement | null)?.value ?? "").toBe("");
  });

  it("sends no password when the field is empty", async () => {
    vi.mocked(requests.create).mockResolvedValue(req());
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Request telemetry" }));
    await waitFor(() => expect(requests.create).toHaveBeenCalledWith("node-self", undefined));
  });

  it("shows the status in words and a link to the profile once requested", async () => {
    vi.mocked(requests.list).mockResolvedValue({ limit: 3, requests: [req({ status: "login_failed" })] });
    mount();
    expect(await screen.findByText("The repeater refused the password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage in profile" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request telemetry" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Guest password (optional)")).not.toBeInTheDocument();
  });

  it("shows what the observer reports in the request block", async () => {
    const poller = { observerId: "o1", name: "North", state: "not_direct" };
    vi.mocked(requests.list).mockResolvedValue({ limit: 3, requests: [req({ poller })] });
    mount();
    const line = await screen.findByText("Assigned to North, which cannot hear this repeater directly right now.");
    expect(line.previousElementSibling).toHaveAttribute("data-tone", "wait");
  });

  it("matches an existing request by public key when the node id differs", async () => {
    vi.mocked(requests.list).mockResolvedValue({ limit: 3, requests: [req({ node: { id: null, publicKey: "AABBCC", name: "Hilltop" } })] });
    mount();
    expect(await screen.findByText("Being polled")).toBeInTheDocument();
  });

  it("disables the button at the limit and says so", async () => {
    vi.mocked(requests.list).mockResolvedValue({
      limit: 1, requests: [req({ id: "x", node: { id: "other", publicKey: "dd", name: "Other" } })],
    });
    mount();
    expect(await screen.findByRole("button", { name: "Request telemetry" })).toBeDisabled();
    expect(screen.getByText("You have used all of your requests. Remove one in your profile to ask for another.")).toBeInTheDocument();
  });

  it.each([
    ["request_limit", "You have used all of your telemetry requests."],
    ["already_requested", "You already asked for this repeater."],
    ["not_a_repeater", "Only repeaters and room servers can be polled."],
    ["password_invalid", "The password must be 1 to 15 characters."],
    ["no_password_blocked", "This repeater gives admin access without a password, so it cannot be polled this way"],
    ["requests_disabled", "Telemetry requests are not enabled on this server."],
  ])("maps %s to its text and does not echo the password", async (code, text) => {
    vi.mocked(requests.create).mockRejectedValue(authError(code, 409, "server said guestpw"));
    mount();
    fireEvent.change(await screen.findByLabelText("Guest password (optional)"), { target: { value: "guestpw" } });
    fireEvent.click(screen.getByRole("button", { name: "Request telemetry" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(document.body.textContent).not.toContain("guestpw");
  });
});
