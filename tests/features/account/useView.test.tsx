import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { useView } from "../../../src/features/account/useView";
import { renderAt, searchOf } from "./helpers";

function Harness() {
  const { view, open, close } = useView();
  return (
    <>
      <span data-testid="view">{view ?? "none"}</span>
      <button onClick={() => open("verify", { token: "abc" })}>open verify</button>
      <button onClick={() => open("signin", { app: "1", code_challenge: "c", state: "s" })}>open app</button>
      <button onClick={() => open("signin")}>open plain</button>
      <button onClick={close}>close</button>
    </>
  );
}

describe("useView", () => {
  it("reads a known view and ignores an unknown one", () => {
    renderAt("?view=register", <Harness />);
    expect(screen.getByTestId("view")).toHaveTextContent("register");
  });

  it("drops the portal error when a view opens or closes", () => {
    renderAt("?view=signin&error=portal", <Harness />);
    fireEvent.click(screen.getByText("close"));
    expect(searchOf(screen.getByTestId("search")).get("error")).toBeNull();
  });

  it("reads null for an unknown view", () => {
    renderAt("?view=nope", <Harness />);
    expect(screen.getByTestId("view")).toHaveTextContent("none");
  });

  it("opens with its own params and leaves tab and the rest alone", () => {
    renderAt("?tab=Nodes&iata=YVR", <Harness />);
    fireEvent.click(screen.getByText("open verify"));
    const p = searchOf(screen.getByTestId("search"));
    expect(p.get("view")).toBe("verify");
    expect(p.get("token")).toBe("abc");
    expect(p.get("tab")).toBe("Nodes");
    expect(p.get("iata")).toBe("YVR");
  });

  it("drops the previous view's params when opening another", () => {
    renderAt("?view=verify&token=abc&tab=Map", <Harness />);
    fireEvent.click(screen.getByText("open plain"));
    const p = searchOf(screen.getByTestId("search"));
    expect(p.get("view")).toBe("signin");
    expect(p.has("token")).toBe(false);
    expect(p.get("tab")).toBe("Map");
  });

  it("closes by removing view, token, app, code_challenge and state only", () => {
    renderAt("?tab=Map&view=signin&app=1&code_challenge=c&state=s&token=t&lat=1", <Harness />);
    act(() => fireEvent.click(screen.getByText("close")));
    const p = searchOf(screen.getByTestId("search"));
    expect([...p.keys()].sort()).toEqual(["lat", "tab"]);
  });

  it("keeps the token from the page's first URL after the fragment is gone", async () => {
    window.history.replaceState({}, "", "/?view=verify#token=boot");
    vi.resetModules();
    const fresh = await import("../../../src/features/account/useView");
    window.history.replaceState({}, "", "/?view=verify&iata=YOW");
    expect(fresh.linkToken(window.location)).toBe("boot");
    expect(fresh.linkToken({ search: "", hash: "#token=newer" })).toBe("newer");
    window.history.replaceState({}, "", "/");
  });
});
