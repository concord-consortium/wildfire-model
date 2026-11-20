import * as React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "mobx-react";
import { createStores } from "../../models/stores";
import { TopBar } from "./top-bar";

const renderTopBar = () => {
  const stores = createStores();
  return render(
    <Provider stores={stores}>
      <TopBar projectName="Test" />
    </Provider>
  );
};

describe("TopBar component", () => {
  describe("Reload button", () => {
    it("reloads the model using window.location.reload", async () => {
      const reloadMock = jest.fn();
      Object.defineProperty(window, "location", {
        writable: true,
        value: { reload: reloadMock },
      });
      renderTopBar();
      await userEvent.click(screen.getByTestId("reload"));
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(reloadMock).toHaveBeenCalled();
    });
  });

  describe("in read-only report mode", () => {
    it("hides the reload button, including when read-only arrives after the first render", () => {
      const stores = createStores();
      render(
        <Provider stores={stores}>
          <TopBar projectName="Test" />
        </Provider>
      );
      expect(screen.getByTestId("reload")).toBeInTheDocument();
      act(() => {
        stores.ui.readOnly = true;
      });
      expect(screen.queryByTestId("reload")).not.toBeInTheDocument();
      expect(screen.getByTestId("share")).toBeInTheDocument();
      expect(screen.getByTestId("about")).toBeInTheDocument();
    });
  });

  describe("Share button", () => {
    it("opens share dialog", async () => {
      renderTopBar();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await userEvent.click(screen.getByTestId("share"));
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  describe("About button", () => {
    it("opens about dialog", async () => {
      renderTopBar();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await userEvent.click(screen.getByTestId("about"));
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  describe.each([
    { name: "Share", tabs: 1 },
    { name: "About", tabs: 2 }
  ])("$name button keyboard access", ({ name, tabs }) => {
    it("is reachable by Tab, opens with Enter, and gets focus back when the dialog closes", async () => {
      const user = userEvent.setup();
      renderTopBar();
      const button = screen.getByRole("button", { name });
      for (let i = 0; i < tabs; i++) {
        await user.tab();
      }
      expect(button).toHaveFocus();
      await user.keyboard("{Enter}");
      expect(await screen.findByRole("dialog")).toHaveAccessibleName(`${name}: Test`);
      expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(button).toHaveFocus();
    });

    it.each(["{Escape}", "Close"])("gets focus back after a click that does not focus it, as in Safari, closed by %s", async (closeBy) => {
      const user = userEvent.setup();
      renderTopBar();
      const button = screen.getByRole("button", { name });
      expect(document.body).toHaveFocus();
      fireEvent.click(button);
      expect(await screen.findByRole("dialog")).toHaveAccessibleName(`${name}: Test`);
      if (closeBy === "Close") {
        await user.click(screen.getByRole("button", { name: "Close" }));
      } else {
        await user.keyboard(closeBy);
      }
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(button).toHaveFocus();
    });

    it("focuses Close when reopened during the close animation", async () => {
      const user = userEvent.setup();
      renderTopBar();
      const button = screen.getByRole("button", { name });
      button.focus();
      await user.keyboard("{Enter}");
      await screen.findByRole("dialog");
      await user.keyboard("{Escape}");
      expect(button).toHaveFocus();
      expect(screen.getByRole("dialog", { hidden: true })).toBeInTheDocument();
      await user.keyboard("{Enter}");
      expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    });

    it("draws its dialog above the Hazbot coach mark", async () => {
      const user = userEvent.setup();
      renderTopBar();
      await user.click(screen.getByRole("button", { name }));
      await screen.findByRole("dialog");
      const [root] = screen.getAllByRole("presentation");
      expect(root).toHaveClass("MuiDialog-root");
      expect(root).toHaveStyle({ zIndex: "calc(var(--coachmarks-z-index) + 1)" });
    });
  });
});
