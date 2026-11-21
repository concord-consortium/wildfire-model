import * as React from "react";
import { render, screen, within } from "@testing-library/react";
import { AboutDialogContent } from "../top-bar/about-dialog-content";
import { ShareDialogContent } from "../top-bar/share-dialog-content";

const webLinks = [
  ["MIT License", "https://github.com/concord-consortium/wildfire-model/blob/master/LICENSE"],
  ["Terms of Use", "https://concord.org/terms-of-use/"],
  ["concord.org/licensing", "https://concord.org/licensing"]
];

describe.each([
  ["About", AboutDialogContent],
  ["Share", ShareDialogContent]
])("license copy in the %s dialog", (_name, Content) => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2031-03-04T12:00:00Z") });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("links the MIT License, Terms of Use and licensing page in a new tab", () => {
    render(<Content />);
    const copy = within(screen.getByTestId("license-copy"));
    expect(copy.getAllByRole("link")).toHaveLength(4);
    for (const [text, href] of webLinks) {
      const link = copy.getByRole("link", { name: `${text} (opens in a new tab)` });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("links the licensing email in the same tab", () => {
    render(<Content />);
    const mail = within(screen.getByTestId("license-copy")).getByRole("link", { name: "licensing@concord.org" });
    expect(mail).toHaveAttribute("href", "mailto:licensing@concord.org");
    expect(mail).not.toHaveAttribute("target");
    expect(mail).not.toHaveAttribute("rel");
  });

  it("shows the approved copy, in order, with the current year", () => {
    render(<Content />);
    const copy = screen.getByTestId("license-copy");
    // The paragraphs' text runs together because nothing separates the <p> elements.
    expect(copy.textContent?.replace(/\s+/g, " ").trim()).toBe([
      "Wildfire Explorer is free, open-source software. The Wildfire Explorer source code is released under " +
      "the MIT License (opens in a new tab), so you’re welcome to use, modify, and build on it.",
      "Your use of Wildfire Explorer at wildfire.concord.org is governed by our Terms of Use (opens in a new " +
      "tab). The hosted version is free for non-commercial use; commercial use requires a separate written " +
      "agreement. For more information, visit concord.org/licensing (opens in a new tab) or contact " +
      "licensing@concord.org.",
      "© 2031 The Concord Consortium, Inc."
    ].join(""));
    for (const lead of ["Wildfire Explorer is free, open-source software.", "Your use of Wildfire Explorer at wildfire.concord.org"]) {
      expect(within(copy).getByText(lead).tagName).toBe("STRONG");
    }
    expect(within(copy).getByText("© 2031 The Concord Consortium, Inc.")).toBeInTheDocument();
  });

  it("computes the copyright year when it renders", () => {
    jest.setSystemTime(new Date("2047-11-20T12:00:00Z"));
    render(<Content />);
    expect(screen.getByTestId("license-copy")).toHaveTextContent("© 2047 The Concord Consortium, Inc.");
  });

  it("is the last block in the dialog", () => {
    const { container } = render(<Content />);
    expect(container).toHaveTextContent(/© 2031 The Concord Consortium, Inc\.$/);
  });

  it("drops the old Creative Commons copyright block", () => {
    render(<Content />);
    expect(document.body).not.toHaveTextContent(/Creative Commons|CC BY|All rights reserved/);
  });
});
