# Implementation Plan: Terms of Use Link and Licensing Copy for Wildfire Explorer

**Jira**: https://concord-consortium.atlassian.net/browse/WM-67
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Implementation Plan

Four commits on `WM-67-add-terms-of-use-link`: the license copy in both dialogs, then the dialog's heading and Close button, then About and Share as buttons, then Reload as a button. No dependency or lockfile changes: `@testing-library/user-event` 14.4.3 is already a dev dependency, and it resolves the same `@testing-library/dom` (9.3.0) that `@testing-library/react` 14 configures, so the act() warnings TE-10 hit do not arise. No CI change: `ci.yml` is already on `cypress-io/github-action@v7` (requirements.md, Technical Notes). Every code block below applies to master as written, and each step type-checks, lints and passes its tests on its own (see Verification). R9 and R13 need no code; R16 is Kiley's review.

### License copy in the About and Share dialogs

**Summary**: Adds the license-copy component, its new-tab link and its link constants, renders it as the last block of both dialog contents in place of `Copyright`, deletes `copyright.tsx`, and tests the copy through both dialogs. Covers R1 to R8, R14, and the copyright-size half of R15's Cypress spec.

**Files affected**:
- `src/components/license/license-constants.ts` (new): the four link targets.
- `src/components/license/external-link.tsx` and `external-link.scss` (new): the new-tab link with its hidden hint.
- `src/components/license/license-copy.tsx` and `license-copy.scss` (new): the copy.
- `src/components/license/license-copy.test.tsx` (new).
- `src/components/top-bar/about-dialog-content.tsx`, `src/components/top-bar/share-dialog-content.tsx`: render `LicenseCopy` in place of `Copyright`.
- `src/components/top-bar/copyright.tsx`: deleted.
- `cypress/e2e/top-bar-visuals.cy.ts` (new): the copyright line's size.

**Estimated diff size**: ~175 lines.

`src/components/license/license-constants.ts`:

```ts
export const kMitLicenseUrl = "https://github.com/concord-consortium/wildfire-model/blob/master/LICENSE";
export const kTermsOfUseUrl = "https://concord.org/terms-of-use/";
export const kLicensingUrl = "https://concord.org/licensing";
export const kLicensingEmail = "licensing@concord.org";
```

`src/components/license/external-link.tsx`:

```tsx
import * as React from "react";
import css from "./external-link.scss";

interface IProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "target" | "rel"> {
  href: string;
  children: React.ReactNode;
}

// A link that opens in a new tab and tells screen-reader users that it does.
export const ExternalLink = ({ href, children, ...others }: IProps) => (
  <a {...others} href={href} target="_blank" rel="noopener noreferrer">
    {children}
    <span className={css.visuallyHidden}> (opens in a new tab)</span>
  </a>
);
```

`src/components/license/external-link.scss`:

```scss
.visuallyHidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

`src/components/license/license-copy.tsx`:

```tsx
import * as React from "react";
import { ExternalLink } from "./external-link";
import { kLicensingEmail, kLicensingUrl, kMitLicenseUrl, kTermsOfUseUrl } from "./license-constants";
import css from "./license-copy.scss";

export const LicenseCopy = () => (
  <div className={css.licenseCopy} data-testid="license-copy">
    <p>
      <strong>Wildfire Explorer is free, open-source software.</strong> The Wildfire Explorer source code is
      released under the <ExternalLink href={kMitLicenseUrl}>MIT License</ExternalLink>, so you’re welcome to use,
      modify, and build on it.
    </p>
    <p>
      <strong>Your use of Wildfire Explorer at wildfire.concord.org</strong> is governed by
      our <ExternalLink href={kTermsOfUseUrl}>Terms of Use</ExternalLink>. The hosted version is free for
      non-commercial use; commercial use requires a separate written agreement. For more information,
      visit <ExternalLink href={kLicensingUrl}>concord.org/licensing</ExternalLink> or
      contact <a href={`mailto:${kLicensingEmail}`}>{kLicensingEmail}</a>.
    </p>
    <p className={css.copyright}>© {new Date().getFullYear()} The Concord Consortium, Inc.</p>
  </div>
);
```

`src/components/license/license-copy.scss`:

```scss
.licenseCopy {
  a {
    text-decoration: underline;
  }
}

.copyright {
  font-size: 12px;
}
```

`about-dialog-content.tsx` and `share-dialog-content.tsx`: replace the `Copyright` import (`import {Copyright} from "./copyright";` and `import { Copyright } from "./copyright";`) with `import { LicenseCopy } from "../license/license-copy";`, and the last element (`<Copyright />`, `<Copyright/>`) with `<LicenseCopy />`. Share's "Suggested citation" paragraph stays above it. Delete `src/components/top-bar/copyright.tsx`.

`src/components/license/license-copy.test.tsx`:

```tsx
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
```

Differences from HURR-70's `license-copy.test.tsx`, each forced by this repo:

- **No `[...nodeList]`**: `tsconfig.json` targets ES5 without `downlevelIteration`, so spreading a `NodeList` fails type-checking in ts-jest (TS2461).
- **No `querySelectorAll` or `nextElementSibling`**: the Jest override in `.eslintrc.js` extends `plugin:testing-library/react`, whose `no-node-access` and `prefer-presence-queries` rules reject them as errors under `npm run lint:build`. The `paragraph` and `strong` roles are not an option either: the installed aria-query (5.1.3) maps neither `<p>` nor `<strong>` to a role. So the copy is asserted as one string (which still fixes the paragraph order, since a swap changes it), the bold lead-ins by `getByText` plus `tagName`, and "last block" as the content's text ending with the copyright line.
- **Data-test attribute**: `data-testid`, the repo's existing convention (`top-bar.tsx`), so `getByTestId` needs no `testIdAttribute` config.
- **No stores or upload mock**: Wildfire's Share content renders from `window.location.href` alone.

`cypress/e2e/top-bar-visuals.cy.ts`, since jsdom applies no stylesheet and cannot see the 12px (R3):

```ts
// cypress/e2e/top-bar-visuals.cy.ts
//
// Layout checks for the top bar and its dialogs. jsdom applies no stylesheet, so
// computed sizes and on-screen positions are observable only here.

describe("Top bar and dialog layout", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  ["about", "share"].forEach((testid) => {
    it(`shows the ${testid} dialog's copyright line at 12px`, () => {
      cy.get(`[data-testid="${testid}"]`).click();
      cy.get('[role="dialog"]')
        .contains("p", /^© \d{4} The Concord Consortium, Inc\.$/)
        .should("have.css", "font-size", "12px");
    });
  });
});
```

The old `0.8em` computes to 12.8px against the dialog's 16px paragraphs, so restoring it fails both tests.

---

### Dialog heading and Close button

**Summary**: Gives the shared top-bar `Dialog` a level-2 heading that names it and a real Close button, as Hurricane's `dialog.tsx` does, and makes `title` required, since both callers pass one and an untitled dialog would have no name. Covers R11 (name, Close, and focus on Close every time it opens) and R12, including drawing above the Hazbot coach mark, and the dialog half of R15.

**Files affected**:
- `src/components/top-bar/dialog.tsx`: heading with an id, `aria-labelledby` on the MUI dialog, Close button focused from the transition's `onEnter`, z-index above the coach mark.
- `src/components/common.scss`: `$focusOutlineWidth`, shared with the top-bar buttons' outline in the next step.
- `src/components/top-bar/dialog.scss`: reset the heading's margin; reset the button and give it a focus outline.
- `src/components/top-bar/dialog.test.tsx`: replace the role-only test.

**Estimated diff size**: ~75 lines.

`src/components/top-bar/dialog.tsx`, in full:

```tsx
import * as React from "react";
import MuiDialog from "@mui/material/Dialog";
import CloseIcon from "@mui/icons-material/Close";
import css from "./dialog.scss";

interface IProps {
  onClose: () => void;
  open: boolean;
  title: string;
  children?: JSX.Element | JSX.Element[];
}

export const Dialog: React.FC<IProps> = ({ onClose, open, title, children }) => {
  const titleId = React.useId();
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const focusClose = () => closeRef.current?.focus();
  return (
    <MuiDialog
      onClose={onClose}
      open={open}
      maxWidth="lg"
      aria-labelledby={titleId}
      TransitionProps={{ onEnter: focusClose }}
      sx={{ zIndex: "calc(var(--coachmarks-z-index) + 1)" }}
    >
      <div className={css.dialogBody}>
        <h2 id={titleId} className={css.title}>{ title }</h2>
        <button type="button" aria-label="Close" className={css.closeButton} onClick={onClose} ref={closeRef}>
          <CloseIcon />
        </button>
        <div className={css.content}>{ children }</div>
      </div>
    </MuiDialog>
  );
};
```

Passing `aria-labelledby` straight to `MuiDialog` is enough here: MUI 5.13's `Dialog` forwards it to the paper and only generates an id of its own when the prop is undefined, which `title` being required rules out. (Hurricane routes it through `slotProps.paper` because its dialog also supports an untitled, `aria-label` form.) `onClose` stays as is, so Esc and a backdrop click still close the dialog.

The `sx` z-index puts the dialog one layer above the Hazbot coach mark, derived from the library's own `--coachmarks-z-index` rather than a copied 10001 (requirements.md, Technical Notes).

The Fade transition's `onEnter` puts focus on Close every time the dialog opens. Without it, MUI's focus trap focuses its own `role="presentation"` container, which wraps the `role="dialog"` paper, so focus would start outside the named dialog. `autoFocus` is not enough: MUI keeps a closing dialog mounted through its 225ms exit fade, so reopening during the fade does not remount Close, while react-transition-group calls `onEnter` on every enter, including one that interrupts an exit. A `useEffect` on `open` does not work either: on the first open MUI's `Portal` mounts the children after `Dialog`'s effect has run, so the ref is still empty. MUI still returns focus to the opener on close, because it records the opener from the focus event's `relatedTarget` when focus enters the dialog. Unlike HURR-70's opt-in `focusCloseOnOpen` prop, this is unconditional: `top-bar.tsx` is this `Dialog`'s only caller and renders only About and Share, so no other dialog's own focus target competes with it.

`src/components/common.scss`, after `$controlLabel`:

```scss
$focusOutlineWidth: 2px;
```

`src/components/top-bar/dialog.scss`, `.title` and `.closeButton`:

```scss
.title {
  margin: 0;
  font-size: 1.2em;
  font-weight: 700;
}

.closeButton {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  padding: 0;
  border: none;
  background: none;
  color: #797979;
  cursor: pointer;
  &:hover {
    color: $controlLabel;
  }
  &:focus-visible {
    outline: $focusOutlineWidth solid $controlLabel;
    outline-offset: 2px;
  }
}
```

`margin: 0` keeps the `<h2>` where the `<div>` was, and `display: flex` with no padding keeps the 24px icon box at the same spot (both measured, R12).

`src/components/top-bar/dialog.test.tsx`, in full:

```tsx
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "./dialog";

describe("Dialog component", () => {
  it("is a dialog named by its title", () => {
    render(<Dialog open={true} onClose={jest.fn()} title="About: Wildfire Explorer" />);
    expect(screen.getByRole("dialog", { name: "About: Wildfire Explorer" })).toBeInTheDocument();
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
```

---

### About and Share as buttons

**Summary**: Turns the Share and About `<span>`s into `<button type="button">`s that look as before, with a focus outline inside the 22px top bar, and focuses the button on click so the dialog returns focus to it in macOS Safari and Firefox. Covers R10, including its logs, the focus-return part of R11, and the top-bar half of R15.

**Files affected**:
- `src/components/top-bar/top-bar.tsx`: the two buttons; the open handlers focus their button.
- `src/components/top-bar/top-bar.scss`: button reset, line-height and focus outline.
- `src/components/top-bar/top-bar.test.tsx`: keyboard, focus-return, reopen and z-index tests.
- `src/components/log-events.test.tsx`: the two dialog-opened logs.

**Estimated diff size**: ~107 lines.

`src/components/top-bar/top-bar.tsx`, the open handlers:

```tsx
  // macOS Safari and Firefox do not focus a button on click, so focus it here for the dialog to restore focus to on close.
  const handleShareOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.focus();
    setShareOpen(true);
    log("ShareDialogOpened");
  };
  const handleAboutOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.focus();
    setAboutOpen(true);
    log("AboutDialogOpened");
  };
```

and the two controls, replacing the `<span data-testid="share">` and `<span data-testid="about">` lines:

```tsx
        <button type="button" data-testid="share" className={css.textButton} onClick={handleShareOpen}>
          Share
        </button>
        <button type="button" data-testid="about" className={css.textButton} onClick={handleAboutOpen}>
          About
        </button>
```

Reload stays a `<span>` until the next step.

`src/components/top-bar/top-bar.scss`: two variables after the `@import`, and a rule at the end of `.topBar`:

```scss
$focusOutlineOffset: 1px;
// Sized so the whole focus outline stays inside the top bar instead of spilling onto the canvas below it.
// The extra 1px absorbs the half pixel the text buttons sit below the bar's center on the wrapper's text baseline.
$buttonHeight: $topBarHeight - 2 * ($focusOutlineWidth + $focusOutlineOffset) - 1px;
```

```scss
  button.textButton {
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    color: inherit;
    line-height: $buttonHeight;
    &:focus-visible {
      outline: $focusOutlineWidth solid $controlLabel;
      outline-offset: $focusOutlineOffset;
    }
  }
```

The existing `.textButton` rule still supplies the margins, the pointer cursor and the hover color: `.topBar .textButton:hover` outranks `.topBar button.textButton`, so `color: inherit` does not cancel the hover.

`src/components/top-bar/top-bar.test.tsx`: import `fireEvent` and `waitFor` from `@testing-library/react` alongside `act`, `render` and `screen`, and add inside the outer `describe`:

```tsx
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
```

Reload is still a `<span>` in this step, so Share is the first Tab stop and About the second; the next step moves them to second and third. `fireEvent.click` does not move focus in jsdom, which stands in for Safari's click; focus starts on the body, as it would after clicking the model. The reopen test checks the dialog is still mounted, mid-fade, before pressing Enter again. MUI's modal root is the first `role="presentation"` element (the `MuiDialog-root` class assertion pins it, without the node access the lint rules forbid). jsdom does not stack layers, so the z-index test checks only the computed value: derived from the coach mark's variable and one above it. Without the `sx` line it reads MUI's 1300 and fails; a hard-coded 10002 fails too.

`src/components/log-events.test.tsx`, a new `describe` at the end of `"Log events"`, since this step rewrites both handlers and nothing else tests their logs:

```tsx
  describe("dialog opened", () => {
    it.each(["Share", "About"])("fires %sDialogOpened from its top-bar button", async (name) => {
      render(
        <Provider stores={stores}>
          <TopBar projectName="Test" />
        </Provider>
      );
      await userEvent.click(screen.getByRole("button", { name }));
      expect(mockLog).toHaveBeenCalledWith(`${name}DialogOpened`);
    });
  });
```

---

### Reload as a button

**Summary**: Turns Reload's `<span>` into a `<button type="button">` named "Reload" with a matching tooltip, as HURR-70 did, keeping its icon where it is with a focus outline inside the bar, and adds the Cypress check that Tab follows the on-screen order. Covers the Reload and Tab-order parts of R10 and their tests in R15. Kiley asked for both in her 2026-11-19 review.

**Files affected**:
- `src/components/top-bar/top-bar.tsx`: the Reload button.
- `src/components/top-bar/top-bar.scss`: the icon button's height and icon placement; the span-only `svg` margin goes.
- `src/components/top-bar/top-bar.test.tsx`: the Reload keyboard test; Share and About move one Tab stop later.
- `cypress/e2e/top-bar-visuals.cy.ts`: the Tab-order check.

**Estimated diff size**: ~60 lines.

`src/components/top-bar/top-bar.tsx`, replacing the `<span className={css.textButton} data-testid="reload" …>` line:

```tsx
        : <button
            type="button"
            className={`${css.textButton} ${css.iconButton}`}
            data-testid="reload"
            aria-label="Reload"
            title="Reload"
            onClick={handleReload}
          >
            <RefreshIcon />
          </button>}
```

`handleReload` is unchanged. Unlike Share and About it needs no `focus()` on click: it opens no dialog that returns focus, and the page reloads.

`src/components/top-bar/top-bar.scss`: a variable after `$buttonHeight`:

```scss
// MUI's default icon size; its glyph leaves blank space around it inside that box.
$iconSize: 24px;
```

delete the `svg { margin-top: 4px; }` rule inside `.textButton`, which only Reload's icon used, and add at the end of `.topBar`:

```scss
  button.iconButton {
    height: $buttonHeight;
    svg {
      display: block;
      margin: ($buttonHeight - $iconSize) * 0.5 0;
    }
  }
```

The button is a flex item of `.topBar`, so `align-items: center` puts its 15px box at 3.5 to 18.5px, and the negative margin centers the 24px icon on it, at master's -1 to 23px. It takes the existing `.textButton` margins, hover color and pointer cursor, and the `button.textButton` reset and focus outline.

`src/components/top-bar/top-bar.test.tsx`: in the `describe.each`, Share's `tabs` becomes 2 and About's 3, and inside `describe("Reload button")`, after the existing test:

```tsx
    it("is the first Tab stop, is named Reload with a matching tooltip, and reloads on Enter", async () => {
      const reloadMock = jest.fn();
      Object.defineProperty(window, "location", {
        writable: true,
        value: { reload: reloadMock },
      });
      const user = userEvent.setup();
      renderTopBar();
      await user.tab();
      const reload = screen.getByRole("button", { name: "Reload" });
      expect(reload).toHaveFocus();
      expect(reload).toHaveAttribute("aria-label", "Reload");
      expect(reload).toHaveAttribute("title", "Reload");
      await user.keyboard("{Enter}");
      await waitFor(() => expect(reloadMock).toHaveBeenCalled());
    });
```

`cypress/e2e/top-bar-visuals.cy.ts`: a constant after the header comment,

```ts
const TOP_BAR_BUTTONS = '[data-testid="reload"], [data-testid="share"], [data-testid="about"]';
```

and a test after the `forEach`:

```ts
  it("lays its buttons out left to right in Tab order", () => {
    // jQuery returns the matches in DOM order, which is the order Tab visits them.
    cy.get(TOP_BAR_BUTTONS).should("have.length", 3).then(($buttons) => {
      const lefts = $buttons.toArray().map((button) => button.getBoundingClientRect().left);
      expect(lefts, "left edges in DOM order").to.deep.eq(lefts.slice().sort((a, b) => a - b));
    });
  });
```

The Jest Tab counts pin the DOM order; this test pins that the screen agrees with it, which jsdom cannot see. A Seismic-style `float: right` on Share and About keeps the DOM order, so Jest stays green, but draws About left of Share and fails this test.

## Verification

Measured with the four steps applied to master as throwaway code, Node 22:

- **Each step alone, in order**: the license and top-bar suites pass 17/17 after the first step, 20/20 after the second; with the first three, those suites plus `log-events` and `interactive-state` (which render `TopBar`) pass 87/87, and with all four 88/88.
- **Full Jest**: 97 suites, 1249 tests, all passing (master: 96 suites, 1221 tests), so 28 new tests.
- **Type-check**: `npx tsc --noEmit -p .` reports 51 errors after every step, the same 51 as master, none in the changed files.
- **Lint**: `npm run lint:build`, which covers `cypress/` too, gives 0 errors and 135 warnings, the same as master, none in the changed files. `npx tsc --noEmit -p cypress` reports nothing in the new spec.
- **Build**: the production webpack build compiles with all four steps applied; it was not run per step.
- **Mutations**, each failing at least one test: a hardcoded year; a wrong MIT URL; no new-tab hint; `rel="noopener"` alone; the mailto link through `ExternalLink`; a straight apostrophe; either lead-in not bold; the copyright line removed; the copy dropped from About or from Share; an old CC BY-NC line left beside the copy; a block after the copy in About or in Share; no `aria-labelledby`; the title back to a `<div>`; Close back to a bare icon; `onClose` not passed to MUI (Esc); Share or About back to a `<span>`; no `focus()` in either open handler (4 tests fail: Esc and Close for each button); `disableRestoreFocus` on the dialog (8 fail); either open handler's `log` call removed; no `onEnter` (5 fail); `autoFocus` on Close in place of `onEnter` (2 fail: the reopen tests); the `sx` z-index removed, or hard-coded to 10002 (2 fail each: the z-index tests); Reload back to a `<span>` (3 fail: the Reload test and both Tab-count tests); Reload's `aria-label` removed (1 fails; the name alone would still be "Reload", taken from the `title`, so the test asserts the attribute too); Reload's `title` removed (1 fails); Share and About swapped in the JSX (2 fail: the Tab-count tests).
- **Browser** (dev server, 1280 × 800, Chromium and Firefox): Share and About text at the same x and y as master; focus ring 0.5 to 21.5px; hover color unchanged; opening by Enter focuses Close with a ring, opening by a mouse click focuses it without one; Esc, a backdrop click and Close each end with focus on the opening button. Opened by a script `click()` with focus on the body, Esc and Close return focus to the button; a reopen 60ms after Esc, with the dialog still mounted, focuses Close. With Hazbot on (`?hazbotRules=23`) and off, `--coachmarks-z-index` resolves to 10001 and the dialog's z-index to 10002, and the dialog draws over the coach mark whichever opens first. The About and Share dialog measurements in the Share snippet's 1000 × 800 iframe and a 1000 × 500 one are in requirements.md's Technical Notes. WebKit could not launch on this machine, so Safari was not run.
- **Cypress** (`top-bar-visuals.cy.ts` alone, headless Chrome against the dev server, all four steps applied): 3/3 pass. The copyright line back at `0.8em` fails both size tests (12.8px); `float: right` on Share and About fails the order test while all of Jest still passes. The rest of the Cypress suite was not run locally, since no other spec touches the top bar or the dialogs; CI runs it on push.
- **Reload in the browser** (dev server, 1280 × 800, Chromium and Firefox): the button box is 24 × 15 at (11, 3.5), the icon at (11, -1) as on master, the focus ring at 8 to 38 by 0.5 to 21.5px; hover turns it `#434343` as before; Tab from the page goes Reload, Share, About, then on into the model, each with a ring. The copyright line computes to 12px in both dialogs.

## Open Questions

<!-- Implementation-focused questions only. Requirements questions go in requirements.md. -->

### RESOLVED: Judgment call: how are the commits split?
**Context**: HURR-70 shipped the copy in one commit and the buttons in another; Wildfire also needs the dialog's heading and Close button, which Hurricane already had.

**Options considered**:
- A) Three commits: copy; dialog heading and Close; buttons.
- B) Two commits, with the dialog changes folded into the button commit.

**Decision**: A. The dialog change is decision 7 and the buttons are decision 4; each commit then has one reason, and the button tests can name the dialog because the heading step lands first. Kiley's review adds a fourth, for Reload (below).

### RESOLVED: Judgment call: where does the focus-outline style live?
**Context**: HURR-70 moved its outline into a shared `focusOutline` mixin in `common.scss`, because Hurricane's dialog buttons already had the same three lines. Wildfire's `common.scss` has no dialog-button mixin and no existing focus style.

**Options considered**:
- A) A rule in each of `top-bar.scss` and `dialog.scss`, sharing only `$focusOutlineWidth` from `common.scss`.
- B) A new shared mixin in `common.scss` used by both.

**Decision**: A. Two rules in two files of the same folder; a shared mixin would be new infrastructure for this story alone. Both use `$controlLabel` and `$focusOutlineWidth`; the offsets stay local because they differ on purpose (1px in the bar, 2px around Close, which has room).

### RESOLVED: Judgment call: how does the copy test stay inside the repo's lint rules?
**Context**: HURR-70's test reads paragraphs with `querySelectorAll` and checks `nextElementSibling`, which `npm run lint:build` here rejects (see the first step's notes).

**Options considered**:
- A) Assert through Testing Library queries and text content only.
- B) Keep HURR-70's assertions and add `eslint-disable` comments.

**Decision**: A. Every assertion geo-common's Tests paragraph lists is still made, and the mutations above still fail.

### RESOLVED: Judgment call: does Reload keep both `aria-label` and `title`?
**Context**: Either attribute alone names the button "Reload": with no `aria-label`, the accessible name falls back to the `title`, so a test of the name alone cannot see `aria-label` go.

**Options considered**:
- A) Both, as HURR-70 has them.
- B) `title` alone, which names it and gives the tooltip.
- C) `aria-label` alone, with no tooltip.

**Decision**: A. Kiley asked for the Geo apps to match, and Hurricane's Reload has both; the name then does not depend on keeping the tooltip. The test asserts the name and both attributes, as FM-5's does, so dropping either one fails it.

### RESOLVED: Judgment call: is Reload its own commit?
**Context**: Reload could fold into the About and Share step, which already restyles the top-bar buttons.

**Options considered**:
- A) A fourth step for Reload and the Tab-order check.
- B) Reload inside the About and Share step.

**Decision**: A. About and Share are geo-common decision 4; Reload and the order check are Kiley's review. The About and Share step stays as reviewed, and it already introduces `$buttonHeight` so Reload can reuse it.

## Self-Review

Roles: commit reviewer, test writer, reader a year from now. Checked with the plan applied to master as throwaway code: every new file's code block matches the tested file byte for byte, and every partial block appears verbatim in its tested file; swapping the two copy paragraphs fails 2 tests, so the one-string assertion does fix their order; no planned comment describes a change or a fix.

### Commit reviewer

#### RESOLVED: "each step builds" claimed more than was run
The plan's opening said each step builds on its own, but the production webpack build ran only with all the steps applied; per step, only Jest, `tsc` and `lint:build` ran. The opening now says each step type-checks, lints and passes its tests on its own, and Verification says the build was not run per step.

### Self-review round 1

Roles: QA engineer, senior engineer, WCAG accessibility expert, Kiley as acceptance reviewer, coworker reviewer (the repeat findings in Doug's CLAUDE.md). Each issue was checked against master and the planned code applied as throwaway code; the accessibility and acceptance passes found nothing that survived that check.

#### RESOLVED: QA engineer: nothing guards the AboutDialogOpened and ShareDialogOpened logs
R10 keeps both logs, and the last step rewrites both open handlers, but no test anywhere asserts either event. With the step applied and both `log(...)` lines deleted, the top-bar, `log-events` and `interactive-state` suites still pass 60/60. Suggested: add an `it.each(["Share", "About"])` to `log-events.test.tsx` (which already mocks `log` and renders `TopBar`) that clicks the button and expects `${name}DialogOpened`; as throwaway code it passes, and fails 2/2 with the lines deleted. Applied: the last step adds that test, and Verification's counts are re-measured with it (80/80, 1241 tests).

#### RESOLVED: Senior engineer: the focus outline's width is written in two files
The Close button's outline is meant to match the top-bar buttons' (requirements.md, the Close-button judgment call), but `dialog.scss` writes `2px solid $controlLabel` while `top-bar.scss` declares its own `$focusOutlineWidth: 2px`. Suggested: declare `$focusOutlineWidth` once in `common.scss` (in the dialog step, since both files import it) and use it in both rules, keeping the offsets local because they differ on purpose. Compiled with sass as throwaway code, both rules come out unchanged. Applied in the dialog step, and the build re-run.

### Self-review round 2

Roles: comment auditor (Doug's CLAUDE.md comment rules), QA engineer, senior engineer, WCAG accessibility expert, Kiley as acceptance reviewer. Checked against master and against the plan applied as throwaway code, in Chromium on the dev server; only the issue below survived. FM-5's focus-on-open question (MUI focuses its `role="presentation"` container, outside the named dialog) applies here too; Doug decided Close takes focus on open, which the dialog step now does (R11).

#### RESOLVED: Comment auditor: the top-bar line-height comment says "clipped", but nothing clips the ring
The planned `top-bar.scss` comment says the line-height keeps the focus outline inside the bar "instead of being clipped by it". The top bar is `overflow: visible` and unpositioned, so it clips nothing: with a 16px line-height and a red outline, Chromium paints the ring's bottom row at y = 22, over the simulation canvas below the bar; at the planned 15px the ring spans rows 1 to 21, inside it. Applied: the comment's first sentence now says "Sized so the whole focus outline stays inside the top bar instead of spilling onto the canvas below it."; the second is unchanged.
