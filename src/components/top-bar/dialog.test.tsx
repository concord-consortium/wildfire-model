import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "./dialog";

describe("Dialog component", () => {
  it("is a modal dialog named by its title", () => {
    render(<Dialog open={true} onClose={jest.fn()} title="About: Wildfire Explorer" />);
    expect(screen.getByRole("dialog", { name: "About: Wildfire Explorer" })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { level: 2, name: "About: Wildfire Explorer" })).toBeInTheDocument();
  });

  it("moves focus to its Close button when it opens", () => {
    render(<Dialog open={true} onClose={jest.fn()} title="About: Wildfire Explorer" />);
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("closes from its Close button", async () => {
    const onClose = jest.fn();
    render(<Dialog open={true} onClose={onClose} title="About: Wildfire Explorer" />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", async () => {
    const onClose = jest.fn();
    render(<Dialog open={true} onClose={onClose} title="About: Wildfire Explorer" />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
