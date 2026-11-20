# Terms of Use Link and Licensing Copy for Wildfire Explorer

**Jira**: https://concord-consortium.atlassian.net/browse/WM-67

**Status**: **Closed**

## Overview

Wildfire Explorer's About and Share dialogs get the license and Terms of Use copy approved for CODAP's About dialog, replacing the old CC BY-NC copyright block, so that every Geo app says the same thing: the source is MIT, and use of the hosted site is governed by Concord's Terms of Use. The top bar's Reload, Share and About controls become keyboard-reachable buttons, reached by Tab in their on-screen order, and both dialogs get a name, a real Close button and focus return.

WM-67 is one of five matching Geo stories (HURR-70, SE-4, TE-10, WM-67, FM-5). Their shared decisions are in the global oob doc `streams/terms-of-use/geo-common.md` (decisions 1 to 12); the decision numbers below refer to it. Kiley Brown reviewed the Geo branch builds on 2026-11-19 and asked for three changes in every app so they match: Reload as a keyboard-reachable button, the copyright line at exactly 12px, and Tab following the top bar's on-screen order. The same review kept "Inc.", the current-year-only copyright line, and embed coverage through the About dialog plus the Activity Player footer.

## Requirements

### License copy

- **R1. One license-copy component** renders the copy below and is the last block of both the About and the Share dialog content, replacing `<Copyright />` in each. `src/components/top-bar/copyright.tsx` is deleted (decision 5). Share's "Suggested citation" paragraph stays, before the copy (decision 11).
- **R2. Copy, word for word** (CODAP `V3.AboutDialog.*` with the product and host swapped), in this order:
  - Paragraph 1: **Wildfire Explorer is free, open-source software.** The Wildfire Explorer source code is released under the [MIT License], so you’re welcome to use, modify, and build on it.
  - Paragraph 2: **Your use of Wildfire Explorer at wildfire.concord.org** is governed by our [Terms of Use]. The hosted version is free for non-commercial use; commercial use requires a separate written agreement. For more information, visit [concord.org/licensing] or contact [licensing@concord.org].
  - Copyright line: `© {current year} The Concord Consortium, Inc.` (Kiley confirmed "Inc." and the current year alone on 2026-11-19.)
  - The leading phrase of each paragraph is bold. "you’re" uses the curly apostrophe U+2019 (decision 1).
- **R3. Text size**: the two paragraphs use the dialogs' existing paragraph style (16px); the copyright line is exactly 12px (decision 12), in place of the old block's 0.8em (12.8px).
- **R4. Year** is `new Date().getFullYear()` at render time. No range and no build-time constant (decision 1).
- **R5. The old text is gone** from both dialogs: no "Creative Commons", "CC BY" or "All rights reserved" (decision 5).

### Links

- **R6. Link targets**, kept in one constants module rather than inline in JSX:
  - MIT License: `https://github.com/concord-consortium/wildfire-model/blob/master/LICENSE`
  - Terms of Use: `https://concord.org/terms-of-use/`
  - concord.org/licensing: `https://concord.org/licensing`
  - licensing@concord.org: `mailto:licensing@concord.org`
- **R7. Web links open in a new tab**: the three web links have `target="_blank"` and `rel="noopener noreferrer"` (decision 2), and append visually hidden text " (opens in a new tab)". The mailto link is a plain same-tab `<a>` with no hint.
- **R8. Links in the copy are underlined.**

### Reachability

- **R9. No other new surface**: no top-bar Terms of Use item, no heading over the copy, no CODAP-style links row (decision 6). The top bar shows in every mode, standalone, in read-only report mode and embedded, so the copy is reachable wherever the app runs. Embedded use (the story's requirement 4, decision 3): the About dialog covers embeds that show the top bar, the Activity Player's footer (AP-146) covers Activity Player embeds that hide it, and no corner link is added.
- **R10. Top-bar buttons**:
  - **About and Share are each a `<button type="button">`** (decision 4), looking as before: same font, color, hover color and text position, with no button border or background. They keep `data-testid="about"` and `data-testid="share"` and the `AboutDialogOpened` and `ShareDialogOpened` logs.
  - **Reload is a `<button type="button">`** named "Reload" by `aria-label`, with a matching `title` tooltip, as in HURR-70 (decision 4). Its icon stays where it was, with the same color and hover color; it keeps `data-testid="reload"`, its `TopBarReloadButtonClicked` log and its absence in read-only report mode.
  - Each of the three shows a visible focus indicator on keyboard focus, all four sides of which fall inside the 22px top bar.
  - **Tab visits them in their on-screen order**, left to right: Reload, Share, About. In read-only report mode Share is the first stop.

### Dialog behavior

- **R11. Both dialogs** (decision 7):
  - keep MUI's `role="dialog"`, focus trap, Esc close and backdrop-click close, and set `aria-modal="true"` on the dialog, which MUI 5.13 does not;
  - are named by their visible title ("About: Wildfire Explorer", "Share: Wildfire Explorer"), which is a level-2 heading;
  - have a real `<button type="button" aria-label="Close">` in place of the bare icon, with a visible focus indicator;
  - put focus on that Close button every time they open, including a reopen during the close animation;
  - return focus to the About or Share button that opened them, after Esc, Close or a backdrop click, including when the click that opened them did not focus the button (macOS Safari and Firefox do not focus a button on click).
- **R12. The dialogs look as before** apart from the copy: the same title style and close icon, with the title and Close button keeping their size and place inside the dialog. Both dialogs draw above the Hazbot coach mark, so it never covers them or the copy.

### Unchanged

- **R13.** The About dialog's descriptive paragraphs and its creator and NSF credit line are unchanged; their links keep their current attributes. The Share dialog's link and embed textareas and its "Suggested citation" line are unchanged.

### Tests

- **R14.** Unit tests render the real About and Share content and cover, for each: the four hrefs as literal URLs; `target` and `rel` on the three web links and their absence on the mailto link; each link's accessible name; the R2 copy word for word and in order, including the curly apostrophe and the bold lead-ins; that the copy is the last block; the copyright year under two pinned clocks; and that the R5 text is absent.
- **R15.** Dialog tests cover the name from the heading, `aria-modal`, focus on Close when it opens, closing from Close, and closing on Esc. Top-bar tests cover, for About and Share: Tab and Enter, focus return by Esc, focus return after a click that did not focus the button (by Esc and by Close), a reopen during the close animation, the dialog's z-index derived from the coach mark's, and the dialog-opened logs. For Reload: the first Tab stop, named Reload, with an `aria-label` and a `title` of Reload, reloading on Enter, with Share and About the second and third stops. A Cypress spec checks that the three buttons' left edges increase in DOM (Tab) order and that the copyright line is 12px in both dialogs. Each test fails under a mutation of the code it guards.

### Review

- **R16.** Kiley reviews the result on the branch deploy before merge (story acceptance criterion), at `https://models-resources.concord.org/wildfire-model/branch/add-terms-of-use-link/index.html` (`s3-deploy-action` strips the leading Jira key from the branch name). For the embedded case, Doug sends her a page that loads the branch URL in the Share dialog's 1000 × 800 embed snippet.

## Technical Notes

- **Where the code lives**: the copy, `ExternalLink` and the link constants are in `src/components/license/`, as in HURR-70; the buttons in `src/components/top-bar/top-bar.tsx`; the dialog in `src/components/top-bar/dialog.tsx`; and the layout checks jsdom cannot make in `cypress/e2e/top-bar-visuals.cy.ts`. The Geo apps share no component library, so each implements the copy locally; sameness comes from geo-common.md and an identical constants module that differs only in the MIT URL.
- **Focus on open**: the Fade transition's `onEnter` focuses Close. `autoFocus` misses a reopen during MUI's 225ms exit fade, since the dialog stays mounted; a `useEffect` on `open` misses the first open, since MUI's `Portal` mounts the children after the effect runs. MUI still returns focus to the opener on close, recording it from the focus event's `relatedTarget`. The About and Share click handlers call `event.currentTarget.focus()` so a mouse open in Safari or Firefox still has an opener to return to.
- **Dialog name**: `aria-labelledby` passed straight to `MuiDialog` names the paper; MUI 5.13 only generates its own id when the prop is undefined, which the required `title` rules out. On master that generated id pointed at no element, so the dialog had no name.
- **Hazbot coach mark**: its `--coachmarks-z-index` (10001) is above MUI's modal layer (1300), so it drew over the dialog. The dialog's z-index is `calc(var(--coachmarks-z-index) + 1)`, derived rather than copied; the library defines the variable on `:root` at load, so it resolves with Hazbot off too. Esc closes the top-bar dialog first, since MUI stops the event before the coach mark's document listener.
- **Focus ring in the 22px bar**: `$buttonHeight` (15px, from the bar height and the 2px outline 1px out, less 1px for the text buttons' half-pixel baseline offset) puts every ring at 0.5 to 21.5px in Chromium and Firefox, with Share and About's text and Reload's 24px icon exactly where master drew them. Reload is flex-centered and its icon centered on the 15px box by a negative margin; the icon overflows the button only by the blank space around its glyph.
- **Tab order**: the bar is a flex row with no `float` or `order`, so DOM order is screen order. Seismic's reversed order (from `float: right`) did not arise here; Jest's Tab counts pin the DOM order and the Cypress check pins the screen to it.
- **Dialog size**: the About content grows from 299 to 372px with the copy. In a 1000 × 500 iframe MUI's paper caps the dialog and scrolls, with the title and Close at the top, and the keyboard scrolls it from Close; no height cap is needed.
- **Logging**: no new log events; `AboutDialogOpened` and `ShareDialogOpened` keep firing and are now tested.
- **Generated ids**: the dialog's `useId` shifts React's other `:rN:` ids, which broke FM-5's Cypress selectors; nothing in Wildfire selects a generated id.
- **CI**: already on `cypress-io/github-action@v7` from WM-68, so no CI change.
- **Boreal Forest Fire Explorer** is `concord-consortium/forestfire`, not built from this repository (decision 8). The repository's LICENSE is MIT, so the story's "flag to Kiley" condition did not trigger.

## Out of Scope

- From the story: a third-party library acknowledgements list, usage tracking, changing the software license, localizing the legal copy, and a cookie banner.
- A Terms of Use link for third-party embeds that hide the top bar (story, and Kiley on 2026-11-19); Wildfire has no way to hide it.
- Existing credit links in the About dialog, including their `rel="noreferrer"` without `noopener`.
- The README's "License" section, which describes the code's MIT license and stays true.
- The other four Geo apps and Boreal Forest Fire Explorer.
- Focus when the coach mark opens over an already-open About or Share: it takes focus, and MUI's trap returns it to MUI's container rather than Close. Fixing that means changing the coachmarks library or Hazbot's timing; the window is the 250ms after a Hazbot click.

## Decisions

### What size is the new copy?
**Context**: The old `Copyright` block was one 0.8em paragraph.

**Options considered**:
- A) Paragraphs in the dialogs' paragraph style, copyright line small.
- B) The whole copy small, as the old block was.

**Decision**: A, matching HURR-70 and geo-common. The copy is the statement the story asks to be visible, not fine print. The copyright line is Kiley's 12px, the same in every Geo app.

---

### Does the dialog keep closing on a backdrop click?
**Context**: Hurricane's dialog closes only on Esc; Wildfire's also closes on a click outside it.

**Options considered**:
- A) Keep Wildfire's backdrop-click close.
- B) Adopt Hurricane's Esc-only policy.

**Decision**: A. Nothing asks to change how the dialogs close, and MUI returns focus to the opener on every close path.

---

### Does the Close button get its own focus indicator?
**Context**: Close becomes a real button that takes focus every time the dialog opens.

**Options considered**:
- A) A 2px outline in `$controlLabel` on `:focus-visible`.
- B) The browser's default ring.

**Decision**: A, the same outline the top-bar buttons get.

---

### How does Kiley check the embedded case?
**Context**: Pasting the Share snippet "into any page" needs somewhere to host HTML, and the Activity Player needs an authored activity.

**Options considered**:
- A) Kiley hosts a page herself.
- B) Doug sends her a page that loads the branch build in the snippet's 1000 × 800 iframe.

**Decision**: B, the frame the dialog measurements were taken in.

---

### How are the commits split?
**Context**: HURR-70 shipped the copy and the buttons in separate commits; Wildfire also needed the dialog's heading and Close button, and later Kiley's Reload change.

**Options considered**:
- A) Four commits: copy; dialog heading and Close; About and Share buttons; Reload with the Tab-order check.
- B) Fewer commits, folding the dialog or Reload into the button commit.

**Decision**: A. Each commit has one reason (decisions 7 and 4, then Kiley's review), and the button tests can name the dialog because the heading lands first. The About and Share commit introduces `$buttonHeight`, which Reload reuses.

---

### Where does the focus-outline style live?
**Context**: HURR-70 used a shared `focusOutline` mixin; Wildfire's `common.scss` had no focus style.

**Options considered**:
- A) A rule in each of `top-bar.scss` and `dialog.scss`, sharing only `$focusOutlineWidth` from `common.scss`.
- B) A new shared mixin.

**Decision**: A. Two rules in one folder do not justify new infrastructure. The width is declared once so the two outlines cannot drift; the offsets differ on purpose (1px in the bar, 2px around Close).

---

### How does the copy test stay inside the repo's lint rules?
**Context**: HURR-70's test uses `querySelectorAll` and `nextElementSibling`, which the testing-library lint rules here reject, and spreads a `NodeList`, which the ES5 target rejects.

**Options considered**:
- A) Assert through Testing Library queries and text content only.
- B) Keep HURR-70's assertions with `eslint-disable` comments.

**Decision**: A. The copy is asserted as one string (which fixes paragraph order), the bold lead-ins by `getByText` plus `tagName`, and "last block" as the content's text ending with the copyright line.

---

### Does Reload keep both `aria-label` and `title`?
**Context**: Either attribute alone names the button "Reload", so a test of the name alone cannot see `aria-label` go.

**Options considered**:
- A) Both, as HURR-70 has them.
- B) `title` alone.
- C) `aria-label` alone, with no tooltip.

**Decision**: A, so the Geo apps match and the name does not depend on the tooltip. The test asserts the name and both attributes, as FM-5's does, so dropping either fails it.

---

### Are the dialog-opened logs tested?
**Context**: The About and Share open handlers were rewritten, but no test asserted `AboutDialogOpened` or `ShareDialogOpened`; deleting both `log` calls left every suite green.

**Decision**: `log-events.test.tsx` gains a test per button that clicks it and expects its event.
