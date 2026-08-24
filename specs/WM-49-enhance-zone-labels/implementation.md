# Implementation Plan: Hazbot: Enhance Zone Labels

**Jira**: https://concord-consortium.atlassian.net/browse/WM-49
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Ordering principle

Every step leaves the suite green. That is what decides the split rather than the file
boundaries: the markup rewrite and the interaction removal both delete tests, and the three
tests that go die for two different reasons, so each removal travels in the commit that
breaks it.

The **remove** step comes before the **rebuild** step. Removing the click, the lock and the
orphaned store field first means the layout work starts from a component with one job, and
it keeps the largest diff (the layout) free of unrelated deletions.

## Implementation Plan

### Give the vegetation label a display spelling and an abbreviation

**Summary**: `vegetationLabels` is wire format: logged in `SimulationStarted` and `ZoneUpdated`,
and matched against by the Hazbot engine, so its `"Forest With Suppression"` cannot move. Two
display sites already work around that with the same copy-pasted `.replace`, and this story adds
a third form. Model it on the `terrainLabels` / `terrainDisplayLabels` pair that already exists
directly above in the same file.

**Files affected**:
- `src/types.ts`: two new maps after `vegetationLabels`
- `src/components/vegetation-selector.tsx`: use the display map, drop the `.replace`
- `src/components/terrain-summary.tsx`: use the display map, derive the non-breaking space
- `src/components/terrain-panel.test.tsx`: two assertions pinning the display spelling

Each of those two components reads `vegetationLabels` at exactly one site, so in both the
import swaps to `vegetationDisplayLabels` rather than gaining one, and `vegetationLabels`
is left with no display-side reader at all.

**Estimated diff size**: ~65 lines

In `src/types.ts`, after `vegetationLabels`:

```ts
// DISPLAY labels. Rendered text only, safe to change. ForestWithSuppression reads
// with a lowercase "with" on screen while still logging and matching as
// "Forest With Suppression".
export const vegetationDisplayLabels: Record<Vegetation, string> = {
  ...vegetationLabels,
  [Vegetation.ForestWithSuppression]: "Forest with Suppression",
};

// ABBREVIATED display labels, for surfaces too narrow for the full spelling. The
// map's own name is the contract: only ForestWithSuppression differs. The
// non-breaking space is load-bearing: in a 48px box "Forest w" (47.2px) still
// fits one line, so a plain space wraps this as "Forest w" / "Suppr." instead
// of "Forest" / "w Suppr.".
export const vegetationAbbreviatedLabels: Record<Vegetation, string> = {
  ...vegetationDisplayLabels,
  [Vegetation.ForestWithSuppression]: "Forest w\u00A0Suppr.",
};
```

**The spread-and-override form is load-bearing, not stylistic.** `vegetation-selector.tsx`
selects options with `Object.values(...).slice(1)`, `.slice(1, 3)` and `.slice(0, 3)`, so key
order decides which vegetation a zone offers. `Vegetation` is 0 to 3, so the Record's keys are
integer-like and JavaScript enumerates them in ascending numeric order regardless of insertion
order. Verified: `Object.values` on the overridden map returns Grass, Shrub, Forest,
ForestWithSuppression. Any future non-numeric key would break that guarantee silently.

In `vegetation-selector.tsx`, the whole `.replace` and its three-line comment go:

```ts
// before
const labelsArray = Object.values(vegetationLabels).map((l) => l.replace("With Suppression", "with Suppression"));
// after
const labelsArray = Object.values(vegetationDisplayLabels);
```

In `terrain-summary.tsx`, the whole ternary collapses to one expression:

```tsx
// before
const vegetationCaption = isForestWithSuppression
  ? "Forest with Suppression"
  : vegetationLabels[vegetationType].replace("With Suppression", "with Suppression");
// after
const vegetationCaption = vegetationDisplayLabels[vegetationType].replace(" ", "\u00A0");
```

**The branch is redundant once the display map exists.** `Grass`, `Shrub` and `Forest` contain no
space, so replacing the first space is identity on every value except `Forest with Suppression`,
and both arms would compute the same string for three of the four cases.
`isForestWithSuppression` is still needed for `css.fwsCaption` and `shiftColumnLeft`, so nothing
else moves. That also clears a second dead branch in the same line: the else arm's `.replace` was
unreachable for the case it named, since the ternary had already caught `ForestWithSuppression`,
so it only ever ran on the three labels where it is a no-op.

**The non-breaking space is written as `\u00A0` rather than typed.** The file holds a literal one
inside the quoted string today. Moved into a `.replace`, the two arguments render identically in
most editors and diffs, so the one line whose whole purpose is the difference between two
invisible characters becomes unreviewable. The escape keeps the diff legible.

The existing comment explaining the non-breaking space stays as it is. It is accurate: the
`\u00A0` glues `Forest` to `with`, leaving the space before `Suppression` as the only place a
break can happen, which is what it says.

**This step needs the coverage it does not have.** Nothing in `src/` asserts the display spelling
today: there is no `vegetation-selector.test.tsx` or `terrain-summary.test.tsx`, so deleting both
`.replace` call sites and re-pointing them at a new map currently turns nothing red. The two call
sites are reachable from `terrain-panel.test.tsx` on different panels, each with its own
precondition, both confirmed in a throwaway run:

| Call site | Panel | Precondition |
|---|---|---|
| `VegetationSelector` slider marks | conditions (1) | the zone's terrain is **Mountains** and `forestWithSuppressionAvailable`, since non-Mountains zones take `slice(0, 3)` and never offer it |
| `TerrainSummary` caption | wind (2) | a zone whose vegetation **is** `ForestWithSuppression` |

`describe("vegetation selector")` already supplies both. Its `beforeEach` sets `defaultThreeZones`
(zone 0 Mountains, zone 2 `ForestWithSuppression`), `zonesCount = 3` and `showTerrainUI = true`,
and renders straight onto the conditions panel, so the slider assertion is a three-line addition
and the caption assertion is one `Next` click further.

```tsx
it("offers the full 'Forest with Suppression' spelling on the vegetation slider", () => {
  // Mountains zone, so the slider includes the option at all. Fails if the
  // abbreviation reaches this call site, and if the display map regresses to
  // the wire spelling "Forest With Suppression".
});

it("captions the wind panel's zone summary with the full spelling", async () => {
  // One Next from the conditions panel. Fails on the same two mutations at the
  // other call site. Query with getByText rather than an exact textContent
  // comparison: the caption's non-breaking space is collapsed by
  // testing-library's default normalizer but not by string equality.
});
```

---

### Make the zone labels non-interactive and delete what that orphans

**Summary**: The labels become displays. `simulation-info.tsx:38` is the only writer of
`ui.terrainUISelectedZone` to a real value, so removing the click orphans the field, the effect
that consumes it, and that effect's `|| 0` fallback. Three tests cover the removed behavior and
are deleted here, in the commit that breaks them, so the suite never goes red.

**Files affected**:
- `src/components/simulation-info.tsx`: `showTerrainPanel`, its `log` call, the `onClick` and `locked` props, `LockIcon`
- `src/components/simulation-info.scss`: `.lockIcon`, `.active:hover`, `.active:active`, `.zone`'s `position: relative`
- `src/models/ui.ts`: `terrainUISelectedZone`
- `src/components/terrain-panel.tsx`: the consuming `useEffect`, the `|| 0` fallback
- `src/components/simulation-info.test.tsx`: delete two tests
- `src/components/terrain-panel.test.tsx`: delete test (o)

**Estimated diff size**: ~90 lines, nearly all deletions

`ZoneInfo` loses `locked` and `onClick` from its props and its body; the `LockIcon` import and
the `{ locked && ... }` element go with them, as does `${locked ? "" : css.active}` from the
className. `.zone`'s `position: relative` goes too: it is the containing block for
`.lockIcon`'s absolute positioning and has no other reader. Its `z-index: 2` stays, and does not
depend on it, since z-index applies to a flex item whether or not it is positioned. Verified
live: with `position: static; z-index: 2` the label still paints over the 3D canvas, and with
the z-index dropped the canvas paints over the label. `SimulationInfo` loses `showTerrainPanel` entirely, including
`log("ZoneButtonClicked", { zone: zoneIdx })`, and `uiDisabled` becomes unused and goes too.
`ui` may then be unused in `useStores()`; check before removing it from the destructure.

In `terrain-panel.tsx`, the `useEffect` at 52-62 and the `|| 0` at 44 both go:

```tsx
// before
const [selectedZone, setSelectedZone] = useState<number>(ui.terrainUISelectedZone || 0);
// after
const [selectedZone, setSelectedZone] = useState<number>(0);
```

**Verified, not assumed**: removing exactly these two makes `terrain-panel.test.tsx` run
**1 failed, 24 passed**, and the failure is test (o) at
`expect(screen.queryByTestId("terrain-wind")).not.toBeInTheDocument()`, line 509. Nothing else
in the suite notices. Test (o) is deleted and no coverage goes with it: test (n) already pins
`panel: "conditions"` with `reachedWind: true` through the Previous route, which becomes the
only route.

From `simulation-info.test.tsx`, delete *"opens terrain panel UI when one of the zone buttons
is clicked"* and *"locks zone buttons when simulation is started"*. Both assert behavior that
no longer exists. *"renders zone info buttons"* and the wind-reading test survive untouched.

Deleting three tests is the expected outcome, not a coverage regression. Replacement coverage
for the new content lands in the next step, where the content does.

---

### Re-lay out the label at 170 x 60 with named conditions

**Summary**: The largest step and the only visual one. Two rows: a centered title line, then the
vegetation and drought icon-and-name pairs side by side. Also fixes an existing defect in the
same element.

**Files affected**:
- `src/components/simulation-info.tsx`: `ZoneInfo` markup
- `src/components/simulation-info.scss`: the `.zone` block
- `src/components/simulation-info.test.tsx`: content coverage

**Estimated diff size**: ~200 lines

```tsx
export const ZoneInfo = ({ zone, idx }: { zone: Zone; idx: number }) => (
  <div data-testid="zone-info" className={`${css.zone} ${zoneCssClasses[idx]}`}>
    <div className={css.titleRow}>
      <span className={css.zoneName}>Zone {idx + 1}</span>
      <span className={css.bullet}>&middot;</span>
      <span className={css.terrain}>{terrainDisplayLabels[zone.terrainType]}</span>
    </div>
    <div className={css.conditionsRow}>
      <div className={css.icon}>{vegetationIcons[zone.vegetation]}</div>
      <div className={css.name} data-testid="zone-vegetation-name">
        {vegetationAbbreviatedLabels[zone.vegetation]}
      </div>
      <div className={`${css.icon} ${css.droughtIcon}`}>{droughtIcons[zone.droughtLevel]}</div>
      <div className={`${css.name} ${css.droughtName}`} data-testid="zone-drought-name">
        {droughtLabels[zone.droughtLevel]}
      </div>
    </div>
  </div>
);
```

`${css.icon} ${css.vegetationIcon}` becomes `${css.icon}`. `css.vegetationIcon` has no
definition in the SCSS, which today renders the literal class attribute
`"simulation-info--icon--__wildfire-v1__ undefined"`. Confirmed in the live DOM; the SCSS
defines only `.icon` and `.icon.droughtIcon`.

The SCSS, with the board's rel coordinates as the source of every number:

```scss
.zone {
  box-sizing: border-box;   // .zone is content-box today; 170 x 60 is a BORDER box
  width: 170px;
  height: 60px;
  flex-shrink: 0;           // holds the full 170 when the row is crowded
  border: solid 1px #ffffff;
  border-radius: 4px;
  padding: 4px 7px 7px;     // board rel coords are outside the border: 1 + 4 = the title's y5
  display: flex;
  flex-direction: column;
  // margin-left/right: auto are kept: they distribute the slack, and the
  // container's gap is what they cannot give back.
  margin: 10px auto;
  z-index: 2;               // the label sits over the 3D canvas, which paints on top without this

  .titleRow {
    display: flex;
    justify-content: center;  // centered as a unit, so the center moves with the terrain type
    align-items: baseline;
    gap: 5px;                 // the board's gap; only row 2 is budget-constrained down to 4
    height: 17px;
    color: $controlText;
    .zoneName { font-family: Lato; font-weight: bold; font-size: 14px; }
    .bullet   { font-family: Lato; font-weight: bold; font-size: 14px; }
    .terrain  { font-family: 'Roboto Condensed'; font-weight: normal; font-size: 14px; }
  }

  .conditionsRow {
    display: flex;
    align-items: flex-start;
    gap: 4px;                 // 1 + 7 + 28 + 4 + 48 + 4 + 20 + 4 + 45 + 7 + 1 = 169 of 170,
                              // so the row fits the 170 box with the icons at their intrinsic size
    margin-top: 2px;
    .icon {
      flex-shrink: 0;              // same guard as .name below
      width: 28px; height: 28px;   // asset's intrinsic size; the 1.5px stroke stays 1.5px
      // Vegetation SVGs ship both a gray (.dark-outline) and a white
      // (.white-outline) rect; use only the white one here.
      svg rect:global(.dark-outline) { display: none; }
      &.droughtIcon { width: 20px; }
    }
    .name {
      flex-shrink: 0;         // guard: row 2 has 1px of slack, and losing it wraps
                              // "w Suppr." to a third line rather than clipping visibly
      width: 48px;            // the board's box; holds "w Suppr." (47.27px) on one line
      height: 28px;
      font-family: 'Roboto Condensed';
      font-size: 14px;
      line-height: 14px;
      color: $controlText;
      // A fixed two-line band. One-line names center in it rather than sitting
      // at the top; two-line names fill it and are unaffected.
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .droughtName { width: 45px; }  // the board's Drought Index box, 45 x 28 in all four rows
  }
}
```

And the other half of the floor, added to the existing `.simulationInfo` block rather than a
second one, beside the `display: flex` it belongs with:

```scss
.simulationInfo {
  // ... existing declarations
  gap: 10px;
}
```

The fixed-position `.windContainer` is a child of that block and is unaffected: an out-of-flow
child is not a flex item. Verified live, it holds `left: 10` with the gap applied.

**Why `gap` plus `flex-shrink` and not a margin.** `.zone` carries `margin-left/right: auto`,
which is what centers the row and distributes slack. Auto margins collapse to zero once the
slack runs out, so on their own they let the labels abut. `gap` is the floor they cannot give
back, and `flex-shrink: 0` stops the labels themselves absorbing the deficit instead. Measured
live on the running app: at 1241 x 529 the gap lands at 76 with 10px of clearance from the key
area, and at 950 x 880 it holds at exactly 10 where with neither the labels land at 169 and the
gap collapses to 0.

**The padding is 7 rather than 8.** The board's rel coordinates are measured from the group's
outer edge, which includes the 1px border, so an 8px CSS padding overflows the row by 1: at the
icon's intrinsic 28 the arithmetic that closes is
`1 + 7 + 28 + 4 + 48 + 4 + 20 + 4 + 45 + 7 + 1`, leaving 1px of slack inside the 170. Measured on
the built row: the content box is 154 and row 2 uses 153, so the leftover pixel lands on the right
and the insets read 8 left, 9 right against the board's 8 and 8.

**Row 2's `flex-shrink: 0` is a guard, not something the shipped numbers exercise.** With 153 of
content in a 154px box, and `.zone` holding a full 170 at every width, there is no deficit for the
four children to absorb. Toggled live at 950 x 880 and again at 500 x 880, where the container is
only 135px wide: the boxes hold 28 / 48 / 20 / 45 either way. It is kept because the failure it
prevents is a bad one to hit silently. At `gap: 5px` and the same padding, the vegetation box
lands at 46.39 and `Forest w Suppr.` goes to **three lines**, a scrollHeight of 36 against the 28px
band, rather than clipping somewhere visible. One pixel of budget is what stands between the two,
so the declaration stays and the comment says what it guards rather than claiming a shrink the
shipped numbers cannot produce.

**Closing the 1px with gaps of 4 / 5 / 4 was measured and rejected.** Giving the middle gap the
board's 5 (via `margin-left` on `.name` and `.droughtIcon` rather than a row `gap`) does exactly
what it promises: label still 170 x 60, boxes still 28 / 48 / 20 / 45, insets 8 and 8, abbreviation
still 34.84 / 47.27. What it also does is raise `.zone`'s min-content from 169 to 170, and that is
the number the Cypress case's width assertion depends on. Measured under 4 / 5 / 4, deleting
`.zone`'s `flex-shrink: 0` changes nothing at all: the label stays 170 and the gap stays 10. So the
symmetric inset costs the only symptom that makes `width === 170` a real assertion rather than one
that passes under every mutation, and 1px of asymmetry is the cheaper thing to give up.

**Row 2's fixed boxes are also what make the label's own width nearly incompressible**, and that
is what the Cypress case's width assertion rests on. Those four boxes give `.zone` a min-content
width of 169 (153 + 14 padding + 2 border), and a flex item's default `min-width: auto` will not go
below it. So at 950 x 880 with three zones and the graph open,
deleting `flex-shrink: 0` from `.zone` costs 1px of width and nothing else: the labels land at 169
and the gap still holds at 10. Only deleting the container's `gap` collapses the gap. See the
Cypress step, where both mutations have to be caught.

**Both name widths are the board's own boxes, and the text measurements confirm them.** The
board draws a 48 x 28 `Vegetation Type` group and a 45 x 28 `Drought Index` group in every one of
its twelve labels; what varies inside them is the text bound, which is why `Grass` reports 32 and
`Severe Drought` 44. Measured in the app's own loaded Roboto Condensed at 14/400, `"Medium"` is
44.61px, so 45 is independently the smallest whole pixel that holds the longest drought word, and
44 would wrap it to a third line that does not fit in 60px. `"w Suppr."` is 47.27px against the
48px vegetation box, and `"Forest with Suppression"` is 132.81px, which is why the board
abbreviates rather than shrinking. Those widths reproduce three of the four
drawn forms on their own: `Grass` (31.75), `Shrub` (31.97) and `Forest` (34.84) stay on one line
inside 48, and every drought name breaks after its first word inside 45 because `Drought` alone is
43.73px.

**The abbreviation is the one that needs help, and a width cannot give it.** Line filling is
greedy, and `"Forest w"` is 47.16px, which fits the 48px box, so a plain space wraps it as
`Forest w` / `Suppr.` rather than the board's `Forest` / `w Suppr.`. No width fixes that: anything
under 47.16 is also under the 47.27 that `w Suppr.` needs and sends it to a third line that
overflows the 28px band. Neither does CSS; `text-wrap: balance` and `text-wrap: pretty` were both
built into the live row and left it at 47.16 / 34.95. The non-breaking space in
`vegetationAbbreviatedLabels` is what makes `w Suppr.` unbreakable so it moves as a unit. Verified
live: 34.84 / 47.27, `scrollWidth` 48, still two lines.

**The icon needs no outline added.** All four vegetation SVGs already ship a `.white-outline`
rect, 26.5 x 26.5 at (0.75, 0.75) stroked 1.5px in a 28 x 28 box, and the existing
`.dark-outline { display: none }` rule already selects it. Rendering at the intrinsic 28 keeps
the stroke at exactly 1.5px; the board's "26 x 26" is its measurement of the rect inside.

New Jest coverage, replacing what the previous step deleted:

```tsx
it("names the vegetation and drought level on every zone label", () => {
  // One assertion per zone against the store's own vegetation and drought
  // values, so it fails if either name goes missing or is read off the wrong
  // zone. Assert the zone count first: the default stores give three zones,
  // and a per-zone loop over an empty list asserts nothing.
});

it("abbreviates Forest with Suppression on the map label", () => {
  // The default createStores() zones are Forest / Shrub / Grass, so this one
  // has to set ForestWithSuppression on a zone itself. Fails if the label
  // reaches for vegetationDisplayLabels instead of the abbreviated map.
  //
  // Query with getByText, not an exact textContent comparison: the label's
  // non-breaking space means textContent !== "Forest w Suppr." with a plain
  // space, while testing-library's default normalizer collapses it and matches.
  // Verified in a throwaway suite.
});
```

The other half of the "map label only" claim, that Setup keeps the full spelling, lives with the
step that changes Setup: see the two `terrain-panel.test.tsx` assertions in the display-label step.
`SimulationInfo` renders neither Setup component, so it cannot make that assertion here. Confirmed
in a throwaway run: with a `ForestWithSuppression` zone, `SimulationInfo` alone yields zero matches
for `/Forest with Suppression/`.

**Final pixel alignment is confirmed in the browser against the board, not asserted from these
numbers.** jsdom does no layout, so the SCSS above is the plan and the Playwright pass is where
it is checked.

---

### Guard the box and the floor in Cypress

**Summary**: jsdom does no layout, so 170 x 60 and the 10px floor are guarded here or nowhere. They
go in a new spec rather than into `key-area-visuals.cy.ts`, whose header scopes it to the fixed left
edge and whose two describes share one `plainsTwoZone` `beforeEach` that the floor case cannot use.

**Files affected**:
- `cypress/e2e/zone-label-visuals.cy.ts`: new file, two cases

**Estimated diff size**: ~60 lines

The box case runs at the default viewport, since the size is unconditional once shrinking is
off. The floor case **must name its conditions or it cannot fail**: `cypress.config.ts` runs at
1400 x 1000, where the gap is 118.4 with the floor and 115.1 without, so a `gap >= 10`
assertion there passes either way. The collapse only exists below about 993px of viewport width
with three zones and the graph open, where the row's width crosses 530. So:

```ts
it("holds a 10px floor between three zone labels when the graph crowds them", () => {
  cy.viewport(950, 880);           // below the ~993px collapse threshold
  cy.visit("/?preset=hillThreeZone");
  cy.window().its("sim.dataReady").should("eq", true);
  cy.get('[data-testid="right-panel-tab"]').click();   // open the graph
  // Both halves of the floor, at the one width where either can give:
  // gap === 10 exactly, and each label still measures a full 170.
});
```

**The preset has to be one that exists.** `getResolvedConfig` resolves it as
`presets[urlConfig.preset || base.preset]`, so an unknown name yields `undefined` and
`Object.assign` skips the preset layer entirely, leaving the base config: three zones, but all
Plains and with `zonesCount` unpinned. `hillThreeZone` is a real three-zone preset. The
`cy.window().its("sim.dataReady")` wait is what `key-area-visuals.cy.ts` and
`bottom-bar-visuals.cy.ts` both do before reading geometry, and this case reads geometry off a
page that mounts a WebGL canvas, at a viewport nothing else in the suite uses.

**The narrow case has to assert the width as well as the gap, or half the floor is unguarded.**
The two declarations fail differently, measured at 950 x 880 with three zones and the graph
open:

| Mutation | Width | Gap |
|---|---|---|
| Neither declaration | 169 | 0 |
| Container `gap` deleted | 170 | **0** |
| `.zone` `flex-shrink: 0` deleted | **169** | 10 |
| Both present | 170 | 10 |

Deleting the `gap` is what a `gap >= 10` assertion catches. Deleting `flex-shrink: 0` leaves the
gap at 10, because row 2's own non-shrinking boxes floor the label at a 169px min-content width,
so the only symptom is 1px of lost width, and the box case that would see it runs at the default
viewport where 170 holds either way. Asserting `width === 170` inside this case is what closes
that hole.

`bottom-bar-visuals.cy.ts:136-139` already re-visits with its own `cy.viewport(1241, 529)` inside a
describe, so the pattern exists, and `<region>-visuals.cy.ts` is the naming convention two files
already follow. `ModelInfo.js:9` reaches into `.simulation-info--zoneName--__wildfire-v1__`, which
this change keeps.

---

### Update the documentation the change invalidates

**Summary**: `ZoneButtonClicked` has no call site left and no in-app consumer, so it silently
stops firing. A second entry describes a route that no longer exists.

**Files affected**:
- `LOGGED-EVENTS.md`: remove one row, amend one description, add one note

**Estimated diff size**: ~25 lines

Remove the `ZoneButtonClicked` row from the Terrain & Settings table. Amend the
`TerrainPanelClosed` description, which currently tells a researcher that *"Previous and a
zone-info-tile click both walk a student back off"* the wind panel: Previous becomes the only
such route, and `panel: "conditions"` with `reachedWind: true` stays a normal reading for that
reason alone.

Add a discontinuity note under Terrain & Settings, following the four that already exist under
Hazbot. **It anchors on the deploy date, not a version.** The existing four use
`appRulesVersion`, which is a Hazbot counter that does not apply here, and no other payload
field distinguishes the two sides: `src/log.ts` forwards `(name, data)` and adds nothing, and
the only version-like fields sit on `AnalysisEngineActivated`, which fires only on
Hazbot-enabled pages while `ZoneButtonClicked` fired on every page. The note says outright that
there is no in-payload discriminator, so the boundary has to be read from timestamps. Fill the
date and release tag in at release rather than guessing now.

## Open Questions

<!-- Implementation-focused questions only. Requirements questions go in requirements.md. -->

### RESOLVED: Does the vegetation icon render at 28 or at the board's 26?

**Context**: The board labels the icon `26 x 26` with a `1.5px` white outline. **That is a real
scale of the whole component, not a reading of the asset's inner rect**, which is what this
question originally assumed. The board draws these icons twice: in its exportable library each
`White Outline` is reported at **28 x 28 · border 1.5px**, matching the asset exactly, since a
26.5 x 26.5 rect at (0.75, 0.75) stroked 1.5px centered has outer bounds of precisely 28. Inside
every `Zone Label Enhanced` the same component is reported at 26 x 26 all the way down: the group,
its white `Back` fill and its `White Outline`. So the two numbers genuinely cannot both be honored,
and row 2's board arithmetic closes exactly at 26 and only at 26.

**Options considered**:
- A) Render at the intrinsic 28 x 28. The stroke stays exactly 1.5px; the icon is 2px wider than the board and row 2's gaps absorb it.
- B) Scale to 26 x 26. Matches the board's number and its row-2 arithmetic exactly; the stroke thins to 1.39px.
- C) Ask Michael which of the two numbers he meant.

**Decision**: **A**, Doug, 2026-08-28. Render at the intrinsic 28 and take the 2px out of row 2's
gaps, 5 to 4.

The deciding argument is mechanical rather than aesthetic. These SVGs carry hard `width="28"
height="28"` attributes, so a 26px parent box does not scale them, it only lets them bleed: verified
live, and it is what `terrain-summary.scss:30` is unknowingly doing today with its `.icon { width:
26px }`. Reaching a true 26 therefore means an explicit `svg { width: 26px; height: 26px }` rule that
exists at no other icon site in the repo, and it would make this label the only place the outline
stroke is not 1.5px. Both variants were built in the running page and measured: each fits 170 and
holds the names at 48/45 with two-line wraps, and at 1:1 they are indistinguishable. Michael gets the
2px as an FYI rather than as a question.

---

### RESOLVED: What shape does the abbreviation take?

**Context**: `requirements.md` deliberately left this open: *"Whether that is a second map, a
field on one map, or a per-surface override is an implementation choice, but it must not be a
fourth open-coded string, and the zone label must not be the only place the abbreviation exists
if any other surface ever wants it."* The plan above assumes a second map,
`vegetationAbbreviatedLabels`, spread from `vegetationDisplayLabels`.

**Options considered**:
- A) A second map, `vegetationAbbreviatedLabels`, spread from the display map so only the differing entry is written twice.
- B) One map of records, e.g. `{ full, abbreviated }` per vegetation, so a surface picks a field.
- C) A single `abbreviateVegetation(label)` helper the zone label calls.

**Decision**: **A**, Doug, 2026-08-28. A second map, spread from the display map.

It reproduces the `terrainLabels` / `terrainDisplayLabels` pair that already sits ten lines above it
in the same file, comment structure included, which is the strongest argument available: a reader who
has understood one has understood the other. B changes the shape of a map five components read from,
for one surface's benefit; C hides the abbreviation inside a function body, where the next surface
that wants it cannot find it. The ordering guarantee the plan leans on is verified rather than
assumed: with integer-like keys, spread-and-override preserves ascending numeric order, so
`Object.values(...).slice(1)` and `.slice(0, 3)` in `vegetation-selector.tsx` keep selecting the same
vegetations.

---

### RESOLVED: Where do the two Cypress cases live?

**Context**: `requirements.md` names `key-area-visuals.cy.ts` as the natural home because it is
the existing geometry guard for this region and already pins `KEY_AREA_LEFT` and
`KEY_AREA_WIDTH`. But the zone labels are not in the key area: they sit above the model, and one
of the two cases has to change the viewport and open the graph, which no case in that file does.

**Options considered**:
- A) Extend `key-area-visuals.cy.ts`, reusing its `rect()` helper and constants.
- B) A new `zone-label-visuals.cy.ts`, following the `bottom-bar-visuals.cy.ts` precedent for a per-region spec that sets its own viewport.
- C) Split them: the box case into `key-area-visuals.cy.ts`, the floor case into its own spec.

**Decision**: **B**, Doug, 2026-08-28. A new `cypress/e2e/zone-label-visuals.cy.ts`.

`key-area-visuals.cy.ts` reads as the natural home only until you open it. Its header scopes the file
to *"the fixed key area down the left edge"*, and both of its describes share a `beforeEach` on
`plainsTwoZone`, which the floor case cannot use: that case needs three zones, its own viewport and
the graph open. Extending it would mean a third describe with none of the file's constants and a
header that no longer describes its contents. `<region>-visuals.cy.ts` is already the convention two
files follow, and `bottom-bar-visuals.cy.ts:136-139` is the precedent for a case that re-visits with
its own viewport. This supersedes `requirements.md`'s naming of the key-area file, which is corrected
there.

---

### RESOLVED: Is remove-then-rebuild the right commit split?

**Context**: The plan removes the interactivity first (deleting three tests in the commit that
breaks them), then re-lays out the label. That keeps every commit green and keeps the layout
diff clean, at the cost of one commit where the label is non-interactive but still looks like
the old 142 x 46 design. A reviewer reading commit by commit sees an intermediate state that
never ships.

**Options considered**:
- A) Keep the split as planned: remove, then rebuild.
- B) One combined commit for the whole label change, larger but with no intermediate state.
- C) Rebuild first, then remove the interactivity, accepting a red suite on the middle commit.

**Decision**: **A**, Doug, 2026-08-28. Keep the split: remove, then rebuild.

Every commit stays green, each of the three deleted tests travels in the commit that breaks it, and
the layout diff stays free of unrelated deletions. The intermediate state a reviewer sees is a label
that is already non-interactive but not yet re-laid out, which is coherent to read even though it
never ships. C is the only option that puts a red commit in the history, and B's single large diff
mixes a 90-line deletion into a 200-line visual rewrite.

## Self-Review

Roles: Design Fidelity Reviewer, Senior Engineer, QA Engineer. Accessibility is out of scope in
this repo. Every issue below was reproduced before being written down: the layout ones by building
the plan's exact SCSS and markup into the running app at `?preset=hillThreeZone`, 950 x 880, graph
open, and mutating one declaration at a time; the code ones by applying the plan's deletions and
running the suites. The measurements that back each one are quoted inline.

### Design Fidelity Reviewer

#### RESOLVED: DF1. At 48px the abbreviation wraps as `Forest w` / `Suppr.`, not the board's `Forest` / `w Suppr.`

The plan rests twice on the claim that the two name widths make ordinary wrapping reproduce every
drawn form with no hand-placed break: *"at 48px `Forest w Suppr.` breaks after `Forest` and `Forest`
alone stays on one line"*. Built and measured in the app's own loaded Roboto Condensed at 14/400, it
does not. Line filling is greedy, and `"Forest w"` is **47.16px**, which fits the 48px box, so `w`
stays on line 1:

| | Line 1 | Line 2 |
|---|---|---|
| Plan as written (plain space) | `Forest w` (47.16) | `Suppr.` (34.95) |
| Board | `Forest` (34.84) | `w Suppr.` (47.27) |

The spec checked that line 2 fits (*"`w Suppr.` is 47.3px against the 48px vegetation box, with 0.7px
to spare"*) but not that line 1 stops where the board stops it. The 0.7px of margin is what makes the
break wrong rather than tight: 48 is above `Forest w`, not below it.

There is no width that fixes this. Any box narrow enough to push `w` down (under 47.16) is also under
the 47.27 that `w Suppr.` needs, so it goes to three lines and overflows the 28px band. The break has
to be made unbreakable rather than measured into existence.

**Suggested resolution**: put a non-breaking space between `w` and `Suppr.` in the abbreviation:
`"Forest w\u00A0Suppr."`. Verified live in the 48px box: lines become 34.84 / 47.27, scrollWidth
stays 48 with no overflow, and the band stays two lines. It is the idiom `terrain-summary.tsx`
already uses on this same string, which is an argument for it rather than against. Whichever form is
chosen, the plan's "ordinary wrapping reproduces the board" sentences have to go, in both this file
and `requirements.md`.

**Decision**: A, Doug, 2026-08-28. `"Forest w\u00A0Suppr."` in `vegetationAbbreviatedLabels`.

It is the idiom `terrain-summary.tsx` already uses on this same string, so the repo keeps one way
of doing this rather than two, and it holds the break inside the constant where the abbreviation
lives instead of in the component. B would put the break point in the markup, which is the
open-coded fourth string `requirements.md` ruled out; C reads worse, since it splits `w` from what
it modifies. The one thing that could have argued against A was checked and does not:
testing-library's default normalizer treats `\u00A0` as whitespace, so `getByText("Forest w
Suppr.")` written with a plain space matches (throwaway suite, three cases, passing). It rules out
only an exact `textContent` comparison, which the planned test has no reason to use, and that
caveat is now recorded on the test. The wrapping claims are struck from both files.

---

#### RESOLVED: DF2. The title row's 4px gap is 5px on the board, and nothing forces the compression

Row 2's 4px gaps are earned: the plan trades the board's 5px for the icon's intrinsic 28, and the
arithmetic `1 + 7 + 28 + 4 + 48 + 4 + 20 + 4 + 45 + 7 + 1 = 169` is what closes inside 170. The
title row inherits the same 4px with no such constraint, and the board draws it at 5.

Measured off the board, every one of the twelve `Zone Label Enhanced` groups: `Zone` group ends at
rel 70.5, `·` starts at 75.5; `·` ends at 79.5, the terrain type starts at 84.5. Five and five. The
group widths confirm it: `Zone and Mountains` 117 = 44 + 5 + 4 + 5 + 59, `Zone and Hills` 83 =
44 + 5 + 4 + 5 + 25, `Zone and Plains` 93 = 44 + 5 + 4 + 5 + 35.

There is no budget pressure to inherit. The title row has the full 154px content box and its widest
case is `Zone 1 · Mountains` at 42.67 + 3.92 + 58.39 = 105 of glyphs, so 5px gaps make it 115. Built
live at `gap: 5`, the title unit measures 81.31 against the board's 83 for `Hills` (the 1.7px is the
`Zone` group's 1px left inset plus rounding), and its center offset from the label's center is 0.00,
so the centering the requirements ask for is unaffected.

**Suggested resolution**: `gap: 5px` on `.titleRow`, `gap: 4px` on `.conditionsRow`, and a note that
the two differ because only row 2 is budget-constrained.

**Decision**: applied. `.titleRow` takes the board's 5px and `.conditionsRow` keeps 4 with the
reason on the line.

---

#### RESOLVED: DF3. The 45px drought box is right, but the reason given for it misreads the board

`requirements.md` DF2 argues the drought name box is *"44 for Severe, Mild and No, and **45 for
Medium**"*, calls that *"not a Zeplin rounding artifact"*, and this file repeats it as
`.droughtName { width: 45px; }  // "Medium" is 44.6px; 44 would overflow it`. The board does not draw
four boxes of two sizes. The `Drought Index` text group is **45 x 28 in all four drought rows** (rel
117 in every label, at y 1088, 1158, 1228 and 1298); what varies is the text bound inside it, 44 for
`Severe`, `Mild` and `No`, 45 for `Medium`. The vegetation side is the same shape and the spec reads
it correctly there: a 48 x 28 `Vegetation Type` group holding a 32 or 35 wide `Grass` or `Forest`.

The number does not change: 45 is both what the board's box is and the smallest whole pixel that
holds `Medium` at 44.61, which is confirmed. What changes is that the stated reason is a trap for the
next engineer. Someone re-deriving the row from the board and reading the text bounds the way DF2
did would "correct" 45 back to 44 and wrap `Medium` to a third line.

This is the third instance of the same group-versus-artwork misreading. DF3 in `requirements.md`
caught it for the drought icon (19 x 25 artwork inside a 20 x 28 group) and this file's first
resolved question caught it for the vegetation icon. It survived on the drought name.

**Suggested resolution**: restate the box as the board's uniform 45 x 28 `Drought Index` group,
keeping the 44.61 measurement as the independent confirmation it is rather than the derivation, and
correct DF2 in `requirements.md` alongside it.

**Decision**: applied here and in `requirements.md`. Both name widths are now stated as the board's
boxes, with the text measurements as confirmation. The number is unchanged at 45.

---

### Senior Engineer

#### RESOLVED: SE1. Row 2's `flex-shrink: 0` is inert in the configuration being shipped, and the comment justifying it is measured off a different one

The plan states: *"Without `flex-shrink: 0` on the row's four children, the 48px vegetation box
shrinks to 46.97, which is under the 47.26 `"w Suppr."` needs, so it wraps to a third line and
overflows the 28px band; the drought box shrinks to 44.03 against `"Medium"` at 44.6 and does the
same."* Built at the plan's own numbers (`padding: 4px 7px 7px`, `gap: 4px`, icon 28, `.zone` holding
170) and toggled:

| | Label width | Gap | Row 2 boxes | `Forest w Suppr.` |
|---|---|---|---|---|
| As specced | 170 | 10 | 28 / 48 / 20 / 45 | 2 lines |
| Row 2's `flex-shrink: 0` deleted | 170 | 10 | 28 / 48 / 20 / 45 | 2 lines |

Nothing moves, because nothing is being asked to shrink. Row 2 uses 153 of the 154px content box, so
there is 1px of slack and no deficit to distribute. The plan says as much two paragraphs earlier
(*"the content box is 154 and row 2 uses 153"*) without connecting it.

The quoted failure is real, just not here. Reproduced at `gap: 5px` with the same padding and icon:
the vegetation box lands at 46.39 and `Forest w Suppr.` goes to **three lines** (scrollHeight 36
against the 28px band), and the drought box lands at 44.61. The exact 46.97 / 44.03 pair is the
5px-gap row inside a label allowed to fall to its 169px min-content: at 153px of available width
against 156 of content, a 3px deficit distributed across a 141px basis gives 48 - 3(48/141) = 46.97
and 45 - 3(45/141) = 44.03. So the measurement was taken before the gap came down to 4, and it was
carried forward onto the row that no longer has the deficit.

Keeping the declarations is defensible as a guard: they are what would stop the row degrading if the
gap ever went back to 5. Presenting them as load-bearing today, with a measurement that no longer
applies, is not, and an inaccurate justifying comment in the SCSS is the specific thing the comment
audit catches.

Worth noting the same 1px of slack means row 2 sits 8px from the left inner edge and 9 from the
right, against the board's symmetric 8 and 8. Distributing the gaps 4 / 4 / 5 would recover it.

**Suggested resolution**: keep `flex-shrink: 0` if it is wanted as a guard, but rewrite the comment
to say what it guards against rather than what it is preventing now, and correct the paragraph so it
does not claim a shrink the shipped numbers cannot produce. The `.zone`-level `flex-shrink: 0` is
unaffected: that one is load-bearing and its own mutation table below is accurate.

**Decision**: B, Doug, 2026-08-28. Keep the declarations as a guard with a corrected comment, keep
gaps at 4 / 4 / 4, and accept the 1px of asymmetry (insets 8 and 9).

Redistributing to 4 / 5 / 4 was built and measured first, because it recovers the board's symmetric
inset and is the more faithful arrangement in isolation. It was rejected on a consequence that only
showed up in the mutation matrix: at 4 / 5 / 4 the row uses exactly 154 of 154, which raises
`.zone`'s min-content from 169 to 170, and deleting `.zone`'s `flex-shrink: 0` then changes nothing
measurable. That turns the Cypress case's `width === 170` into an assertion that passes under every
mutation, which is the one failure mode this spec has spent the most effort avoiding. Both
arrangements are recorded in the layout notes so whoever revisits does not have to re-derive them.

---

#### RESOLVED: SE2. The `terrain-summary.tsx` rewrite keeps a ternary that is already redundant, and hides a non-breaking space inside a `.replace`

The proposed replacement is:

```tsx
const vegetationCaption = isForestWithSuppression
  ? vegetationDisplayLabels[vegetationType].replace(" ", " ")
  : vegetationDisplayLabels[vegetationType];
```

Two things. First, the branch is unnecessary: `Grass`, `Shrub` and `Forest` contain no space at all,
so replacing the first space is identity on every value except `Forest with Suppression`. Both arms
compute the same thing for three of the four cases and the whole ternary collapses to one
expression. `isForestWithSuppression` is still needed for `css.fwsCaption` and `shiftColumnLeft`, so
nothing else is lost. The plan is already deleting a dead branch in this exact line (the else arm's
`.replace`, which the ternary made unreachable for the case it named); this leaves a second one
behind.

Second, `.replace(" ", " ")` has a `\u00A0` as its second argument, written literally. Confirmed by
hexdump that this is what the file holds today, inside a quoted string next to a comment that
explains it: `"Forest\xc2\xa0with Suppression"`. Moved into `.replace`, the two arguments render
identically in most editors and diffs, so the one line whose whole purpose is the difference between
two invisible characters becomes unreviewable.

Separately, the plan's stated reason for rewording the surviving comment does not hold. It says the
comment *"describes the right outcome by the wrong mechanism"*, then describes the mechanism the
comment already gives. The comment reads *"A non-breaking space keeps it as 'Forest with' /
'Suppression' (not three lines)"*, which is accurate: the `\u00A0` glues `Forest` to `with`, leaving
the space before `Suppression` as the only break point. Rewriting an accurate comment is churn.

**Suggested resolution**:

```tsx
const vegetationCaption = vegetationDisplayLabels[vegetationType].replace(" ", "\u00A0");
```

and leave the existing comment alone apart from whatever the identifier rename forces. If DF1 is
resolved with a non-breaking space, the same escape form should be used there so both sites read the
same way.

**Decision**: applied. The ternary collapses to one expression, the non-breaking space is written
as `\u00A0`, and the existing comment stands.

---

#### RESOLVED: SE3. `.simulationInfo { gap: 10px; }` is a second block for a selector the file already opens

The plan presents the container half of the floor as a standalone rule. `simulation-info.scss` is one
top-level `.simulationInfo` block with everything else nested inside it, so adding this as written
gives the file two blocks for the same selector, with `gap` separated from the
`display: flex` / `justify-content: center` it belongs beside. It should go in the existing block.
Worth confirming while it is being written that the fixed-position `.windContainer` is unaffected:
it is, since an out-of-flow child is not a flex item, and it stayed at left 10 with the gap applied
live.

**Decision**: applied. The gap goes in the existing block, with the `.windContainer` check recorded
beside it.

---

### QA Engineer

#### RESOLVED: QA1. `mountainsandplainsThreeZone` is not a preset, so the Cypress case does not load what it names

The floor case visits `/?preset=mountainsandplainsThreeZone`. `src/presets.ts` has
`mountainsandplainsTwoZone` and it has `hillThreeZone`, but no `mountainsandplainsThreeZone`.
`getResolvedConfig` looks the name up as `presets[urlConfig.preset || base.preset]`, so an unknown
name resolves to `undefined` and `Object.assign(base, undefined, urlConfig)` skips the preset layer
entirely. Loaded live, the URL yields no preset at all: three zones, all Plains, and
`zonesCount: undefined` from the base config rather than a pinned 3.

It happens to render three labels, so the case would pass today, which is what makes it worth
fixing before it is written. Nothing in the file says the preset is a fallback, `zonesCount` is not
pinned, and a real `mountainsandplainsThreeZone` added later (two zones, three, anything) would
silently change what the case measures.

The same name is in `requirements.md`'s layout section as the condition every measurement was taken
under, so that section is describing base defaults rather than the preset it names.

**Suggested resolution**: use `hillThreeZone`, which is a real three-zone preset. Re-measured under
it at 950 x 880 with the graph open and the plan's SCSS applied: labels at x 44.5 / 224.5 / 404.5,
all 170 x 60, both gaps exactly 10, first label 69.5px behind the Time display's right edge at 114.
Every number the two specs quote for this viewport reproduces. Correct the preset name in
`requirements.md` as well.

**Decision**: applied in both files. The Cypress case visits `hillThreeZone`, and
`requirements.md`'s layout section now names the preset its measurements were actually re-taken
under.

---

#### RESOLVED: QA2. The abbreviation test cannot make its second assertion in the file it is assigned to, and the refactor it guards ships untested

The planned case is *"abbreviates Forest with Suppression on the map label only"*, asserting
`"Forest w Suppr."` in the zone label *"while the Setup panel still renders 'Forest with
Suppression'"*, and it *"fails if the abbreviation leaks into Setup"*. Step 3's files list puts it in
`simulation-info.test.tsx`, which renders `<SimulationInfo />` and nothing else. The Setup spelling
comes from `TerrainSummary` and `VegetationSelector`, both of which are rendered only by
`TerrainPanel`. As assigned, the leak half of the test asserts nothing.

The gap it is trying to cover is real and larger than one test. There is no `vegetation-selector` or
`terrain-summary` test file, and nothing anywhere in `src/` asserts the display string
`"Forest with Suppression"`. So step 1, which deletes both `.replace` call sites and re-points them
at a new map, has no coverage at all: breaking the Setup panel's display spelling turns nothing red.

**Suggested resolution**: split it. Keep the `"Forest w Suppr."` assertion in
`simulation-info.test.tsx`, where the label is, and put the full-spelling assertion where the Setup
panel actually mounts, in `terrain-panel.test.tsx` (its fixtures already include a
`Vegetation.ForestWithSuppression` zone). Name the mutation each half catches, and say explicitly
that the zone label's fixture has to set `ForestWithSuppression` on a zone, since no default preset
uses it.

**Decision**: B, Doug, 2026-08-28. Both Setup call sites get an assertion in
`terrain-panel.test.tsx`, and they travel with the display-label step rather than the layout step,
since that is the commit that removes the two `.replace` calls. The zone label keeps its own
assertion in `simulation-info.test.tsx`.

B needs no new files and no new fixtures: `describe("vegetation selector")` already sets
`defaultThreeZones`, `zonesCount = 3` and `showTerrainUI = true`, and `defaultThreeZones` happens
to carry both preconditions, a Mountains zone at index 0 and a `ForestWithSuppression` zone at
index 2. A would have left `VegetationSelector`'s call site unguarded; C would have rebuilt those
same preconditions in two new files, for components `TerrainPanel` already mounts. The mutation
each assertion catches is named on it, and the zone-label test's need to set
`ForestWithSuppression` itself is recorded, since the default stores give Forest / Shrub / Grass.

---

#### RESOLVED: QA3. The Cypress sketch omits the readiness wait every other visual spec makes

`key-area-visuals.cy.ts` and `bottom-bar-visuals.cy.ts` both follow `cy.visit` with
`cy.window().its("sim.dataReady").should("eq", true)` before reading any geometry. The sketched case
goes from `cy.visit` to clicking the graph tab to measuring. Since it is geometry against a page
that mounts a WebGL canvas, and since it runs at a viewport the rest of the suite never uses, it
should wait the same way. Small, but it is the difference between a flaky case and a stable one.

**Suggested resolution**: add the wait after `cy.visit`, before the graph click.

**Decision**: applied. `cy.window().its("sim.dataReady").should("eq", true)` sits between the visit
and the graph click, matching the two existing visual specs.

---
