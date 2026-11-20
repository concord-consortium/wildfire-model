# Terms of Use Link and Licensing Copy for Wildfire Explorer

**Jira**: https://concord-consortium.atlassian.net/browse/WM-67
**Repo**: https://github.com/concord-consortium/wildfire-model
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

Wildfire Explorer's About and Share dialogs get the license and Terms of Use copy approved for CODAP's About dialog, replacing the old CC BY-NC copyright block, so that every Geo app says the same thing: the source is MIT, and use of the hosted site is governed by Concord's Terms of Use. The top bar's Reload, Share and About controls become keyboard-reachable buttons, reached by Tab in their on-screen order, and both dialogs get a name, a real Close button and focus return.

## Project Owner Overview

Concord published non-commercial Terms of Use for everything served from its servers, and the Geo simulations are widely embedded in commercial curricula. Each Geo app needs the same visible statement that use of the hosted site is governed by those terms and that commercial use needs a separate written agreement. Today Wildfire Explorer's About and Share dialogs end with a CC BY-NC 4.0 notice and say nothing about the Terms of Use.

After this change both dialogs end with the CODAP wording, with working links to the MIT License, the Terms of Use, concord.org/licensing and licensing@concord.org. The dialogs look the same as before apart from that copy. Keyboard and screen-reader users can now reach Reload, Share and About, are told they are in a dialog named "About: Wildfire Explorer" or "Share: Wildfire Explorer", can close it with a real Close button, and return to the button that opened it. Kiley reviews the result on the branch deploy before merge.

## Background

WM-67 is the Wildfire Explorer story in a set of five matching Geo stories (HURR-70, SE-4, TE-10, WM-67, FM-5). The decisions shared by all five are in the global oob doc `streams/terms-of-use/geo-common.md` (decisions 1 to 12); Kiley Brown decided 3, 5, 6 and 9 on 2026-11-17, and Doug decided 4 (About and Share both become buttons) on 2026-11-18 after Teale Fristoe's review of HURR-70. This spec applies them to Wildfire Explorer rather than re-deciding them. After reviewing the Geo branch builds on 2026-11-19, Kiley signed off and asked for three changes in every Geo app so they match: Reload as a keyboard-reachable button, the copyright line at exactly 12px, and Tab following the top bar's on-screen order (R3, R10). The same review settled, with no code change, that embeds are covered by the About dialog plus the Activity Player footer (R9) and that "Inc." and the current-year-only copyright line stay (R2, R4). HURR-70 (hurricane-model, PR #163) is the worked example for the copy component, the new-tab link, the constants module, the dialog's label and Close button, the top-bar buttons including Reload, and the tests; SE-4 and TE-10 add lessons about measuring the dialog in an embed, focus rings inside a narrow bar and checking planned tests against the repo's lint rules.

What the code has today (checked on master):

- `src/components/app.tsx` always renders `TopBar` (`src/components/top-bar/top-bar.tsx`) with `projectName="Wildfire Explorer"`. Nothing hides the top bar: no config or URL parameter removes it, and read-only report mode (WM-64) hides only Reload, leaving Share and About.
- The 22px top bar (`$topBarHeight` in `src/components/common.scss`) has a Reload `<span onClick>` holding MUI's 24px refresh icon on the left and `Share` and `About` `<span onClick>`s on the right, none of them focusable. It is a flex row with no `float` or `order`, so its DOM order (Reload, Share, About) is its left-to-right order on screen: measured in Chromium and Firefox at 1280 × 800, Reload at x 11, Share at 1159 and About at 1218. Seismic's reversed Tab order (About before Share, from `float: right`) does not arise here.
- Both open the same `Dialog` (`src/components/top-bar/dialog.tsx`), a MUI 5 `Dialog` that already gives `role="dialog"`, `aria-modal`, a focus trap, Esc and backdrop-click closing, and focus return to the element focused when it opened. Its title is a plain `<div>`, and its close control is a bare `<CloseIcon onClick>`. MUI fills `aria-labelledby` with a generated id that no element carries, so the dialog has no accessible name; a throwaway Jest test on master found the id dangling, no button and no heading in the dialog.
- `about-dialog-content.tsx` and `share-dialog-content.tsx` both end in `<Copyright />` (`top-bar/copyright.tsx`): "Copyright © {year} The Concord Consortium. All rights reserved. This resource is licensed under a Creative Commons Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0)…", at 0.8em. Share has a "Suggested citation" paragraph before it.
- The repository's LICENSE is MIT and its default branch is `master`, so the story's "flag to Kiley if not MIT" condition does not trigger.
- Boreal Forest Fire Explorer is not built from this repository: it is `concord-consortium/forestfire` (geo-common decision 8), so the story's "also check" item is answered there and needs no change here.

## Requirements

### License copy

- **R1. One license-copy component** renders the copy below and is the last block of both the About and the Share dialog content, replacing `<Copyright />` in each. `src/components/top-bar/copyright.tsx` is deleted (decision 5). Share's "Suggested citation" paragraph stays, before the copy (decision 11).
- **R2. Copy, word for word** (geo-common "Copy"; CODAP `V3.AboutDialog.*` with the product and host swapped), in this order:
  - Paragraph 1: **Wildfire Explorer is free, open-source software.** The Wildfire Explorer source code is released under the [MIT License], so you’re welcome to use, modify, and build on it.
  - Paragraph 2: **Your use of Wildfire Explorer at wildfire.concord.org** is governed by our [Terms of Use]. The hosted version is free for non-commercial use; commercial use requires a separate written agreement. For more information, visit [concord.org/licensing] or contact [licensing@concord.org].
  - Copyright line: `© {current year} The Concord Consortium, Inc.` Kiley confirmed "Inc." and the current year alone in her 2026-11-19 review.
  - The leading phrase of each paragraph is bold. "you’re" uses the curly apostrophe U+2019 (decision 1).
- **R3. Text size**: the two paragraphs use the dialogs' existing paragraph style (16px); the copyright line is exactly 12px, the size Kiley set for every Geo app on 2026-11-19 (decision 12), in place of the old block's 0.8em (12.8px here).
- **R4. Year** is `new Date().getFullYear()` at render time. No range and no build-time constant (decision 1, kept by Kiley on 2026-11-19).
- **R5. The old text is gone** from both dialogs: no "Creative Commons", "CC BY" or "All rights reserved" (decision 5).

### Links

- **R6. Link targets**, kept in one constants module rather than inline in JSX:
  - MIT License: `https://github.com/concord-consortium/wildfire-model/blob/master/LICENSE`
  - Terms of Use: `https://concord.org/terms-of-use/`
  - concord.org/licensing: `https://concord.org/licensing`
  - licensing@concord.org: `mailto:licensing@concord.org`
- **R7. Web links open in a new tab**: the three web links have `target="_blank"` and `rel="noopener noreferrer"` (decision 2), and append visually hidden text " (opens in a new tab)", so their accessible name is the visible text plus the hint. The mailto link is a plain same-tab `<a>` with no hint.
- **R8. Links in the copy are underlined.**

### Reachability

- **R9. No other new surface**: no top-bar Terms of Use item, no heading over the copy, no CODAP-style links row (decision 6). The top bar shows in every mode, standalone, in read-only report mode and embedded, so the copy is reachable wherever the app runs; decision 3 (hidden top bars) does not arise for Wildfire. Kiley settled embedded use on 2026-11-19 (the story's requirement 4, decision 3): the About dialog covers embeds that show the top bar, the Activity Player's footer (AP-146) covers Activity Player embeds that hide it, no corner link is added, and third-party embeds that hide the top bar are out of scope.
- **R10. Top-bar buttons**:
  - **About and Share are each a `<button type="button">`** (decision 4: **[applies story]** for About, **[beyond story]** for Share), looking as they do today: same font, color, hover color and text position, with no button border or background. They keep `data-testid="about"` and `data-testid="share"` and the `AboutDialogOpened` and `ShareDialogOpened` logs.
  - **Reload is a `<button type="button">`** named "Reload" by `aria-label`, with a matching `title` tooltip, as in HURR-70 (decision 4, Kiley, 2026-11-19). Its icon stays where it is today, with the same color and hover color; it keeps `data-testid="reload"`, its `TopBarReloadButtonClicked` log and its absence in read-only report mode.
  - Each of the three shows a visible focus indicator on keyboard focus, all four sides of which fall inside the 22px top bar.
  - **Tab visits them in their on-screen order**, left to right: Reload, Share, About (decision 4, from Teale Fristoe's SE-4 review; Kiley, 2026-11-19). The order already holds on master and must stay; in read-only report mode Share is the first stop.

### Dialog behavior

- **R11. Both dialogs** (decision 7):
  - keep MUI's `role="dialog"`, `aria-modal`, focus trap, Esc close and backdrop-click close;
  - are named by their visible title ("About: Wildfire Explorer", "Share: Wildfire Explorer"), which is a level-2 heading;
  - have a real `<button type="button" aria-label="Close">` in place of the bare icon, with a visible focus indicator;
  - put focus on that Close button every time they open, including a reopen during the close animation (MUI keeps the dialog mounted through its fade), so focus starts inside the named dialog and a screen reader announces its name (geo-common decision 7: Doug, 2026-11-18, after FM-5's review found MUI focusing its container outside the dialog; the reopen case added 2026-11-19 after TE-10's final review);
  - return focus to the About or Share button that opened them, after Esc, Close or a backdrop click, including when the click that opened them did not focus the button (macOS Safari and Firefox do not focus a button on click).
- **R12. The dialogs look as they do today** apart from the copy: the same title style and close icon, with the title and Close button keeping their size and their place inside the dialog. The new copy changes the dialogs' height, and MUI keeps them centered, so their place on the page moves (see Technical Notes). Both dialogs draw above the Hazbot coach mark, so it never covers them or the copy.

### Unchanged

- **R13.** The About dialog's descriptive paragraphs and its creator and NSF credit line are unchanged; their links keep their current attributes. The Share dialog's link and embed textareas and its "Suggested citation" line are unchanged.

### Tests

- **R14.** Unit tests render the real About and Share content (not the copy component alone) and cover, for each: the four hrefs, asserted as literal URLs rather than the constants module's values; `target` and `rel` on the three web links and their absence on the mailto link; each web link's accessible name including the " (opens in a new tab)" hint, and the mailto link's name as its text alone; the R2 copy word for word and in order, including the curly apostrophe and the two bold lead-in phrases; that the copy is the content's last block (R1); the copyright line, with the clock pinned to a fixed date and the year asserted as a literal, under two different pinned years, so neither a year computed as the code computes it nor a hardcoded year passes; and that the R5 text is absent.
- **R15.** Dialog tests cover the dialog's name from its heading, focus on Close when it opens, closing from the Close button, and closing on Esc. Top-bar tests cover, for About and for Share: that it is a button reached by Tab that opens its dialog with Enter, the dialog named for it and Close focused; that Esc returns focus to it; that focus returns to it after a click that did not focus it, with focus starting on the page body, by Esc and by Close; that reopening it during the close animation leaves Close focused; that its dialog's z-index is derived from the coach mark's and above it; and that opening it still fires its `AboutDialogOpened` or `ShareDialogOpened` log. Top-bar tests also cover Reload: the first Tab stop, named Reload, with an `aria-label` and a `title` of Reload, reloading on Enter; Share and About are then the second and third Tab stops. A Cypress spec, since jsdom applies no stylesheet, checks that the three buttons' left edges increase in DOM (Tab) order and that the copyright line is 12px in both dialogs. Each test fails under a mutation of the code it guards.

### Review

- **R16.** Kiley reviews the result on the branch deploy before merge (story acceptance criterion). CI's S3 deploy publishes each branch at `https://models-resources.concord.org/wildfire-model/branch/<name>/index.html` (`deployRunUrl` in `.github/workflows/ci.yml`), where `s3-deploy-action` strips the leading Jira key from the branch name, so this story's branch is at `https://models-resources.concord.org/wildfire-model/branch/add-terms-of-use-link/index.html`. Steps for Kiley, one per acceptance criterion:
  - **Link visible standalone and embedded**: open the branch URL, click About, and find the Terms of Use link in the last block. For the embedded case, Doug sends Kiley a page that loads the branch URL in the iframe from the Share dialog's "Paste HTML to embed" snippet (1000 × 800), where she repeats the check; the app shows its top bar inside the iframe.
  - **Copy with working links**: in both About and Share, the copy is the last block, with the copyright line in smaller type; MIT License, Terms of Use and concord.org/licensing each open in a new tab, and licensing@concord.org opens a mail message.
  - **Wording matches CODAP**: compare the copy with CODAP's About dialog (codap#2758); only "Wildfire Explorer" and "wildfire.concord.org" differ.

## Technical Notes

- **Where the code lives**: the copy, the `ExternalLink` component and the link constants go in a new `src/components/license/` folder, as in HURR-70. The buttons are in `src/components/top-bar/top-bar.tsx`, the dialog in `src/components/top-bar/dialog.tsx`, and the layout checks jsdom cannot make in a new `cypress/e2e/top-bar-visuals.cy.ts`.
- **Reference implementation**: CODAP's About dialog (CODAP-1595 / codap#2758): strings `V3.AboutDialog.*`, links in `about-dialog-constants.ts`, new-tab links in `components/common/external-link.tsx`. HURR-70's `src/components/license/` is the Geo version of the same; this story's constants module differs from it only in the MIT URL.
- **No shared package**: the Geo apps share no component library, so Wildfire implements the copy locally; sameness comes from geo-common.md and an identical constants module.
- **Dialog**: Hurricane's `src/components/dialog.tsx` is the model for the heading and the Close button. Hurricane's dialog closes only on Esc, which is Hurricane's own policy; Wildfire keeps closing on a backdrop click, as today.
- **Focus ring in the 22px bar**: the buttons sit half a pixel below the bar's center on the wrapper span's text baseline. Measured in Chromium at 1280 × 800 with a 2px outline 1px outside the button: a 16px line-height puts the ring at 0.5 to 22.5px, overhanging the bar by half a pixel onto the simulation canvas; a 15px line-height puts it at 0.5 to 21.5px with the text exactly where master draws it (same x and y for both words). Firefox gives the same 0.5 to 21.5px. In both browsers the hover color still applies to the buttons; opening a dialog puts focus on Close, with a focus ring when opened by keyboard and none when opened by a mouse click; and Esc, Close and a backdrop click all end with focus back on the opening button. Opened by a script `click()` with focus on the body (a click that does not focus the button), Esc and Close still return focus to it, and reopening about 60ms after Esc, while MUI still has the dialog mounted mid-fade, focuses Close. Reload as a button, 15px tall and flex-centered in the bar, keeps its icon at exactly master's place (x 11, y -1, 24 × 24) with its ring at 0.5 to 21.5px, the same as Share's and About's; the icon overflows the button only by the blank space around its glyph. Safari's WebKit could not launch on this machine, so the click-without-focus case it motivates is covered by the Jest test (R15) rather than a browser run.
- **Hazbot coach mark**: the Hazbot intro popover (`@concord-consortium/coachmarks`) can be open when About or Share opens, or open over it, since it appears 250 to 400ms after a Hazbot click. Its `--coachmarks-z-index` (10001) is above MUI's default modal layer (1300), so in Chromium and Firefox it drew over the dialog and covered part of the license copy. The library defines the variable on `:root` when it loads, which `hazbot-button.tsx` makes unconditional, so it resolves with Hazbot off too. Esc already closes only the top-bar dialog first (MUI stops the event before the coach mark's document listener).
- **Dialog size**: measured in Chromium at 1280 × 900, the About dialog's content grows from 299 to 372px tall with the copy; its title and Close button keep their offsets inside the dialog (16px and 8px from the top). In the Share dialog's own embed snippet (a 1000 × 800 iframe), About spans 131 to 669px and Share 201.5 to 598.5px, both whole. In a 1000 × 500 iframe MUI's paper caps the About dialog at 436px and scrolls (`overflow-y: auto`), with the title and Close at the top; with focus on Close, the arrow keys, PageDown, End and Home scroll it to the copy and back in Chromium and Firefox. No height cap is needed, unlike SE-4's react-modal dialog.
- **Embeds**: the app loads in a plain iframe with no Activity Player (checked with the Share snippet), unlike Hurricane, so About and the copy are reachable in Activity Player, portal launches and third-party iframes. This matches the story's revised requirement 4 and Kiley's 2026-11-19 review (R9).
- **Logging**: no new log events. `LOGGED-EVENTS.md` already lists `AboutDialogOpened` and `ShareDialogOpened`, which keep firing.
- **CLUE-750 differences**: CLUE keeps a heading and a links row because its story and mockup require them; the Geo apps do not (decision 6).
- **Cypress**: no existing spec opens About or Share or names the top-bar controls, so none changes. The new `top-bar-visuals.cy.ts` follows the repo's `*-visuals.cy.ts` pattern for geometry jsdom cannot see.
- **Generated ids**: the dialog's `useId` label shifts React's other generated `:rN:` ids, which broke FM-5's Cypress tab selectors; Wildfire is unaffected, since no Cypress test or source file selects a generated id, it has no react-tabs, and nothing else in `src/` calls `useId`.
- **CI needs no change**: `.github/workflows/ci.yml` is already on `cypress-io/github-action@v7`, which WM-68 moved it to from the v6 that fails on GitHub's Node.js 24.21 runners, so this story has no CI upgrade step (Doug, 2026-11-18).

## Out of Scope

- From the story: a third-party library acknowledgements list, usage tracking, changing the software license, localizing the legal copy, and a cookie banner.
- A Terms of Use link for third-party embeds that hide the top bar (story, and Kiley on 2026-11-19); Wildfire has no way to hide it.
- Existing credit links in the About dialog, including their `rel="noreferrer"` without `noopener` (geo-common "How links open").
- The README's "License" section, which describes the code's MIT license and stays true.
- The other four Geo apps and Boreal Forest Fire Explorer (decision 8).
- Focus when the coach mark opens over an already-open About or Share: it takes focus, and MUI's trap returns it to MUI's container rather than Close. Fixing that means changing the coachmarks library or Hazbot's timing, and the window is the 250ms after a Hazbot click.

## Open Questions

<!-- Requirements-focused questions only (scope, acceptance criteria, business rules).
     Implementation questions go in implementation.md. -->

### RESOLVED: Judgment call: what size is the new copy?
**Context**: The old `Copyright` block was one 0.8em paragraph. HURR-70 put its two paragraphs at body size and only the copyright line in the small style.

**Options considered**:
- A) Paragraphs in the dialogs' paragraph style, copyright line small.
- B) The whole copy small, as the old block was.

**Decision**: A, matching HURR-70 and geo-common's small copyright line (R3). The copy is now the statement the story asks to be visible, not fine print. The copyright line's size is Kiley's 12px (2026-11-19), the same in every Geo app.

### RESOLVED: Judgment call: does the dialog keep closing on a backdrop click?
**Context**: Hurricane's model dialog closes only on Esc. Wildfire's closes on Esc and on a click outside it.

**Options considered**:
- A) Keep Wildfire's backdrop-click close.
- B) Adopt Hurricane's Esc-only policy.

**Decision**: A. Nothing in the story or geo-common asks to change how the dialogs close, and MUI returns focus to the opening button on every close path (R11).

### RESOLVED: Judgment call: does the Close button get its own focus indicator?
**Context**: The close control becomes a real button, which can now take keyboard focus. It takes focus every time the dialog opens (R11).

**Options considered**:
- A) A 2px outline in `$controlLabel` (the icon's hover color) on `:focus-visible`.
- B) The browser's default ring.

**Decision**: A, the same outline the top-bar buttons get, so the two controls show focus the same way.

## Self-Review

Roles: QA engineer, Kiley as acceptance reviewer, senior engineer porting HURR-70. Checked with the planned code applied as throwaway code: focus also returns to About and Share after a backdrop-click close (MUI's own focus restore, so R15 leaves it untested), and the buttons' hover color still wins over the button reset by selector specificity.

### Kiley as acceptance reviewer

#### RESOLVED: R16's embedded check asked Kiley to host a page
The step said to paste the Share snippet "into any page", which needs somewhere to host HTML, and the Activity Player needs an authored activity. R16 now says Doug sends her a page that loads the branch build in the snippet's 1000 × 800 iframe, the frame the Technical Notes measured.
