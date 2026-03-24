import * as React from "react";
import { render, screen } from "@testing-library/react";
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
});
