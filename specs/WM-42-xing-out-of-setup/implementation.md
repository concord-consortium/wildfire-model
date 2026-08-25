# Implementation Plan: Setup wizard: replace the X with a Cancel button

**Jira**: https://concord-consortium.atlassian.net/browse/WM-42
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Verification status

Every code block below was built on this branch as a throwaway spike, run, mutation-tested, and then reverted. The measurements quoted are from that spike, not from reading the source. What the spike established:

- Full Jest suite green on the spike at **895 passed / 895** across 76 suites, with round 1 at 891 and the pre-review plan at 889. **Those totals were measured on the pre-WM-46 base, whose baseline was 879 across 76 suites, and the branch has since been rebased onto master `0183fa2`.** The baseline on the current head is **948 passed / 948 across 78 suites**, re-measured rather than quoted. The plan's net addition is unaffected by the rebase, because WM-46 touched exactly one file this plan touches, so the post-plan total is **964**, derived from the measured baseline rather than measured itself. Per file, against the current counts: `terrain-panel.test.tsx` 16 -> **25**, `bottom-bar.test.tsx` 35 -> **41**, `log-events.test.tsx` 23 -> **24**. The `bottom-bar.test.tsx` target is 41 rather than the 40 the spike measured because WM-46 added one case to that file; hitting 40 would mean landing five of this plan's six bottom-bar cases and calling it done.
- Full Cypress suite green, headless Chrome, at **29 passed / 29** across all 6 specs (baseline is 27; the plan adds state 8 and the Setup-highlight case, and folds the Cancel-fill assertion into an existing case). Re-measured after the round-1 self-review; the pre-review plan measured 28.
- `npm run lint` reports **zero findings** on all five touched source and test files.
- `npx tsc --noEmit` adds no errors (the two `line-chart.tsx` errors are pre-existing on master).
- Every new test was mutation-tested, Cypress included. The mutation each one catches is named in its step.
- The rendered result was measured in Chrome against the artboard numbers.

## Implementation Plan

### Fix the literal `undefined` class on the panel container

**Summary**: The rider fix from the requirements, taken first so it lands as its own commit and the Cancel diff stays about Cancel. `panelClasses` is `[css.panel0, css.panel1, css.panel2]` but the SCSS defines only `.panel0` and `.panel2`, so the conditions panel renders `class="background zone1 undefined"`. Independent of WM-42.

**Files affected**:
- `src/components/terrain-panel.tsx`: build the class list by filtering instead of interpolating

**Estimated diff size**: ~3 lines

Before (`terrain-panel.tsx:240`):

```tsx
        <div
          className={`${css.background} ${cssClasses[selectedZone]} ${panelClasses[currentPanel]}`}
          data-testid="terrain-panel-container"
        >
```

After:

```tsx
        <div
          className={[css.background, cssClasses[selectedZone], panelClasses[currentPanel]]
            .filter(Boolean).join(" ")}
          data-testid="terrain-panel-container"
        >
```

**No unit test guards this**, and the spec should not gain one. Jest maps SCSS through `identity-obj-proxy` (`package.json:30`), so `css.panel1` resolves to the string `"panel1"` and the bug cannot occur in jsdom. An assertion on the class list passes with the fix reverted, which makes it decoration.

**Browser verification** (run on the spike, master model, `http://localhost:8080/`): on the conditions panel the container's class attribute went from `terrain-panel--background--__wildfire-v1__ terrain-panel--zone1--__wildfire-v1__ undefined` to the same two classes with no third token, and the zone tint still computed `rgb(255, 216, 250)`. Panel 0 and panel 2 keep their `panel0` / `panel2` classes and their `rgb(223, 223, 223)` / `rgb(203, 246, 215)` backgrounds.

---

### Replace the X with a Cancel button

**Summary**: The core of the story. Delete the corner close control and its assets, turn `handleClose` into `handleCancel` with the new log payload, add Cancel to all three footers, and give it the artboard's fill-less style. Both in-panel writers of `ui.showTerrainUI` become assignments in this commit, which is what makes "every writer of the flag assigns" true as delivered. That census counts writers, not reachable writers: the lockout step that follows leaves four of the bar's writes unreachable, and deliberately keeps them (see "What this step must not touch" there).

**Files affected**:
- `src/components/terrain-panel.tsx`: remove the close button and its import; rename and rewrite the handler; add three Cancel buttons; `applyAndClose` assigns
- `src/components/terrain-panel.scss`: delete `.closeButton` / `.closeIcon`; add `.cancelButton`; footer gap 15px to 8px
- `src/assets/setup-close.svg`: delete
- `cypress/support/elements/TerrainSetup.js`: swap `closeTerrainSetupComponent()` for `getCancelButton()`
- `cypress/e2e/terrain-setup.cy.ts`: assert Cancel's fill-less default on the zone-count panel
- `src/components/terrain-panel.test.tsx`: migrate test (d) from the X to Cancel

**Estimated diff size**: ~120 lines

**Delete the import** (`terrain-panel.tsx:18`):

```tsx
import CloseIcon from "../assets/setup-close.svg";
```

**Replace `handleClose`** (`terrain-panel.tsx:98-101`):

```tsx
  const handleCancel = () => {
    const snapshot = openSnapshotRef.current;
    const changed = snapshot
      ? setupSnapshotDiffers(snapshot, { zonesCount, zones, windSpeed, windDirection })
      : false;
    ui.showTerrainUI = false;
    log("TerrainPanelClosed", {
      reason: "cancel",
      changed,
      panel: panelNames[currentPanel],
      reachedWind: maxPanelRef.current === WIND_PANEL
    });
  };
```

`setupSnapshotDiffers` and `openSnapshotRef` are already imported and in scope for `applyAndClose`, so this adds no imports and no state. Computing `changed` before the assignment is not required (the close-time reset is a `useEffect` and cannot reach this closure, verified in the requirements spec), but reading in that order costs nothing and removes the question.

**`panel` needs one module-level const**, beside the `panelClasses` and `panelInstructions` arrays it parallels (`terrain-panel.tsx:25`), and `reachedWind` needs a second one for the index it compares against:

```tsx
const panelNames = ["zones", "conditions", "wind"];
const WIND_PANEL = 2;
```

Names rather than the raw index, following the split this repo's payloads already use: positional things go as indices (`TerrainPanelZoneChanged { zone }`), named enumerations go as labels (`ZoneUpdated` logs `vegetationLabels[...]`, `terrainLabels[...]` and `droughtLabels[...]`, never the enum). It also sidesteps a real trap. `currentPanel` is absolute (0, 1, 2 in both the master model and the activities, verified with a throwaway test) but it is **not** the step number the student saw: `terrain-panel.tsx:250` renders `firstPanel === 0 ? currentPanel + 1 : currentPanel`, so index 1 is "step 2" in the master model and "step 1" in an activity. Nobody misreads `"conditions"`.

**`reachedWind` needs a high-water mark, and it is three lines.** `panel` and `reachedWind` answer two different questions and must not be collapsed into one: `panel` is where the student stood when they gave up, `reachedWind` is whether they ever got to the wind panel at all. Two live paths separate them, and the second is one this story deliberately keeps open. Previous walks a student back off the wind panel, and a click on a zone info tile does the same thing without any Next or Previous event, because `terrain-panel.tsx:53-57` forces `setCurrentPanel(1)` whenever `ui.terrainUISelectedZone` is written and Requirements keep those tiles live while the wizard is open. Reproduced in the browser on `?preset=plainsTwoZone`: with the wizard on the wind panel, one tile click put it back on the conditions panel, footer `Cancel, Next`, step icon "1".

```tsx
  const maxPanelRef = useRef<number>(firstPanel);
```

Raised in `showNextPanel`, which is the only thing that advances the panel:

```tsx
    maxPanelRef.current = Math.max(maxPanelRef.current, currentPanel + 1);
```

and reset beside `setCurrentPanel(firstPanel)` in the close-time reset effect (`terrain-panel.tsx:62-72`), so a reopened wizard does not inherit the previous visit's reach. A ref rather than state: nothing renders off it, so a `useState` would buy a re-render for nothing.

**Why the log stream cannot supply this instead.** `TerrainPanelNextButtonClicked` and `TerrainPanelPreviousButtonClicked` both log with **no payload** (`terrain-panel.tsx:142`, `:147`), so a reconstruction has to know `firstPanel`, a config fact that reaches the log only inside `SimulationStarted`, which a student who abandons Setup may never fire. And the tile jump is invisible to that replay: it emits `ZoneButtonClicked` from a different component, and turning that into a panel reset means knowing a cross-component coupling nothing documents. Measured with a throwaway case on the spike: after one Next and one tile click the navigation stream reads as a single `TerrainPanelNextButtonClicked` with no Previous, so a naive replay concludes the student ended on the wind panel when they ended on the conditions panel. That is the derived measure this plan elsewhere calls *"exactly the kind of derived measure that goes wrong quietly"*, and it is cheaper to log the answer than to reconstruct it wrongly.

**Why the three tokens are worth it.** `changed` says whether the student lost work, which is the ISLAND complaint. `panel` says where they gave up. `reachedWind` says whether they ever saw the wind panel, which is the reason Trudi gave for the design and the thing the bar lockout exists to deliver. Without the third, a cancel from the wind panel (saw it, chose not to commit) and a cancel from the conditions panel after a Previous (saw it, walked back) and a cancel from the conditions panel having never advanced (never saw it) collapse into two buckets when they are three findings. `TerrainPanelSettingsSaved` covers the success side already, since Create only exists on the wind panel.

**`applyAndClose` assigns** (`terrain-panel.tsx:104`): `ui.showTerrainUI = !ui.showTerrainUI` becomes `ui.showTerrainUI = false`.

**Delete the close button** (`terrain-panel.tsx:243-251`), the whole `<button data-testid="terrain-panel-close">` element including its `<CloseIcon />` child.

**Add Cancel to each footer.** The same element in all three, leftmost in the container:

```tsx
                <Button
                  className={`${css.continueButton} ${css.cancelButton}`}
                  onClick={handleCancel}
                  data-testid="terrain-cancel"
                >
                  Cancel
                </Button>
```

It must carry `css.continueButton` as well as `css.cancelButton`. That is what supplies the 76 x 28 shell, and it is also what makes the `.continueButton+.continueButton` gap rule apply between Cancel and its neighbor.

Panel 0's footer becomes Cancel then Next. Panel 1's becomes Cancel, then the existing `firstPanel === 0 &&` conditional Previous, then Next: Cancel goes above the conditional, so the activities get Cancel + Next and only the master model gets three. Panel 2's becomes Cancel, Previous, Create.

**SCSS.** Delete `.closeButton` and its nested `.closeIcon` (`terrain-panel.scss:56-78`). Add `.cancelButton` immediately before `.createButton`, matching how `.createButton` is written:

```scss
    .cancelButton {
      // No fill: Cancel picks up the panel color behind it, which differs per
      // panel. Hover and active come from .continueButton above.
      background-color: transparent;
    }
```

Change the gap (`terrain-panel.scss:240`):

```scss
    .continueButton+.continueButton {
      margin-left: 8px;
    }
```

**The nesting depth is load-bearing, and this is the one thing in the story that fails silently if it is written wrong.** The competitor for the background is not MUI, it is the app's own `.continueButton` rule, which compiles to `.terrain .buttonContainer .continueButton` and sets `#ffffff`. A `.cancelButton` rule written any shallower loses and Cancel renders white. Measured on the spike: a prototype rule at two-class depth computed `rgb(255, 255, 255)`; the same rule at the depth above, inside the existing `.buttonContainer` block and after `.continueButton`, computed `rgba(0, 0, 0, 0)`. MUI never competes, since its emotion rule is a single class, and these buttons render no `MuiTouchRipple` at all.

One line is enough because hover and active are inherited: `.continueButton:hover` outranks `.cancelButton` on specificity, so the `#dfdfdf` hover and `#757575` active arrive for free. Verified in the browser: hovering the built Cancel computes `rgb(223, 223, 223)`.

**Delete the asset**: `git rm src/assets/setup-close.svg`. `terrain-panel.tsx:18` is its only importer anywhere in `src/` or `cypress/`.

**The tour anchors need no new coverage.** Two steps touch the element carrying `data-testid="terrain-panel-container"` (the class-list fix above, and the sibling deleted here), so it is worth saying that `terrain-panel.test.tsx:100-130`, `describe("tour anchor testids")`, already asserts all three of `terrain-panel-container`, `terrain-next` and `terrain-wind` are present. Both cases pass under the change. `anchor-testids.ts` is untouched, and no tour anchors the X. Adding "Cancel" does not disturb the `getAllByRole("button", { name: /next/i })` selection those helpers use.

**Swap the orphaned page-object method for a live one.** `cypress/support/elements/TerrainSetup.js` carries:

```js
  closeTerrainSetupComponent() {
    return cy.get(".terrain-panel--closeButton--__wildfire-v1__").click();
  }
```

It has no callers anywhere in `cypress/`, so it is already dead, and this commit deletes the class it queries. Rather than just removing it, replace it with the handle the new assertion below needs:

```js
  getCancelButton() {
    return cy.get('[data-testid="terrain-cancel"]');
  }
```

**Guard Cancel's fill in the browser, because nothing else can.** The nesting-depth note above says this is the one thing in the story that fails silently if it is written wrong, and it is right: Jest maps SCSS through `identity-obj-proxy` and computes no styles, so a `.cancelButton` rule that loses to `.continueButton` renders Cancel as an ordinary white button with a green suite. The assertion rides inside `terrain-setup.cy.ts`'s existing "Create 3 zone setup using first page display" case, which already has the wizard open on the zone-count panel, so it adds **no new test case and no measurable wall-clock**:

```ts
      // WM-42: Cancel's fill-less default depends on .cancelButton sitting at
      // the same nesting depth as .continueButton and after it -- equal
      // specificity, source order decides. A shallower rule loses and Cancel
      // renders white, which looks deliberate and no unit test can see.
      terrain.getCancelButton()
        .should("have.css", "background-color", "rgba(0, 0, 0, 0)")
        .and("have.css", "border-color", "rgb(121, 121, 121)");
      // The 15px -> 8px footer gap has the same blind spot: it is an artboard
      // value that no Jest test can see. Cancel is leftmost, so the margin the
      // rule sets lands on its neighbor.
      terrain.getNextButton().should("have.css", "margin-left", "8px");
```

Panel 0 is the right panel for it: its `#dfdfdf` background is where the fill-less rule has to beat `.continueButton`'s `#ffffff`, and the border half covers the other half of the design, which comes from `.continueButton` rather than from `.cancelButton`. Mutation-tested on the spike: moving `.cancelButton` one nesting level shallower fails this case and only this case (3 passing / 1 failing).

**Migrate test (d) in the same commit.** It is the only place `terrain-panel-close` is used outside the component, so deleting the X without it leaves the commit red: verified by applying this commit's source changes alone, which fails (d) on `getByTestId("terrain-panel-close")` at 1 failed / 15 passed. Rewritten, it becomes the no-commit canary, reading the simulation's own values back instead of `setupChanged` alone:

```tsx
  // eslint-disable-next-line max-len
  it("(d) change drought, Cancel — the simulation keeps its pre-open values [no-commit-on-cancel canary]", async () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    // eslint-disable-next-line testing-library/no-node-access
    const droughtSlider = screen.getByTestId("drought-slider").querySelector("input")!;
    fireEvent.change(droughtSlider, { target: { value: "3" } });
    await userEvent.click(screen.getByTestId("terrain-cancel"));
    // Read the simulation's own values back. Asserting setupChanged alone cannot
    // fail on a commit-on-cancel regression: updateZones never writes that flag.
    expect(stores.simulation.zones[0].droughtLevel).toBe(2);
    expect(stores.simulation.zones[1].droughtLevel).toBe(1);
    expect(stores.simulation.zonesCount).toBe(2);
    expect(stores.simulation.wind.speed).toBe(0);
    expect(stores.simulation.wind.direction).toBe(0);
    expect(stores.simulation.setupChanged).toBe(false);
    expect(stores.ui.showTerrainUI).toBe(false);
  });
```

That is the whole test change for this commit: no log mock and no new cases, which keeps it green on its own. Verified at 16 passed / 16 with exactly this much folded in.

**The mutation it catches**: adding `simulation.updateZones(zones)` to `handleCancel` commits the student's edits and fails (d). On the pre-migration version, which asserts only `setupChanged`, that same mutation leaves all 16 tests green.

**Measured on the spike in Chrome**, against the artboard: Cancel is 76 x 28, `1px solid rgb(121, 121, 121)`, label Lato 700 14px `rgb(67, 67, 67)`, background `rgba(0, 0, 0, 0)`. Footer gaps 8px and 8px, three-button group 244px wide, centered on the panel to 0.00px, buttons at 354, 438 and 522. Cancel computes transparent over all three panel colors: `rgb(223, 223, 223)`, `rgb(255, 216, 250)`, `rgb(203, 246, 215)`.

---

### Cover what nothing covers today

**Summary**: The migrated test (d) ships with the Cancel commit above, because that commit invalidates it. This commit adds the coverage that is genuinely new: zone-count cancel on both sides of Next, the wind panel's own Cancel, reopen after cancel, footer order on all four variants, and the log payload in every direction including the two paths where `panel` and `reachedWind` disagree. Between them, (i), (d) and (m) click Cancel on all three panels, which no earlier draft of this plan did.

**Files affected**:
- `src/components/terrain-panel.test.tsx`: add a log mock, a payload accessor and a footer-order helper; add (i), (i2), (j), (k), (l), (m), (n), (o), (p)

**Estimated diff size**: ~180 lines

**Add the log mock** at the top of the file, next to the existing imports. This is the same pattern `log-events.test.tsx` already uses, and it does not disturb the other 16 tests (verified: all pass with the mock in place):

```tsx
const mockLog = jest.fn();
jest.mock("../log", () => ({
  log: (...args: unknown[]) => mockLog(...args)
}));
```

Add `mockLog.mockClear();` to the `setupChanged` describe's `beforeEach`, and one accessor beside `goToCreatePanel`, since seven cases read the same payload back:

```tsx
  const cancelPayload = () =>
    mockLog.mock.calls.find((c: unknown[]) => c[0] === "TerrainPanelClosed")![1];
```

**Add the footer-order helper** beside it, and add `within` to the `@testing-library/react` import. Requirements make Cancel the leftmost control in every footer, and that is the one footer requirement no other assertion in this plan can fail on: moving Cancel to last in all three footers leaves every other case in this file green and the whole Cypress suite green, because `[data-testid="terrain-cancel"]` resolves wherever it sits. DOM order is exactly what `getAllByRole` returns, so jsdom settles it and no browser is needed:

```tsx
const footerLabels = () =>
  // eslint-disable-next-line testing-library/no-node-access
  within(screen.getByTestId("terrain-cancel").closest("div")!)
    .getAllByRole("button").map(b => b.textContent);
```

One line of it goes into four cases that already stand on the four footer variants, so this adds no new case: (i) pins panel 0's `["Cancel", "Next"]`, (i2) the master model's `["Cancel", "Previous", "Next"]`, (l) the activity panel's `["Cancel", "Next"]`, and (m) the wind panel's `["Cancel", "Previous", "Create"]`.

**Add (i) and (i2)**, the zone-count cancel on the master-model path, before and after Next. Both set `config.zonesCount = undefined` to reach panel 0, the same way test (g) already does. (i) is the only case in the file that clicks **panel 0's** Cancel:

```tsx
  // eslint-disable-next-line max-len
  it("(i) change zonesCount (2 → 3), Cancel — the simulation keeps 2 zones", async () => {
    // Require config.zonesCount === undefined so the wizard starts on the
    // zones-count panel; only the master model can reach it.
    stores.simulation.config.zonesCount = undefined as any;
    // eslint-disable-next-line testing-library/no-container
    const { container } = render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
    const threeZonesInput = container.querySelector('input[type="radio"][value="3"]') as HTMLInputElement;
    expect(footerLabels()).toEqual(["Cancel", "Next"]);
    fireEvent.click(threeZonesInput);
    // Cancel from the zones-count panel itself, before Next applies the count
    // to the wizard's local state. This is the only case that clicks panel 0's
    // Cancel button.
    await userEvent.click(screen.getByTestId("terrain-cancel"));
    expect(stores.simulation.zones.length).toBe(2);
    expect(stores.simulation.setupChanged).toBe(false);
    // The zones panel is the only panel this case can log from, so it is where
    // the payload's "zones" value is pinned. (k) and (l) pin "conditions" and
    // (m) pins "wind"; between them a hardcoded panel fails somewhere.
    expect(cancelPayload()).toMatchObject({ panel: "zones", reachedWind: false });
  });

  // eslint-disable-next-line max-len
  it("(i2) change zonesCount (2 → 3), Next, Cancel — the simulation keeps 2 zones", async () => {
    stores.simulation.config.zonesCount = undefined as any;
    // eslint-disable-next-line testing-library/no-container
    const { container } = render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
    const threeZonesInput = container.querySelector('input[type="radio"][value="3"]') as HTMLInputElement;
    fireEvent.click(threeZonesInput);
    const nextButtons = () => screen.getAllByRole("button", { name: /next/i });
    await userEvent.click(nextButtons()[nextButtons().length - 1]);
    expect(footerLabels()).toEqual(["Cancel", "Previous", "Next"]);
    await userEvent.click(screen.getByTestId("terrain-cancel"));
    expect(stores.simulation.zones.length).toBe(2);
    expect(stores.simulation.setupChanged).toBe(false);
  });
```

`simulation.zonesCount` is not asserted alongside `simulation.zones.length`: the computed returns `this.zones.length` (`simulation.ts:107-109`), so the two are the same assertion written twice.

**Add (m)**, the wind panel's Cancel. It is the only footer where Cancel sits next to Create, which makes it the panel where a mis-wire is most expensive:

```tsx
  // eslint-disable-next-line max-len
  it("(m) change drought, Next, Cancel on the wind panel — the simulation keeps its pre-open values", async () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    // eslint-disable-next-line testing-library/no-node-access
    const droughtSlider = screen.getByTestId("drought-slider").querySelector("input")!;
    fireEvent.change(droughtSlider, { target: { value: "3" } });
    await goToCreatePanel();
    // The wind panel's Cancel sits next to Create. This is the only case that
    // clicks it, and it is the one place a mis-wire would commit instead.
    expect(screen.getByTestId("terrain-wind")).toBeInTheDocument();
    expect(footerLabels()).toEqual(["Cancel", "Previous", "Create"]);
    await userEvent.click(screen.getByTestId("terrain-cancel"));
    expect(stores.simulation.zones[0].droughtLevel).toBe(2);
    expect(stores.simulation.zones[1].droughtLevel).toBe(1);
    expect(stores.simulation.wind.speed).toBe(0);
    expect(stores.simulation.wind.direction).toBe(0);
    expect(stores.simulation.setupChanged).toBe(false);
    expect(cancelPayload()).toMatchObject({ panel: "wind", reachedWind: true });
  });
```

**Add (j)**, reopen after cancel. It is the only guard on the **close-time reset effect** (`terrain-panel.tsx:62-72`), which is what makes the reopen show the simulation's values rather than the abandoned edit:

```tsx
  // eslint-disable-next-line max-len
  it("(j) change drought, Cancel, reopen — the panel shows the simulation value, not the abandoned edit", async () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    // eslint-disable-next-line testing-library/no-node-access
    const droughtSlider = screen.getByTestId("drought-slider").querySelector("input")!;
    fireEvent.change(droughtSlider, { target: { value: "3" } });
    expect(droughtSlider).toHaveValue("3");
    await userEvent.click(screen.getByTestId("terrain-cancel"));

    act(() => { stores.ui.showTerrainUI = true; });
    // eslint-disable-next-line testing-library/no-node-access
    const reopened = screen.getByTestId("drought-slider").querySelector("input")!;
    expect(reopened).toHaveValue("2");
  });
```

**Add (k) and (l)**, the log payload in both directions. Two separate cases, because a single case cannot tell a real diff from a hardcoded flag:

```tsx
  it("(k) Cancel after an edit logs TerrainPanelClosed with changed: true", async () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    // eslint-disable-next-line testing-library/no-node-access
    const droughtSlider = screen.getByTestId("drought-slider").querySelector("input")!;
    fireEvent.change(droughtSlider, { target: { value: "3" } });
    await userEvent.click(screen.getByTestId("terrain-cancel"));
    expect(cancelPayload()).toEqual({
      reason: "cancel", changed: true, panel: "conditions", reachedWind: false
    });
  });

  it("(l) Cancel on an untouched wizard logs TerrainPanelClosed with changed: false", async () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    expect(footerLabels()).toEqual(["Cancel", "Next"]);
    await userEvent.click(screen.getByTestId("terrain-cancel"));
    expect(cancelPayload()).toEqual({
      reason: "cancel", changed: false, panel: "conditions", reachedWind: false
    });
  });
```

**Add (n), (o) and (p)**, the three cases that make `reachedWind` more than a restatement of `panel`. (k), (l) and (m) already pin it in both directions, but they pin it only where it agrees with `panel`, so a `reachedWind` collapsed to `currentPanel === WIND_PANEL` passes all three. These are the cases where the two fields disagree, plus the one that pins the reset:

```tsx
  // eslint-disable-next-line max-len
  it("(n) reach the wind panel, Previous, Cancel — panel is conditions but reachedWind is true", async () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    await goToCreatePanel();
    expect(screen.getByTestId("terrain-wind")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /previous/i }));
    await userEvent.click(screen.getByTestId("terrain-cancel"));
    // The two fields answer different questions and this is the case where they
    // disagree: reachedWind is a high-water mark, panel is where they stood.
    expect(cancelPayload()).toMatchObject({ panel: "conditions", reachedWind: true });
  });

  // eslint-disable-next-line max-len
  it("(o) reach the wind panel, click a zone tile, Cancel — the tile jump does not erase reachedWind", async () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    await goToCreatePanel();
    expect(screen.getByTestId("terrain-wind")).toBeInTheDocument();
    // Exactly what simulation-info.tsx writes when a zone info tile is clicked.
    // The tiles stay live while the wizard is open (Requirements), and the write
    // forces the wizard back to the conditions panel.
    act(() => { stores.ui.terrainUISelectedZone = 1; });
    expect(screen.queryByTestId("terrain-wind")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("terrain-cancel"));
    expect(cancelPayload()).toMatchObject({ panel: "conditions", reachedWind: true });
  });

  // eslint-disable-next-line max-len
  it("(p) reach the wind panel, Cancel, reopen, Cancel — reachedWind resets with the rest of the wizard", async () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    await goToCreatePanel();
    await userEvent.click(screen.getByTestId("terrain-cancel"));
    expect(cancelPayload()).toMatchObject({ panel: "wind", reachedWind: true });

    mockLog.mockClear();
    act(() => { stores.ui.showTerrainUI = true; });
    await userEvent.click(screen.getByTestId("terrain-cancel"));
    expect(cancelPayload()).toMatchObject({ panel: "conditions", reachedWind: false });
  });
```

(o) is not a duplicate of (n). It is the only case that fails when the zone-tile effect is "tidied" to reset `maxPanelRef` alongside `setCurrentPanel(1)`, which is the edit someone makes on the assumption that the ref should mirror `currentPanel`.

**Mutations these catch**, each run against the spike:

| Mutation | Fails |
|---|---|
| `handleCancel` gains `simulation.updateZones(zones)` | (i2), (j), (m), and (d) from the commit above |
| Panel 0's Cancel wired to `applyAndClose` | (i) |
| Panel 2's Cancel wired to `applyAndClose` | (m) |
| The close-time reset effect stops calling `setZones` | (j) |
| `changed` hardcoded to `true` | (l) |
| `changed` hardcoded to `false` | (k) |
| `panel` hardcoded to `"zones"` | (k), (l), (m) |
| `panel` hardcoded to `"conditions"` | (i), (m) |
| `panel` hardcoded to `"wind"` | (i), (k), (l) |
| Cancel rendered last instead of leftmost | (i), (i2), (l), (m), one per footer variant |
| `reachedWind` hardcoded to `true` | (i), (k), (l), (p) |
| `reachedWind` hardcoded to `false` | (m), (n), (o), (p) |
| `reachedWind` collapsed to `currentPanel === WIND_PANEL` | (n), (o) |
| The zone-tile effect also resets `maxPanelRef` | (o) |
| The close-time reset effect stops resetting `maxPanelRef` | (p) |

(k) and (l) have to be separate cases: each catches the hardcode in one direction only, so either alone would pass against a `changed` that is always the value it happens to expect.

The two per-panel wiring rows are the reason (i) and (m) exist as separate cases rather than being folded into (i2) and (d). The Cancel element is single-sourced through a `renderCancelButton` helper, so the three footers cannot drift from each other, but each footer still decides for itself whether it calls that helper at all and the wizard still has to render it: before these cases only the conditions panel's Cancel was ever clicked, and rewiring either of the other two to `applyAndClose` left the **whole Jest suite** green.

**(j) does not guard the `observer` dependency**, despite what the comment block at `terrain-panel.tsx:74-95` might suggest. Unwrapping `observer` fails three tests, two of which already exist: "is not displayed until the UI store value is set" and (h), which is already named `[canary for stale-snapshot bug]` for exactly that effect. Deleting `setZones` from the close-time reset effect is what (j) alone catches (1 failed, 21 passed against the 22-case file).

---

### Lock the bottom bar's model controls while the wizard is open

**Summary**: Three `disabled` predicates take `ui.showTerrainUI`, the Setup button gains `selected` and an open-only handler, and the toggle test is rewritten. Restart, Fire Line and Helitack need no guard: they all require `simulationStarted` and the wizard can only be open before the run starts.

**Files affected**:
- `src/components/bottom-bar.tsx`: three predicates, one prop, one handler
- `src/components/bottom-bar.test.tsx`: rewrite the toggle test, add five guard tests and one stays-live test
- `src/components/log-events.test.tsx`: add the `TerrainPanelButtonClicked` case
- `cypress/e2e/bottom-bar-state-machine.cy.ts`: add state 8 to the state-machine matrix
- `cypress/e2e/bottom-bar-visuals.cy.ts`: assert the Setup button's selected-state highlight, and update the header inventory

**Estimated diff size**: ~105 lines

**What this step must not touch.** "Lock the bar" means the model controls in `.mainContainer` and nothing else, and both exclusions are one plausible edit away from being violated by someone working from the step title alone:

- **`src/components/simulation-info.tsx` does not change.** Line 33 reads `const uiDisabled = simulation.simulationStarted;` and feeds `locked={uiDisabled}`, which drops the tile's click handler. Adding `|| ui.showTerrainUI` there is a one-token edit that contradicts the requirement and also kills switching zones from the tiles while Setup is open. Already guarded: the existing "opens terrain panel UI when one of the zone buttons is clicked" test in `simulation-info.test.tsx` clicks two more tiles *while the wizard is open* and asserts the zone switches, so that mutation fails it (verified: 1 failed / 3).
- **The `.rightContainer` block (`bottom-bar.tsx:232-252`) does not change.** The Hazbot Analysis button and the fullscreen toggle are not ways out of the wizard. This one had no guard, so the step adds one.
- **The four `ui.showTerrainUI = false` writes in the bar's handlers stay, even though the lockout makes all four unreachable.** `handleStart` (`:278`) and `placeSpark` (`:390`) are orphaned by this step's own guards; `handleFireLine` (`:362`) and `handleHelitack` (`:376`) were already unreachable, since both require `simulationStarted`. Deleting any one of them, or all four, leaves the suite green and lint clean, so nothing here is load-bearing for the tests. They stay anyway: they are redundant guard clauses rather than orphaned parameters, and deleting them would promote the two new `disabled` predicates from UX affordances into correctness invariants. A later "simplification" of `disabled={!simulation.startEnabled || ui.showTerrainUI}` back to its old form would then start a run with the wizard floating over it, and a wizard open over a running simulation is a state with no good recovery: Create would commit setup settings mid-run. Cost of keeping them is one dead line each.

**`sparkEnabled`** (`bottom-bar.tsx:74-79`):

```tsx
  get sparkEnabled() {
    const { simulation, ui } = this.stores;
    return !simulation.simulationStarted
      && !ui.showTerrainUI
      && simulation.canAddSpark
      && ui.interaction !== Interaction.PlaceSpark;
  }
```

**Reload** (`bottom-bar.tsx:168`) and **Start** (`bottom-bar.tsx:186`) take the flag at the consumer, since `reloadEnabled` and `startEnabled` are simulation computeds:

```tsx
              disabled={!simulation.reloadEnabled || ui.showTerrainUI}
```
```tsx
              disabled={!simulation.startEnabled || ui.showTerrainUI}
```

`ui` is already destructured in `render()` (`bottom-bar.tsx:133`), so neither line needs new scope.

**The Setup button** keeps its `disabled` and gains `selected` (`bottom-bar.tsx:146`):

```tsx
              disabled={!simulation.setupEnabled}
              selected={ui.showTerrainUI}
```

The two props cannot be combined: `IconButton` writes both class names onto one element (`icon-button.tsx:19`) and `icon-button.scss:26` nests `.selected` inside `&:not(.disabled)`, so a `disabled` Setup button renders greyed with the highlight suppressed.

**`handleTerrain`** (`bottom-bar.tsx:386-390`) stops toggling and keeps logging every click:

```tsx
  public handleTerrain = () => {
    const { ui } = this.stores;
    ui.showTerrainUI = true;
    log("TerrainPanelButtonClicked");
  };
```

No early return. A student poking the lit Setup button still logs, which is the signal worth keeping about whether the `selected` treatment reads as "already open".

**That decision needs its own case, because the cleanup that reverses it is invisible.** `TerrainPanelButtonClicked` is emitted at `bottom-bar.tsx:391` and asserted nowhere in `src/` or `cypress/` today. Adding `if (ui.showTerrainUI) return;` to `handleTerrain`, which is exactly the "simplify the inert handler" edit a later reader makes, leaves every other case in this plan green while deleting the signal and falsifying the `LOGGED-EVENTS.md` row. `log-events.test.tsx` is the right home: it already owns log-payload assertions, already has the mock, and already renders `BottomBar`, so this needs no new harness and does not reopen the resolved question about where the *Cancel* payload cases live (that one turned on `log-events.test.tsx` having no `TerrainPanel` harness).

```tsx
  it("logs on every Setup click, including the no-op click while the wizard is open", async () => {
    render(<Provider stores={stores}><BottomBar /></Provider>);
    await userEvent.click(screen.getByTestId("terrain-button"));
    await userEvent.click(screen.getByTestId("terrain-button"));
    const calls = mockLog.mock.calls.filter((c: unknown[]) => c[0] === "TerrainPanelButtonClicked");
    expect(calls).toHaveLength(2);
    expect(stores.ui.showTerrainUI).toBe(true);
  });
```

**Rewrite the toggle test** (`bottom-bar.test.tsx:99-110`), whose name and final assertion both stop being true:

```tsx
  it("terrain button opens the terrain dialog and a second click leaves it open", async () => {
    render(
      <Provider stores={stores}>
        <BottomBar />
      </Provider>
    );
    expect(stores.ui.showTerrainUI).toBe(false);
    await userEvent.click(screen.getByTestId("terrain-button"));
    expect(stores.ui.showTerrainUI).toBe(true);
    // Cancel and Next/Create are the only ways out, so the Setup button is
    // open-only: clicking it again must not close the wizard.
    await userEvent.click(screen.getByTestId("terrain-button"));
    expect(stores.ui.showTerrainUI).toBe(true);
  });
```

**Add the lockout tests.** They seed state 3 (a spark placed) so Spark, Reload and Start would otherwise all be live, which is what makes the assertions capable of failing:

```tsx
  describe("model controls while the Setup wizard is open", () => {
    // The wizard can only be open before the run starts, so Restart, Fire Line
    // and Helitack are already disabled by simulationStarted and need no guard.
    const renderWithWizardOpen = () => {
      seedState(stores, 3); // a spark placed, so Spark/Reload/Start would otherwise be live
      stores.ui.showTerrainUI = true;
      render(<Provider stores={stores}><BottomBar /></Provider>);
    };

    it("disables Spark", () => {
      renderWithWizardOpen();
      expectButtonState("spark-button", false);
    });

    it("disables Reload", () => {
      renderWithWizardOpen();
      expectButtonState("reload-button", false);
    });

    it("disables Start", () => {
      renderWithWizardOpen();
      expectButtonState("start-button", false);
    });

    it("leaves Setup enabled and marks it selected", () => {
      renderWithWizardOpen();
      expectButtonState("terrain-button", true);
      // selected and disabled cannot be combined: IconButton puts both class
      // names on one element and icon-button.scss nests .selected inside
      // :not(.disabled), so a disabled Setup button would render greyed with
      // no highlight.
      expect(screen.getByTestId("terrain-button").className).toContain("selected");
    });

    it("leaves the wizard open when Setup is clicked", async () => {
      renderWithWizardOpen();
      await userEvent.click(screen.getByTestId("terrain-button"));
      expect(stores.ui.showTerrainUI).toBe(true);
    });
  });
```

The `selected` assertion works in jsdom because `identity-obj-proxy` resolves `css.selected` to the string `"selected"`. That is also its limit: jsdom computes no CSS, so it cannot see the failure the requirements spec spent a review round on, where `disabled` alongside `selected` leaves the class on the element and suppresses the treatment anyway. The class-name assertion passes with `icon-button.scss` gutted.

**So assert the rendered highlight in the browser too.** `bottom-bar-visuals.cy.ts` already has the pattern for the sibling case ("renders highlight opacity = 1 on the Fireline button while its tool is armed", lines 125-131); the Setup version goes beside it:

```ts
  // WM-42: `selected` and `disabled` cannot be combined on IconButton --
  // icon-button.tsx puts both class names on one element and icon-button.scss
  // nests .selected inside &:not(.disabled), so a disabled Setup button renders
  // greyed with the highlight suppressed. jsdom computes no CSS, so this is the
  // only place that failure is observable.
  it("renders highlight opacity = 1 on the Setup button while the wizard is open", () => {
    cy.get("[data-testid='terrain-button']").click();
    cy.get("[data-testid='terrain-header']").should("be.visible");
    cy.get('[data-testid="terrain-button"] [class*="iconButtonHighlightSvg"]')
      .should("have.css", "opacity", "1");
    cy.get('[data-testid="terrain-button"]').should("have.css", "filter", "none");
  });
```

Mutation-tested on the spike: adding `|| ui.showTerrainUI` to the Setup button's `disabled` fails this case and only this case, reading `opacity: 0` and `filter: grayscale(1)`. `bottom-bar-visuals.cy.ts` holds 8 cases today, so it runs at 9 with this one and reports 8 passing / 1 failing under the mutation.

**Update the spec's header inventory in the same edit.** `bottom-bar-visuals.cy.ts` opens by listing what it locks in, and "default-state highlight opacity" no longer covers the file. It becomes "default-state highlight opacity and the Setup button's selected-state highlight".

**Add the stays-live assertion for the Hazbot button.** It goes in the existing `describe("BottomBar Hazbot button (WM-6)")` block rather than alongside the guard tests above, because the button only renders under `?hazbotRules=23` and that block already sets the URL:

```tsx
  // WM-42: the bar lockout covers the model controls in .mainContainer only.
  // The Hazbot button sits in .rightContainer, is not a way out of the wizard,
  // and must neither disappear nor close Setup when it is used.
  it("still opens feedback while the Setup wizard is open, and leaves the wizard open", async () => {
    stores.ui.showTerrainUI = true;
    render(<Provider stores={stores}><BottomBar /></Provider>);
    await userEvent.click(screen.getByTestId("hazbot-button"));
    expect(stores.ui.showHazbotFeedback).toBe(true);
    expect(stores.ui.showTerrainUI).toBe(true);
  });
```

It asserts the behavior rather than `not.toBeDisabled()`, which would have been an assertion that cannot fail: `BottomBar` renders `<HazbotButton />` with no props and `HazbotButton` renders its `<Button>` with no `disabled` prop at all (`hazbot-button.tsx:300-313`), so nothing in this step could ever make that button disabled.

The fullscreen toggle gets no test: it renders only under `screenfull?.isEnabled`, which is off in jsdom. It is covered by the prose above and by the fact that nothing in the step goes near it.

**Mutations these catch**, each run against the spike:

| Mutation | Fails |
|---|---|
| Drop the three `ui.showTerrainUI` guards | disables Spark, disables Reload, disables Start |
| `handleTerrain` back to a toggle | the rewritten toggle test, leaves the wizard open when Setup is clicked |
| Drop `selected={ui.showTerrainUI}` | leaves Setup enabled and marks it selected |
| Add `\|\| ui.showTerrainUI` to Setup's `disabled` | leaves Setup enabled and marks it selected |
| Gate `.rightContainer`'s Hazbot block on `!ui.showTerrainUI` | still opens feedback while the Setup wizard is open |
| Make the Hazbot click path also close the wizard | still opens feedback while the Setup wizard is open |
| `handleTerrain` early-returns when the wizard is already open | logs on every Setup click (and nothing else: 1 failed / 85 passed across the three touched suites) |

Rows three and four are the point of the Setup assertion: it fails both when `selected` is missing and when `disabled` is added alongside it, which is the mistake the requirements spec spent a review round on.

**Add state 8 to the Cypress state machine.** `bottom-bar-state-machine.cy.ts` documents the bar as a state machine and covers states 1 through 7 with the same seven-button matrix; this story adds a state to that machine, so it belongs in that file. Append inside the existing `describe`, after the state 7 case:

```ts
  // State 8: SetupOpen (WM-42) — the wizard locks the model controls, so Cancel
  // and Next/Create are the only ways out. Setup itself stays enabled and shows
  // the selected treatment instead; its click is inert (open-only handler).
  // Restart, Fireline and Helitack need no guard: they all require
  // simulationStarted, and the wizard can only be open before the run starts.
  it("state 8 (SetupOpen): only Setup stays enabled; Spark/Reload/Start locked out", () => {
    cy.window().then((win: Window) => { debugHooks(win).test.placeSparkInZone(0); });
    // Assert the pre-state first: from SparkPlaced all three are live, which is
    // what makes the post-open assertion below able to fail.
    expectButtonStates({
      setup: true, spark: true,
      reload: true, restart: false, startStop: true,
      fireLine: false, helitack: false,
    });
    cy.get("[data-testid='terrain-button']").click();
    cy.get("[data-testid='terrain-header']").should("be.visible");
    expectButtonStates({
      setup: true, spark: false,
      reload: false, restart: false, startStop: false,
      fireLine: false, helitack: false,
    });
  });
```

The pre-state assertion is what stops this being decoration: without it, a matrix of "everything disabled" would also pass in a state where those buttons were never enabled. Mutation-tested on the spike: dropping the three `ui.showTerrainUI` guards fails state 8 and only state 8, 9 of 10 passing.

**Browser verification** (run on the spike): with the wizard open, Spark, Reload, Restart and Start all report `disabled: true`, the Setup button reports `disabled: false` with the `selected` class and its icon still in color, and clicking Cancel unlocks the bar again.

---

### Update LOGGED-EVENTS.md

**Summary**: Two rows stop being true. Kept as its own commit so the docs change is reviewable on its own, and taken last so it describes what the branch actually delivers.

**Files affected**:
- `LOGGED-EVENTS.md`: lines 45 and 46

**Estimated diff size**: ~2 lines

Line 45, `TerrainPanelButtonClicked`, currently "User opens/closes Terrain Setup". The button no longer closes, and clicking it while the wizard is open logs without changing anything:

```markdown
| `TerrainPanelButtonClicked` | — | User clicks the Setup button: opens Terrain Setup, or no-ops when it is already open. Not an open count: a click on the already-open button logs too. |
```

Line 46, `TerrainPanelClosed`, currently "User closes Terrain Setup via X button" with no parameters:

```markdown
| `TerrainPanelClosed` | `{ reason: "cancel", changed: boolean, panel: "zones" \| "conditions" \| "wind", reachedWind: boolean }` | User leaves Terrain Setup without saving, via the Cancel button. `changed` is true when the wizard held an edit that was discarded. `panel` is the panel they left **from**, not the step number shown on screen, which differs between the master model and the activities. `reachedWind` is whether they ever got to the wind panel during this visit, which is not the same question: Previous and a zone-info-tile click both walk a student back off it, so `panel: "conditions"` with `reachedWind: true` is a normal reading. With the bottom bar's model controls locked while the wizard is open, this is the only close-without-commit route, so a `reason` other than `"cancel"` does not occur today; the parameter marks the boundary against older logs, which carry no parameters at all. |
```

---

## Open Questions

### RESOLVED: Should the commit for the bar lockout come before or after the Cancel commit?

**Decision**: A, Cancel first, then the lockout, as the plan is written.

The order matters only for the intermediate commits, and A is the one where no commit on the branch leaves the wizard harder to leave than master does. After the Cancel commit the X is gone but the bar is still live, so Setup, Spark and Start all still dismiss; after the lockout commit those are gone but Cancel exists. B inverts that and produces one commit where the bar is locked and the X is still the only labeled way out, which is a state nobody should have to bisect through. C gains nothing: the two changes touch disjoint files (`terrain-panel.*` versus `bottom-bar.*`), no test crosses the boundary, and splitting keeps each commit reviewable on its own.

---

### RESOLVED: Where do the Cancel log-payload tests live?

**Decision**: A, `terrain-panel.test.tsx`, with a log mock added to that file.

`log-events.test.tsx` owns log-payload assertions today, but it has never rendered `TerrainPanel` and has no terrain coverage at all, so B and C both mean standing up a second copy of the panel harness (render with `Provider`, reach the drought slider through `getByTestId("drought-slider").querySelector("input")`) purely to assert one payload. That is the duplication the "one source of truth" rule exists to prevent, and it splits the Cancel behavior across two files where a reviewer has to find both halves.

Verified on the spike: adding the mock to `terrain-panel.test.tsx` disturbs none of the existing tests, and all 20 pass.

---

### RESOLVED: Does a tour that rings a locked control need handling in this story?

**Decision**: No. **[WM-32](https://concord-consortium.atlassian.net/browse/WM-32)** owns it, and nothing is owed here: no code, no requirement, no Delivery Note.

The question came out of a measurement on the spike: with the wizard open, tour 42/2 rings a Reload button the lockout has greyed out, and an `actionGated` popover carries only a close ×, so the step cannot be satisfied. Chasing it turned up that the failure mode is far older and far wider than this story. 29 of the 32 tour entries in `tour-map.tsx` open on `restart-button` and 3 on `reload-button`, and both controls disable themselves the moment they are used (`restartEnabled === simulationStarted`, `reloadEnabled === setupChanged || sparks.length > 0`). Reproduced on master with the wizard closed: ruleset 23/2 after a Restart shows "First, **Restart** your model. Step 1 of 3" anchored to a disabled button.

That is WM-32, "Dismissing Hazbot coach marks can get the sequence stuck on Restart button", whose investigation comment (2026-08-07) already records the same census and three distinct dead ends. Its fix lives on `WM-32-skip-satisfied-steps` and is deliberately generic: `dropSatisfiedLeadingSteps` reads the rendered `disabled` state rather than naming Restart and Reload, so a step disabled by `ui.showTerrainUI` is dropped exactly like one disabled by having been used. WM-42 needs no coordination with it, and its landing order does not matter.

Worth knowing rather than acting on: the lockout keeps the Setup button enabled, which is what keeps the 29 `restart-button` tours working under that fix, since their second step anchors `terrain-button`. (Read off `dropSatisfiedLeadingSteps`, not run against the two branches together.)

---

### RESOLVED: Does the Cypress suite need a case for the lockout?

**Decision**: B, add a state 8 case to `bottom-bar-state-machine.cy.ts`. It is in the lockout step above, along with the deletion of an orphaned page-object method that the story breaks.

The existing suite needs no repair, and that is measured rather than predicted: the whole suite, all 6 specs and 27 tests, was run headless against the spike and passed unchanged. That includes `terrain-setup.cy.ts`, which drives the wizard end to end through both zone counts and both `?zonesCount=` variants, and `bottom-bar-visuals.cy.ts`, whose widget-width assertions are undisturbed by the `selected` class.

The case is added anyway because `bottom-bar-state-machine.cy.ts` is the one place the bar's state machine is written down, and it covers states 1 through 7 with the same seven-button matrix. Leaving the state this story adds out of that file makes the file quietly incomplete as documentation. The argument against, that it duplicates in a slow browser what five fast Jest tests already assert, is real; it is outweighed by keeping the state machine's record whole, and it costs about 2 seconds of CI.

The orphaned method is independent of the answer. `TerrainSetup.js` carries `closeTerrainSetupComponent()`, which queries `.terrain-panel--closeButton--__wildfire-v1__`. It has no callers anywhere in `cypress/`, so it is dead today and this story would leave it dead and broken. Round 1 of the self-review turned that deletion into a swap: it becomes `getCancelButton()`, which the new Cancel-fill assertion in `terrain-setup.cy.ts` uses.

Round 1 also added two more browser assertions, for a different reason than state 8's. State 8 duplicates in a slow browser what five fast Jest tests already assert, and is justified on documentation grounds. The Setup-highlight and Cancel-fill assertions are the opposite case: both guard CSS facts this story establishes and that this plan itself labels silently-breakable, and the browser is the only place either can be observed. Together the three take Cypress from 27 to 29 cases, since the Cancel one rides inside an existing case.

---

## Self-Review

**Round 1** (2026-08-23). Roles: Senior Engineer, QA Engineer, Visual Design Reviewer, Education Researcher. Accessibility review is deliberately excluded (standing decision for this repo).

Every finding below was verified before it was written down. The plan's own numbers were re-measured first and all of them hold: Jest baseline 879, spike 889/889 across 76 suites (both on the pre-WM-46 base, see Verification status); Cypress baseline 27, spike 28/28 across all 6 specs (run headless in Chrome against a spike dev server); `npx eslint` clean on all four touched source files; `npx tsc --noEmit` adds nothing beyond the two pre-existing `line-chart.tsx` errors. Every mutation named in the plan's three mutation tables was run and behaves as the plan says. The browser measurements were re-taken against a real css-loader build: Cancel 76 x 28, `rgba(0, 0, 0, 0)`, `1px solid rgb(121, 121, 121)`, radius 5px, Lato 700 14px `rgb(67, 67, 67)`; wind-panel footer at 354 / 438 / 522, group 244px, gaps 8 and 8, centered on the panel to 0.00px inside a 308px content box; panel backgrounds `rgb(223, 223, 223)` / `rgb(255, 216, 250)` / `rgb(203, 246, 215)`; the conditions panel's class attribute carries no `undefined` token after the rider fix. The findings are what survived that pass.

### Senior Engineer

#### RESOLVED: The lockout orphans four `ui.showTerrainUI = false` writes and the plan does not decide their fate

**Decision**: Keep all four, and say so. The lockout step's "What this step must not touch" block gains a third bullet carrying the reasoning, and the Cancel step's census sentence now flags that it counts writers rather than reachable writers.

Deletion-mutated before deciding: removing any one of the four, or all four at once, leaves the full suite green (891/891 on the pre-WM-46 base) and `eslint` clean, so the choice is not constrained by the tests. They stay because they are redundant guard clauses, not orphaned parameters. Deleting them would make the two new `disabled` predicates correctness invariants rather than UX affordances, and the failure that buys is a run starting under an open wizard, where Create commits setup settings mid-run. Deleting only the two this story orphans was the worst option on the table: it removes the two backed by the newest guards and keeps the two that have been dead longest.


Once Spark and Start take the guard, `placeSpark` (`bottom-bar.tsx:394`) and `handleStart` (`:278`) can no longer run with the wizard open, so their `ui.showTerrainUI = false` lines become unreachable. `handleFireLine` (`:362`) and `handleHelitack` (`:376`) already were, since both require `simulationStarted`. That is four of the six writers of the flag outside the panel.

Verified by grep rather than assumed: `placeSpark` and `handleStart` are each referenced exactly once outside their own definition, as their buttons' `onClick`, and `simulation.start()` has exactly one caller in `src/` (`bottom-bar.tsx:320`). There is no second entry point.

The step's summary sentence walks right past this: *"Both in-panel writers of `ui.showTerrainUI` become assignments in this commit, which is what makes 'every writer of the flag assigns' true as delivered."* It counts the writers and does not notice that the lockout has just killed four of them. A reviewer applying this repo's own standard ("delete what the change orphans") will ask, and the plan has no answer written down.

Suggested resolution: keep them and say so in the step. They are one-line defensive resets whose cost is zero and whose removal would make the guard load-bearing for correctness rather than for UX, which is a worse trade on a control that discards student work. But that is a decision, and it belongs in the spec rather than being discovered in review. Do not add a code comment saying it; the reasoning is spec material.

---

### QA Engineer

#### RESOLVED: Two of the three Cancel buttons are never clicked by any test

**Decision**: Covered, by splitting (i) and adding (m), which is now in the plan's test step along with the two per-panel mutation rows. Verified after the change: 22 passed in `terrain-panel.test.tsx`, and each wiring mutation now fails exactly one case (panel 0 → (i), panel 2 → (m)).


The plan adds the same Cancel element to all three footers and then exercises exactly one of them. Tests (d), (j), (k) and (l) all cancel from the conditions panel; (i) reaches panel 0, clicks Next, and cancels from the conditions panel as well. Nothing ever clicks the Cancel on the zone-count panel or the Cancel that sits next to Create on the wind panel.

Mutation-tested, both directions, on the spike: rewiring the wind panel's Cancel to `onClick={applyAndClose}` leaves **the full Jest suite green** (889/889 on the pre-WM-46 base), and rewiring the zone-count panel's Cancel the same way leaves all 20 tests in `terrain-panel.test.tsx` green. Cypress does not close the gap either: no spec in `cypress/e2e/` clicks Cancel at all.

That is the exact failure this story is built to prevent, shipped with a green suite. The wind panel is the worst place for it: Cancel is newly adjacent to Create, at an 8px gap, and a mis-wired Cancel there would commit the student's settings while the label says it discards them.

Suggested resolution: extend the wind-panel case rather than adding two more full tests. Test (d) already walks to the wind panel in the `goToCreatePanel` helper, so a sixth case that changes drought, clicks Next, clicks Cancel on the wind panel and re-asserts the simulation's own values costs about ten lines and kills the mutation. Panel 0's Cancel can be covered by moving test (i)'s Cancel click one step earlier, cancelling from panel 0 before Next instead of after, which also makes (i) assert something (i) does not assert today: that abandoning a zone-count change before it is even applied locally leaves the simulation alone.

---

#### RESOLVED: Test (j)'s named mutation is already caught by two existing tests; the one it uniquely catches is not named

**Decision**: Claim corrected in the plan and the mutation table; (j) is kept, named as the close-time reset effect's only guard. The `observer` sentence also needs striking from requirements.md, where the round-1 QA finding makes the same claim.


The plan introduces (j) as *"the test that makes the `observer` dependency documented at `terrain-panel.tsx:74-95` enforceable"*, and requirements.md says the same. That is not what happens.

Mutation-tested on the spike: unwrapping `observer` from `TerrainPanel` fails three tests, and two of them already exist on master. One is "is not displayed until the UI store value is set"; the other is (h), which is already named `[canary for stale-snapshot bug]` and is the test written specifically for the effect that comment block describes. The `observer` dependency was enforceable before this story.

What (j) does catch, and nothing else does, is a regression in the **close-time reset effect** (`terrain-panel.tsx:62-72`). Deleting its `setZones(simulation.zones.map(z => z.clone()))` line fails (j) and only (j): 1 failed, 19 passed. That is a real and currently unguarded mutation, and it is the requirement (j) exists to serve ("Reopening the wizard after Cancel shows the simulation's current values").

Suggested resolution: keep the test, fix the claim. Name the reset-effect mutation in the step and in the mutation table, and drop the `observer` sentence here and in requirements.md. The wrong attribution is not cosmetic: a later reader comparing (j) against (h) on the stated grounds will find them redundant and delete the wrong one.

---

#### RESOLVED: The Hazbot "stays enabled" assertion cannot fail, and its mutation table names an edit outside the step's files

**Decision**: Replaced with a behavior assertion (click the button with the wizard open; feedback opens, wizard stays open). Verified: 40 passed, and it now catches two real mutations, gating the Hazbot block on `!ui.showTerrainUI` and making the Hazbot path close the wizard.


The step adds `expect(screen.getByTestId("hazbot-button")).not.toBeDisabled();` and claims two mutations for it: hiding the Hazbot button while the wizard is open, and disabling it.

The second is not expressible. `BottomBar` renders `<HazbotButton />` with no props (`bottom-bar.tsx:244`), and `HazbotButton` renders its `<Button>` with no `disabled` prop at all (`hazbot-button.tsx:300-313`). Nothing in `bottom-bar.tsx` can disable that button, so `not.toBeDisabled()` is true by construction and stays true under every edit this step could make. Producing the named mutation means adding a `disabled` prop to `hazbot-button.tsx` and plumbing `ui.showTerrainUI` into a component that does not read it, which is not a slip anyone makes.

The first mutation is real but only because `getByTestId` throws when the element is absent, so the useful half of the test is the query, not the assertion.

Suggested resolution: either drop the assertion and keep the query as a presence check with an honest one-mutation table, or make the test earn its place by asserting what the exclusion actually means. The second is cheap and is the version worth having: click the Hazbot button while the wizard is open and assert `ui.showHazbotFeedback` becomes true and `ui.showTerrainUI` is still true. That fails if anyone ever gates the right container on `ui.showTerrainUI`, and it states the requirement ("neither discards wizard state, and neither is a way of leaving Setup") instead of restating the DOM.

---

#### RESOLVED: The Setup button's `selected` highlight, the one visual change nobody has seen, has no browser assertion

**Decision**: Added to `bottom-bar-visuals.cy.ts`, beside the Fireline-armed case it mirrors, and the spec's header inventory updated to match. Verified on the spike: the file goes from 8 cases to 9 and passes at 9/9, and adding `|| ui.showTerrainUI` to the Setup button's `disabled` fails it and only it, reading `opacity: 0` and `filter: grayscale(1)`. Costs one case, about 1.2s.


Requirements round 2 spent a whole finding establishing that `selected` and `disabled` cannot be combined on `IconButton`, with a measured table showing that adding `disabled` silently drops the highlight to opacity 0 and greys the button. The plan then guards that with `expect(screen.getByTestId("terrain-button").className).toContain("selected")` in jsdom, and notes in the same breath that the assertion only works because `identity-obj-proxy` resolves the class name to a string. jsdom computes no CSS, so this assertion cannot detect the failure mode the review round was about. If `icon-button.scss:26` is ever restructured, or the `.selected` rule is dropped, the class stays on the element and the test stays green while the affordance disappears.

The repo already has the pattern, for the sibling case: `bottom-bar-visuals.cy.ts:125-131`, "renders highlight opacity = 1 on the Fireline button while its tool is armed", reads `[class*="iconButtonHighlightSvg"]` and asserts `opacity` is `"1"`. Measured on the spike in Chrome with the wizard open, the Setup button gives exactly the values that test's shape expects: highlight opacity `1`, `filter: none`, `disabled: false`, `selected` class present. Under the `disabled` mutation it would be opacity `0` and `grayscale(1)`.

Suggested resolution: add the three-line equivalent to `bottom-bar-visuals.cy.ts`, next to the Fireline case. The plan's own cost argument points this way rather than away from it: it concedes that Cypress state 8 "duplicates in a slow browser what five fast Jest tests already assert" and adds it anyway for completeness, whereas here the browser is the only place the assertion can live at all.

---

### Visual Design Reviewer

#### RESOLVED: Cancel's load-bearing SCSS nesting depth is protected by nothing but the prose in this spec

**Decision**: Guarded in `terrain-setup.cy.ts` rather than in the bottom-bar visuals spec, since Cancel is not in the bottom bar. It folds into the existing "Create 3 zone setup using first page display" case, which already has the wizard open on the zone-count panel, so it adds no new case and no measurable time. The handle comes from `getCancelButton()`, which replaces the `closeTerrainSetupComponent()` this story was deleting anyway. Verified: moving `.cancelButton` one nesting level shallower fails that case and only that case (3 passing / 1 failing).


The plan is emphatic about this and then leaves it unguarded: *"The nesting depth is load-bearing, and this is the one thing in the story that fails silently if it is written wrong ... A `.cancelButton` rule written any shallower loses and Cancel renders white."*

Confirmed against the built stylesheet rather than reasoned from the source. The four competing rules ship as `.terrain .buttonContainer .continueButton` (`rgb(255, 255, 255)`), its `:hover` (`rgb(223, 223, 223)`) and `:active` (`rgb(117, 117, 117)`), and `.terrain .buttonContainer .cancelButton` (`transparent`). Cancel's default wins on source order alone, at equal specificity, and its hover and active are inherited on specificity. Both facts are one careless edit from reversing, and neither leaves a trace when it does: Cancel would render as an ordinary white button, which looks deliberate.

Nothing catches it. Jest maps SCSS through `identity-obj-proxy` and computes no styles, and no Cypress spec asserts anything about Cancel. So the only defense is that whoever moves the rule reads this spec first.

Suggested resolution: one assertion in the browser, in the same place as the Setup-highlight one above, so the two CSS facts this story establishes are guarded together. `cy.get("[data-testid='terrain-cancel']").should("have.css", "background-color", "rgba(0, 0, 0, 0)")` after opening the wizard is enough, and it fails the moment the rule loses. Worth pairing with a border assertion, since `1px solid rgb(121, 121, 121)` is the other half of the fill-less design and comes from `.continueButton` rather than from `.cancelButton`.

---

### Education Researcher

#### RESOLVED: `TerrainPanelClosed` records that the student cancelled and what they lost, but not the thing the story exists to change

**Decision**: Add `panel`, as a name rather than an index: `{ reason: "cancel", changed, panel: "zones" | "conditions" | "wind" }`. The plan's Cancel step carries the one-const change and the reasoning; (i), (k), (l) and (m) pin all three values so no hardcode survives, verified by mutating the field to each of the three in turn.

Names beat the index on two counts. The repo already splits its payloads that way, indices for positional things and labels for named enumerations. And the index is not the step number the student saw, since `terrain-panel.tsx:250` renders `firstPanel === 0 ? currentPanel + 1 : currentPanel`, so index 1 reads as "step 2" in the master model and "step 1" in an activity. A throwaway test confirmed `currentPanel` is absolute across both models before the naming question was settled.


The payload is `{ reason, changed }`. `changed` answers "did they lose work", which is the ISLAND complaint. It does not answer the question Trudi's rationale is actually about: *"it will make people click next to go to the wind setup instead of Xing out and missing that page entirely."* Success for this story is students reaching the wind panel; a cancel from the zone-count or conditions panel is the failure it is meant to remove, and after the lockout it is the only remaining route to that failure.

That distinction is currently invisible. `TerrainPanelSettingsSaved` proves a student reached the wind panel, since Create only exists there, but the complement does not decompose: a cancel from panel 2 (saw the wind panel, chose not to commit) and a cancel from panel 1 (never saw it) log identically. Reconstructing the panel from the surrounding `TerrainPanelNextButtonClicked` and `TerrainPanelPreviousButtonClicked` stream is possible and is exactly the kind of derived measure that goes wrong quietly.

The cost is one token. `currentPanel` is a `useState` in the same component and is already in `handleCancel`'s closure, so the handler becomes `log("TerrainPanelClosed", { reason: "cancel", changed, panel: currentPanel })`. No new state, no new read, and `currentPanel` is the absolute index (0, 1, 2) in both the master model and the activities, so it does not need `firstPanel` to be interpreted. It also makes the existing `changed` more useful, since "cancelled with work from the wind panel" and "cancelled with work from panel 1" are different findings.

Suggested resolution: add `panel` to the payload and to the `LOGGED-EVENTS.md` row in the docs step. If it is rejected, the reason belongs in requirements.md next to the resolved logging question, because "we chose not to measure the stated goal" is a decision someone will revisit.

---

## Self-Review: Round 2

**Round 2** (2026-08-23). Roles: QA Engineer, Education Researcher, Senior Engineer. Accessibility review is deliberately excluded (standing decision for this repo).

Every finding below was produced by building the plan as a throwaway spike on this branch (all four source files, the migrated test (d), all six new terrain-panel cases, all six new bottom-bar cases, and the bottom-bar lockout), running it, mutating it, and then reverting. The plan's headline numbers were re-measured first, against the plan as it stood at the start of this round, and they hold: full Jest suite **891 passed / 891** across 76 suites (baseline 879, so +12 net), `terrain-panel.test.tsx` at **22**, `bottom-bar.test.tsx` at **40**, `npx eslint` clean on all four touched source files, `npx tsc --noEmit` adding nothing beyond the two pre-existing `line-chart.tsx` errors, and the **full Cypress suite green at 27/27 in headless Chrome** against the spike's source changes, confirming the existing browser suite needs no repair. Every mutation named in the plan's terrain-panel table was run and behaves exactly as the plan says: `handleCancel` gaining `simulation.updateZones(zones)` fails (d), (i2), (j) and (m) and nothing else; panel 0's Cancel wired to `applyAndClose` fails (i) alone; panel 2's fails (m) alone. The browser measurements were re-taken against a real css-loader build and all match: Cancel 76 x 28, `rgba(0, 0, 0, 0)`, `1px solid rgb(121, 121, 121)`, radius 5px, Lato 700 14px `rgb(67, 67, 67)`; wind-panel footer at 354 / 438 / 522, group 244px, gaps 8 and 8, centered on the panel to 0.00px; panel backgrounds `rgb(223, 223, 223)` / `rgb(255, 216, 250)` / `rgb(203, 246, 215)`; the conditions panel's class attribute carrying no `undefined` token after the rider fix; the built stylesheet ordering `.cancelButton` after `.continueButton` at equal specificity, with `.continueButton:hover` outranking it. The findings are what survived that pass. The resolutions below were each re-measured after the fact and take the suite to 895; the Verification-status header at the top of this plan carries the delivered numbers.

### QA Engineer

#### RESOLVED: "Cancel is the leftmost control" is the story's most visible requirement and nothing can fail on it

**Decision**: Guarded in jsdom, folded into cases that already exist. A `footerLabels()` helper plus one assertion each in (i), (i2), (l) and (m) pins all four footer variants and adds no new case; the 8px gap rides on the Cypress case in `terrain-setup.cy.ts`, which is the only place it is observable. Re-measured on a full spike with the assertions in: 892/892 Jest, lint clean, and moving Cancel to last in all three footers fails exactly (i), (i2), (l) and (m) (4 failed / 18 passed), one per variant. Reverting the gap to 15px leaves all 22 cases in the file green, which is what puts it in Cypress rather than Jest.

Requirements: *"Cancel is the **leftmost** control in the footer, per the ticket's 'displayed to the left of other button' and per every panel on the artboard."* The plan implements it (*"The same element in all three, leftmost in the container"*, *"Panel 0's footer becomes Cancel then Next"*) and then guards it nowhere.

Mutation-tested on the spike, in the worst direction: moving Cancel to **last** in all three footers, so the wind panel reads `Previous, Create, Cancel`, leaves **22 of 22** `terrain-panel.test.tsx` cases green and **27 of 27** Cypress cases green. The plan's own new Cypress assertion cannot see it either: `getCancelButton()` resolves `[data-testid="terrain-cancel"]` wherever it sits, and `background-color` / `border-color` are position-blind.

This is not a cosmetic gap. The Teacher finding in requirements.md is entirely about where Cancel lands: 37.5px of Previous's old footprint becomes Cancel, and the wind panel puts a no-confirmation discard button 8px from Create. Order is the requirement that carries that risk, and it is the one requirement in the footer with no assertion behind it.

The gap is cheap to close, and jsdom is enough: DOM order is exactly what `getAllByRole` returns. One helper plus three assertions covers all three footers, and (i), (i2) and (m) already stand on the three panels needed.

```tsx
const footerLabels = () =>
  within(screen.getByTestId("terrain-cancel").closest("div")!)
    .getAllByRole("button").map(b => b.textContent);
// panel 0: ["Cancel", "Next"];  master-model panel 1: ["Cancel", "Previous", "Next"];
// wind: ["Cancel", "Previous", "Create"]
```

**The 8px gap has the same problem and the same fix.** `.continueButton+.continueButton` goes from 15px to 8px, which is an artboard value stated in Requirements, and reverting it would be invisible to every Jest case in the suite (identity-obj-proxy computes no styles) and to all 29 Cypress cases. The Cypress case the plan is already adding to `terrain-setup.cy.ts` can carry it at zero extra cost, since Cancel is leftmost and therefore the margin lands on its neighbor: `terrain.getNextButton().should("have.css", "margin-left", "8px")`.

---

#### RESOLVED: Two test counts in the plan body are stale, and both were invalidated by round 1's own additions

**Decision**: Both corrected against a fresh full-spike measurement. (j)'s mutation is 1 failed / 21 passed against the 22-case file, not 1 failed / 19 passed. `bottom-bar-visuals.cy.ts` holds 8 cases today and runs at 9 with the Setup-highlight case, so its mutation reads 8 passing / 1 failing, not 9 passing / 1 failing. The Verification-status header was re-measured at the same time and moved to 892 / 879 / +13 with the per-file breakdown spelled out, so the next stale number is easier to spot.

The plan states the mutation for (j) as *"Deleting `setZones` from the close-time reset effect is what (j) alone catches (1 failed, 19 passed)."* Measured on the spike with the plan built as written, it is **1 failed, 21 passed**. The file ends at 22 cases, which the plan states correctly two hundred lines later (*"Verified after the change: 22 passed in `terrain-panel.test.tsx`"*). The 19/20 numbers are from the pre-round-1 spike, before (i2) and (m) existed.

The same slip is in the Cypress numbers for the Setup-highlight case. The plan says it *"passes at 10/10"* and that the `disabled` mutation gives *"9 passing / 1 failing"*. `bottom-bar-visuals.cy.ts` holds **8** cases today (counted in the file and confirmed by the 27/27 run, which reports 8 for that spec), and this story adds one, so both numbers are 9, not 10. The 27 to 29 arithmetic elsewhere in the plan is right, which is what makes these two look measured when they are not.

Neither number changes a decision, but this repo's reviewers have caught stale counts on more than one PR, and a plan whose whole claim to authority is "every number here was measured on a spike" cannot afford two that were not re-measured after the spike changed.

---

#### RESOLVED: The decision to keep logging the no-op Setup click has no test, and the obvious cleanup silently reverses it

**Decision**: One case added to `log-events.test.tsx`, in the lockout step. Measured on the spike: it passes, it takes the file from 23 cases to 24 and the suite to 892, and adding `if (ui.showTerrainUI) return;` to `handleTerrain` fails it and only it (1 failed / 85 passed across `log-events`, `bottom-bar` and `terrain-panel`).

Round 1's Education Researcher finding chose option B: *"keep logging every click ... The reason to keep it is that a student poking a lit, inert button is evidence about whether the `selected` treatment reads as 'already open', which is exactly the part of the lockout no one has seen drawn."* The plan implements it and underlines it: *"No early return. A student poking the lit Setup button still logs."* `LOGGED-EVENTS.md` line 45 is rewritten to match, ending *"Not an open count: a click on the already-open button logs too."*

Nothing asserts it. `TerrainPanelButtonClicked` is emitted at `bottom-bar.tsx:391` and appears in no test anywhere in `src/` or `cypress/` (grepped). The new *"leaves the wizard open when Setup is clicked"* case asserts the state, not the log, and `bottom-bar.test.tsx` has no log mock.

Mutation-tested on the spike: adding `if (ui.showTerrainUI) return;` to `handleTerrain`, which is precisely the "simplify the inert handler" edit a later reader makes, leaves **all 62 cases** in `bottom-bar.test.tsx` and `terrain-panel.test.tsx` green. The signal the decision exists to preserve disappears, and the docs line becomes false, with nothing red.

`log-events.test.tsx` is the right home and already has everything: the log mock, and a `BottomBar` render harness. A throwaway version was built and run on the spike; it passes as written and fails under the early-return mutation:

```tsx
it("logs on every Setup click, including the no-op click while the wizard is open", async () => {
  render(<Provider stores={stores}><BottomBar /></Provider>);
  await userEvent.click(screen.getByTestId("terrain-button"));
  await userEvent.click(screen.getByTestId("terrain-button"));
  const calls = mockLog.mock.calls.filter((c: unknown[]) => c[0] === "TerrainPanelButtonClicked");
  expect(calls).toHaveLength(2);
  expect(stores.ui.showTerrainUI).toBe(true);
});
```

This does not reopen the resolved question about where the **Cancel** payload tests live. That answer turned on `log-events.test.tsx` having no `TerrainPanel` harness; it already has a `BottomBar` one.

---

### Education Researcher

#### RESOLVED: `panel` records the panel they left from, which is not "did they reach the wind panel"

**Decision**: B. Keep `panel`, add `reachedWind: boolean`, and stop claiming `panel` measures reach. The plan's Cancel step carries the three-line `maxPanelRef` high-water mark (initialised to `firstPanel`, raised in `showNextPanel`, reset beside `setCurrentPanel(firstPanel)` in the close-time reset effect), the reasoning for why the log stream cannot supply it, and (n), (o), (p) in the test step. Round 1 added `panel` specifically to measure Trudi's rationale, so this is finishing that argument rather than new scope.

Measured on a full spike: the whole Jest suite green (895/895 on the pre-WM-46 base) with `terrain-panel.test.tsx` at 25, lint clean, and every mutation caught by a distinct case. Hardcoding `reachedWind: true` fails (i), (k), (l), (p); hardcoding `false` fails (m), (n), (o), (p); collapsing it to `currentPanel === WIND_PANEL` fails (n) and (o); resetting the ref in the zone-tile effect fails (o) alone; dropping the reset in the close-time reset effect fails (p) alone.

The plan justifies the third payload field on a measure it cannot deliver: *"`panel` says whether they ever reached the wind panel, which is the reason Trudi gave for the design and the thing the bar lockout exists to deliver."* The field records `panelNames[currentPanel]` at the moment of Cancel, which is where the student **was**, not where they have **been**.

Two live paths separate the two, and one of them is a path the requirements deliberately keep open:

- **Previous.** A student on the wind panel who clicks Previous and then Cancel logs `panel: "conditions"`, having seen the wind panel.
- **The zone info tiles.** Requirements keep them live while the wizard is open, and `terrain-panel.tsx:53-57` forces `setCurrentPanel(1)` whenever `ui.terrainUISelectedZone` is written. Reproduced live on the spike (`?preset=plainsTwoZone`): with the wizard on the wind panel, one click on a zone tile put it back on the conditions panel, footer `Cancel, Next`, step icon "1". A Cancel from there logs `"conditions"`. Requirements already flag this jump as *"the opposite of the story's stated purpose"* and send it to Trudi and Michael; the plan does not notice that it also biases the field it is adding.

So `panel` under-reports wind-panel reach, and it under-reports it exactly on the students who wandered, which is the population the story is about. The `LOGGED-EVENTS.md` row the plan writes is already honest (*"the panel they left from, not the step number shown on screen"*); it is the plan's rationale, and the requirements bullet it came from, that overclaim.

**The derived-measure fallback does not close the gap either.** `TerrainPanelNextButtonClicked` and `TerrainPanelPreviousButtonClicked` both log with **no payload** (`terrain-panel.tsx:142`, `:147`), so a replayer has to know `firstPanel` (a config fact that reaches the log only inside `SimulationStarted`, which a student who abandons Setup may never fire) and then replay the whole navigation sequence. And the zone-tile jump moves `currentPanel` with no Next or Previous event at all: it emits `ZoneButtonClicked` from a different component, and turning that into a panel reset requires knowing a cross-component coupling nothing documents. Verified with a throwaway case on the spike: after one Next and one tile click, the navigation stream reads as a single `TerrainPanelNextButtonClicked` with no Previous, so a naive replay concludes the student ended on the wind panel when they ended on the conditions panel.

**A high-water mark is three lines and fully testable.** Built and mutation-tested on the spike: a `maxPanelRef` initialised to `firstPanel`, raised in `showNextPanel`, and reset beside `setCurrentPanel(firstPanel)` in the close-time reset effect. Five throwaway cases all passed: cancel without reaching wind logs `false`; reach wind then Previous logs `panel: "conditions", reachedWind: true`; reach wind then a tile jump logs the same; and reopening after a cancel resets the flag. Both mutations are caught: dropping the reset line fails the reopen case, and hardcoding `reachedWind: true` fails two.

Three ways out:

- **A. Keep `panel`, fix the claim.** It is still the right field for "where did they bail from", and this costs one prose edit here and one in requirements.md. Reach stays unmeasured, and the reconstruction above is the thing the plan itself calls *"exactly the kind of derived measure that goes wrong quietly."*
- **B. Keep `panel`, add `reachedWind: boolean`.** Three source lines plus three cases (~40 lines). `panel` answers "where did they bail", `reachedWind` answers Trudi's question directly. Fourth field on the payload.
- **C. Replace `panel` with `reachedWind`.** Same field count as the plan has today, but it throws away the "where did they bail from" signal, which is the half that says whether the lockout changed anything about *where* students give up.

---
