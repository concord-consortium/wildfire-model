import * as React from "react";
import { shallow } from "enzyme";
import { TopBar } from "./top-bar";

describe("TopBar component", () => {
  describe("Reload button", () => {
    it("reloads the model using window.location.reload", (done) => {
      const wrapper = shallow(
        <TopBar projectName="Test" />
      );
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { reload: jest.fn() },
      });
      wrapper.find('[data-test="reload"]').simulate("click");

      setTimeout(() => {
        expect(window.location.reload).toHaveBeenCalled();
        done();
      }, 150);
    });
  });

  describe("Share button", () => {
    it("opens share dialog", () => {
      const wrapper = shallow(
        <TopBar projectName="Test" />
      );
      expect(wrapper.find({open: true }).length).toEqual(0);
      wrapper.find("[data-test='share']").simulate("click");
      expect(wrapper.find({open: true }).length).toEqual(1);
    });
  });

  describe("About button", () => {
    it("opens about dialog", () => {
      const wrapper = shallow(
        <TopBar projectName="Test" />
      );
      expect(wrapper.find({open: true }).length).toEqual(0);
      wrapper.find("[data-test='about']").simulate("click");
      expect(wrapper.find({open: true }).length).toEqual(1);
    });
  });
});
