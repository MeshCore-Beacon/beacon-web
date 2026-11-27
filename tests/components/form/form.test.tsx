import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TextField } from "../../../src/components/form/TextField";
import { PasswordField } from "../../../src/components/form/PasswordField";
import { FormButton } from "../../../src/components/form/FormButton";
import { FormStatus } from "../../../src/components/form/FormStatus";

const base = { value: "", onChange: () => {}, name: "n", autoComplete: "username" };

describe("TextField", () => {
  it("ties the label to the input and reports changes", () => {
    const onChange = vi.fn();
    render(<TextField {...base} label="Username" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "ab" } });
    expect(onChange).toHaveBeenCalledWith("ab");
    expect(screen.getByLabelText("Username")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Username")).toHaveAttribute("name", "n");
  });

  it("describes the input by its hint and marks an error invalid with an alert", () => {
    render(<TextField {...base} label="Email" hint="We never share it" error="Bad email" />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Bad email");
    const ids = input.getAttribute("aria-describedby")!.split(" ");
    expect(ids).toContain(alert.id);
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toContain("We never share it");
  });

  it("has no alert and is valid without an error", () => {
    render(<TextField {...base} label="Email" />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-describedby");
  });

  it("uses a 16px font on phones and passes extra input props and disabled", () => {
    render(<TextField {...base} label="Email" type="email" inputMode="email" disabled required />);
    const input = screen.getByLabelText(/Email/);
    expect(input).toHaveClass("text-base");
    expect(input).toHaveAttribute("type", "email");
    expect(input).toBeDisabled();
    expect(input).toBeRequired();
  });
});

describe("PasswordField", () => {
  it("hides the password and toggles with an accessible show and hide control", () => {
    render(<PasswordField {...base} label="Password" autoComplete="current-password" value="secret" />);
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "current-password");
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    const hide = screen.getByRole("button", { name: "Hide password" });
    expect(hide).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(hide);
    expect(input).toHaveAttribute("type", "password");
  });

  it("supports new-password, errors and disabled", () => {
    render(<PasswordField {...base} label="New" autoComplete="new-password" error="Too short" disabled />);
    expect(screen.getByLabelText("New")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByRole("alert")).toHaveTextContent("Too short");
    expect(screen.getByLabelText("New")).toBeDisabled();
  });

  it("does not submit the form when the toggle is pressed", () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(<form onSubmit={onSubmit}><PasswordField {...base} label="Password" autoComplete="current-password" /></form>);
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("FormButton", () => {
  it("is a submit button by default", () => {
    render(<FormButton>Save</FormButton>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "submit");
  });

  it("shows busy text, is disabled and aria-busy, and ignores clicks", () => {
    const onClick = vi.fn();
    render(<FormButton busy busyLabel="Saving…" onClick={onClick}>Save</FormButton>);
    const b = screen.getByRole("button", { name: "Saving…" });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute("aria-busy", "true");
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps its children when busy without a busy label", () => {
    render(<FormButton busy>Save</FormButton>);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});

describe("FormStatus", () => {
  it("uses role=status for information and role=alert for errors", () => {
    const { rerender } = render(<FormStatus>Check your email</FormStatus>);
    expect(screen.getByRole("status")).toHaveTextContent("Check your email");
    rerender(<FormStatus kind="error">Nope</FormStatus>);
    expect(screen.getByRole("alert")).toHaveTextContent("Nope");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders nothing without children", () => {
    const { container } = render(<FormStatus kind="error">{null}</FormStatus>);
    expect(container).toBeEmptyDOMElement();
  });
});
