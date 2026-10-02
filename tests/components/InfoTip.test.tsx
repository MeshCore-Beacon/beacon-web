import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { InfoTip } from "../../src/components/InfoTip";

it("keeps the note out of the layout until hovered or focused", () => {
  render(<p>Heading <InfoTip text={["First note.", "Second note."]} /></p>);
  const button = screen.getByRole("button", { name: /First note\. Second note\./ });
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  fireEvent.mouseEnter(button.parentElement!);
  expect(screen.getByRole("tooltip")).toHaveTextContent("First note.Second note.");
  fireEvent.mouseLeave(button.parentElement!);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  fireEvent.focus(button);
  expect(screen.getByRole("tooltip")).toBeInTheDocument();
});

it("does not toggle a details section when clicked inside its summary", () => {
  render(<details><summary>More <InfoTip text="Note." /></summary><p>Body</p></details>);
  fireEvent.click(screen.getByRole("button", { name: /Note\./ }));
  expect(screen.getByRole("group")).not.toHaveAttribute("open");
});
