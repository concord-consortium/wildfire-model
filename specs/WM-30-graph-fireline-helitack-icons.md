# Wildfire Graph panel: Fireline and Helitack icons at the top of the graph

**Jira**: https://concord-consortium.atlassian.net/browse/WM-30

**Status**: **Closed**

## Overview

Replace the "Fire Line" and "Helitack" text labels that mark suppression events on the Acres Burned vs. Time graph with the corresponding icons, so students can see at a glance what kind of action was taken, and when.

When a student places a fire line or drops helitack during a run, the graph marks the moment with a dashed vertical line labeled in words. Words at that size are hard to scan while a model is running, and they do not connect visually to the buttons the student just pressed. Showing the same icons the student clicked, at the point on the time axis where the action happened, makes the graph readable at a glance and ties the graph back to the controls.

Several suppression events can happen close together in time, so the icons can overlap. When they do, the most recent action is drawn on top and an earlier icon is partly covered, but its dashed line stays separate and legible, so the number of interventions and their timing remain readable even where the artwork collides. Alternatives that keep every icon visible were considered and rejected, because nudging icons apart makes them point at the wrong time.

## Background

The graph is rendered by `Graph` (`src/components/graph.tsx`), feeding `Chart` → `LineChart` (`src/charts/components/`) built on **Chart.js 2.9** with **react-chartjs-2**. Suppression events are marked using `chartjs-plugin-annotation`, pinned at **0.5.7**, whose label renderer draws text and nothing else. Image labels arrive only in the 1.x/2.x line, which requires Chart.js 3+. So this story could not be "swap the label string for an image": the plugin's own label had to be turned off for these two annotations and the icons drawn by other means.

The design lives on the Zeplin artboard *WM-25 Hazbot: Wildfire Graph panel UI/UX updates*: https://app.zeplin.io/project/5fe47ae231d1f6a428c53450/screen/6a1042a9053056f90b7b2b43

Note the project: this artboard sits in *Portal, LARA Authoring, and Activity Player Runtime*, not in *GeoHazard Wildfire Design* where every other wildfire artboard lives. Searching the wildfire project instead turns up a decoy, the older `8C: Graphs` screen, which carries same-named markers at **different** sizes (24 x 30 and 32 x 27) and a different placement.

| Zeplin layer | Size | Relationship to existing art |
|---|---|---|
| `Fireline Marker Graph` | 21 × 27 | scaled from the map **marker** (`Fireline Marker`, 47 × 60), not the bottom-bar axe icon |
| `Helitack ICON Graph` | 27 × 22 | roughly the bottom-bar **icon** (`Helitack ICON`, 53 × 45) at 50% |

## Requirements

- The "Fire Line" and "Helitack" text labels no longer appear on the graph.
- A fire line event is marked with `src/assets/graph/fire-line.svg` (the shield-and-axe marker, 21 x 27, matching the marker left on the 3D map) at the top of the graph, horizontally aligned to the time at which the event occurred.
- A helitack event is marked with `src/assets/graph/helitack.svg` (the helicopter, 27 x 22, matching the Helitack button, since helitack leaves no map marker) in the same way.
- The annotation records which kind of event it marks, rather than the renderer inferring it from the dash pattern.
- When two or more icons overlap, the icon for the **most recent student action** is drawn on top of earlier ones. That is not the same as the order the annotations were added; see the Technical Note.
- Icons track the x-axis: when the axis rescales or scrolls (including the Show Recent Data / Show All Data modes), each icon stays aligned with its event time.
- Icons are cleared when the chart data is cleared, so a restarted or reloaded model starts with no icons.
- Icons render correctly in both graph data modes, and survive the chart being destroyed and recreated, which happens several times a second while a model runs.
- Icons sit **above** the plot area, each centered on its dashed line, with the fire-line shield 2px above the top gridline and the helicopter 3px above it (per the artboard: bottoms 1px apart, not flush). The dashed line starts at the top gridline and runs the full plot height.
- An icon is drawn only while its event time falls within the currently visible x range; an event that has scrolled out of the Show Recent Data window shows no icon, matching its dashed line, which the plugin already clips. An icon that *is* in range but sits near either end stays centered on its own line and is allowed to overhang the plot bounds rather than being clamped inward. Icons carry no background fill.
- **The overall height of the chart and the graph panel does not change.** The space the icons need comes out of the plot area via `layout.padding.top`, not from growing the 381px chart, and not from the legend or axis-title spacing. The value is **30**, and it is not approximate: `chartArea.top` is `max(padding.top, 8.4)`, the shield needs 29px (27px tall at a 2px gap) and the canvas top edge is y = 0, so **29 is the minimum below which the shield clips** and 30 leaves exactly one pixel. The plot loses 21.6px (276.28 to 254.68, -7.8%).

## Technical Notes

- **The 381px chart height is load-bearing.** `graph.tsx` passes `height={381}` rather than the 400 default; commit `367547f` trimmed it so the chart panel fits the **1366 x 609 Chromebook viewport** with no scrollbar and an even 10px gap on all four sides. Any icon placement needing vertical space must take it from the existing plot area rather than increasing the chart or panel height.
- **Chart re-creation is constant, not occasional.** `redraw={true}` makes react-chartjs-2 destroy and recreate the Chart.js instance on every `LineChart` update, measured at 5 to 6 cycles per second during a run. Each cycle rebuilds `options` from the module-level `defaultOptions`, so `padding.top` must be set in source rather than poked onto a live instance. On the canvas route this means any `Image` must be decoded ahead of time (module-level, not per-instance) or icons will flicker.
- **The DOM-overlay route was not the bare import it looked like.** Nothing in the repo holds a `ref` to the chart instance, and the canvas has four `position: static` ancestors before the first positioned one, so an absolutely positioned overlay has no anchor until new CSS is added. Worse, its coordinates come from `getPixelForValue` on an instance that is replaced out from under any reference: a stale instance's `getPixelForValue(5)` returned 59.90 while the live one returned 18.48 at the same moment, a **41.4px error on a 197px plot**, failing silently because a destroyed Chart.js 2.9 instance keeps answering with last-known values.
- **`afterDraw` does no clipping**, unlike the plugin's own label and line drawing. Measured with the axis at 30-72 and an event at t=20, the icon rendered **60.9px left of the y-axis**, floating over the axis-label column with no dashed line beneath it. The boundary is exact: at `value === scale.min` the plugin still strokes its line, at `chartArea.left` to the hundredth, so `value >= scale.min && value <= scale.max` reproduces the plugin's own clipping with no special case at the edge.
- **The icon needs no rounding to sit on its line, but it does need rounding to stay crisp.** *(Corrected 2026-08-19, after close; the original finding claimed the opposite and is preserved below.)* The first half holds: the plugin strokes the annotation line centered on the raw `scale.getPixelForValue(value)`, and measured ink centers matched computed values inside 0.07px, so the raw value is the right thing to center on. The second half was wrong. `drawImage` blits the already-decoded raster and resamples it at the destination offset; it does not re-rasterize the SVG at the draw position, so a fractional `left` **does** soften the artwork. Measured on the live chart, the shield's 1px outline rendered at alpha 103-139 at a fractional x versus 255 at an integer one, and since the artwork touches its own bounding box on every side, that outline splits across two columns and the side edges read as thin or clipped at some positions and solid at others. `iconPlacement` therefore rounds `left` and `top`. The cost is at most half a pixel of offset from the dashed line, which is imperceptible; the gain is a solid border at every position. Originally reported by Michael Tirenin against the PR build ("the right edge feels like it's being clipped a bit"), then reproduced and measured: two icons at different x positions now render within 5 alpha of each other on both edges, where before the same measurement swung between 103 and 255 depending on where an icon landed.
- **"Most recent" means the student's action, not the order annotations were added.** *(Corrected 2026-08-19, after close.)* The two diverge because the model stamps the two interventions at different moments: `setHelitackPoint` sets `lastHelitackTimestamp` the instant the drop is placed, while `lastFireLineTimestamp` is set by `buildFireLine`, which does not run until `applyFireLineMarkers()` on Start. A fire line drawn during a pause is therefore annotated *after* a helitack dropped later in that same pause, and painting in array order put the shield over the helicopter. Reported by Michael Tirenin against the PR build ("I would expect the helitack to show in front"). Reproduced live: paused at t = 469.45, both events land at hour 7, and the annotation array came out `[helitack, fireLine]` in that order. The array alone cannot be trusted here, because the **reverse** sequence (pause, drop a helitack, then draw a fire line) produces the *identical* array while requiring the opposite z-order, so a per-kind rule such as "helitack always on top" fixes one case and breaks the other. Both sequences are reachable: the Helitack button stays enabled while the model is paused, and `timeInHours` floors to the hour, so events minutes apart still share an x. The model now stamps a monotonic `fireLineActionOrder` / `helitackActionOrder` when the student acts (markers completing, or the drop landing), the annotation carries it as `actionOrder`, and `annotationsInDrawOrder` sorts on it before painting. Sorting rather than fixing the insertion order keeps the annotation creation gated on the fire line actually being built, so a line that is drawn and then discarded still never draws an icon.
- **Drawing in CSS pixels is correct on a retina display.** Chart.js 2.9 retina-scales the context, so a custom `afterDraw` inherits the same transform the plugin's own line drawing uses. Forced to `devicePixelRatio: 2`, `chartArea` stayed in CSS pixels and line ink measured in device pixels and halved matched `getPixelForValue` to 0.004px.
- **Do not rename anything outside the annotation `label` field.** The Hazbot log event is named `"Helitack"` and rule-sets 45, 47 and 54 match on that exact string via `translate.ts`. It looks like the chart label but is unrelated, and a tidy-up could silently break rule matching, the same trap WM-39 had with `terrainLabels`.
- **Icon counts are not small at the top end.** The cooldowns are the only limit (`helitackDelay` 240 minutes, `fireLineDelay` 1440), neither has a run-total cap, and suppression *extends* the run rather than ending it. Measured at maximum rate: 37 events in 40 real seconds, 2.86px between adjacent dashed lines in Show All Data, with one 27px helicopter spanning 9 neighbor spacings. Nothing breaks, but do not size anything on the assumption of a handful.
- **The same-hour collision is a known, accepted gap.** Annotation `value` is `Math.floor(time / 60)`, so two events inside one simulated hour get *identical* values. The model runs at 3.00 simulated hours per real second, making that window about 333ms.
- **Opening and closing the graph tab changes nothing measurable**, so it is not a useful acceptance case: same instance id, same 286 x 381 backing store, identical `chartArea`. Fullscreen and a 1600 x 900 resize likewise changed nothing, since the panel width is fixed and the height is a prop.
- Pre-existing test-harness gap, deserving its own ticket: `window.test.placeFireLineInZone` places markers but never calls `buildFireLine`, so it leaves `lastFireLineTimestamp` unset and the fire-line annotation is never created. `window.sim.buildFireLine(start, end)` is the path that works. `placeHelitackInZone` has no such gap.

## Out of Scope

- Upgrading `chartjs-plugin-annotation` or Chart.js.
- Growing the chart or the right panel to make room for the icons; the Chromebook fit set in `367547f` is fixed.
- Changing the dashed vertical lines themselves (color, dash pattern, thickness).
- Any change to the bottom-bar Fireline/Helitack buttons or the 3D map markers.
- Legend, axis, or Show Recent Data / Show All Data behavior beyond keeping icons aligned.
- Accessibility work, which this project handles separately.

## Not Yet Implemented

- **Fixing `window.test.placeFireLineInZone`**: the helper places fire-line markers without setting `lastFireLineTimestamp`, so it never triggers the annotation effect. Deferred to its own ticket: fixing it touches `stores.ts` and is not this story's work. `CLAUDE.md`'s description of the helper is misleading for anyone testing annotations and should be corrected with it.
- **Hover or click behavior on the icons**: declined (see the decision below). Left cheap to add later if a design ever calls for it, but there is no design for tooltip content or styling today.
- **A remedy for two events in the same simulated hour**: accepted as a known gap rather than fixed, since x is quantized to whole hours and the window is about 333ms of wall-clock time.

## Decisions

### Is the exported Zeplin artwork the intended art for both icons?

**Context**: The artboard supplies `Fireline Marker Graph` (21 × 27) and `Helitack ICON Graph` (27 × 22). They are not simply the bottom-bar icons scaled down: the fire line one derives from the **map marker** (the pin shape), not the axe icon on the Fireline button, so the two icons come from different visual families.

**Options considered**:
- A) Use both exported graph assets exactly as the artboard specifies.
- B) Use the graph helitack asset, but the bottom-bar axe artwork scaled for fire line, so both icons match their buttons.
- C) Something else, to be confirmed with Michael.

**Decision**: **A**, use both exported assets as designed. The mixed families are deliberate, not an oversight: each graph icon echoes what the student can still see elsewhere on screen. A fire line leaves a persistent shield marker on the 3D map (the same shield artwork), so the graph icon matches the marker. Helitack leaves **no** persistent map marker at all, so its graph icon matches the button instead. Verified by rendering all five candidate assets side by side at natural size, 4x and normalized height.

---

### Where exactly do the icons sit vertically, and do the dashed lines stay?

**Context**: The ticket says "at the top of the graph" and the current labels sit inside the plot. The chart is fixed at 381px for the Chromebook viewport, so an icon outside the plot area has to be bought with plot-area padding, which shortens the plotted curves.

**Options considered**:
- A) Icon inside the plot area, centered horizontally on the dashed line, top-aligned with a small offset, dashed line retained. No height cost.
- B) Icon above the plot area in a padding band, dashed line retained and running the full plot height. Needs a 30px band, of which 21.6px comes out of the plot.
- C) Icon replaces the line's top portion (line starts below the icon). No height cost.
- D) Dashed lines removed, icon alone marks the event.

**Decision**: **B**, icons above the plot area with the dashed lines retained, exactly as the artboard draws it. Three details beyond "above the plot": the icons are **bottom-anchored rather than top-aligned** (bottoms 1px apart, not flush), which makes the taller shield start higher; each line is **centered under its icon**; and the line **starts below** the icon rather than running behind it.

The band value was swept on the live chart rather than assumed. `chartArea.top` is `max(padding.top, 8.4)`, so above 8.4 the band grows 1:1 with the padding: at 28 the shield's top edge is at y = -1 and clips, at 29 it is flush with the canvas edge, and at **30** it has one pixel of clearance. The rejected alternative, reclaiming space from the legend and axis title, preserved plot height but dropped the legend band from 38px to 26px, ending flush with the canvas bottom edge and removing the breathing room WM-25/WM-26 set.

---

### What does "latest-most addition takes highest z-order" mean when icons collide?

**Context**: The ticket states the rule but not the visual result. With icons 21-27px wide on a ~294px plot, two events a few simulated hours apart overlap substantially, and a purely "draw later on top" rule means the earlier icon can be almost entirely hidden.

**Options considered**:
- A) Pure paint order: later icons cover earlier ones, nothing is nudged.
- B) Paint order plus horizontal nudging so overlapping icons remain partly visible.
- C) Paint order plus vertical stacking so both stay fully visible.

**Decision**: **A**, pure paint order, exactly as the ticket states. Measured in a harness at the true canvas with a crowded case: paint order gave 11.1px center gaps with icons smearing together but the dashed lines individually legible; horizontal nudging kept icons readable but drifted **47.8px** from true time, about **17 simulated hours**, visibly floating each icon off its own dashed line; vertical stacking needed a second ~29px band, dropping the plot to roughly 222px, which the height budget forbids.

Nudging trades a readability problem for a correctness problem on a graph whose job is showing *when* things happened. What makes paint order tolerable is that the dashed lines remain distinct wherever events sit at different hours, so the count and timing stay readable from the lines; only the icon artwork degrades. That argument has a density bound: at the measured ceiling (37 events, 2.86px line spacing) the lines render as a solid hatched block and nothing is countable. The decision stands anyway, since no alternative does better at that density.

---

### Does the icon keep the white background the text label had?

**Context**: The current labels render on `labelBackgroundColor: "white"`, which keeps them legible where they cross the plotted zone lines. An icon with a transparent background would have gridlines showing through.

**Options considered**:
- A) No background; the icon sits directly on the chart.
- B) Keep a white background behind the icon, matching today's label treatment.
- C) White background only where the icon overlaps plotted data.

**Decision**: **A**, no background. The placement decision removed the reason for one: the icons sit in the band above the plot, where there are no gridlines and no curves behind them. Verified at the axis extremes, which also ruled out B: because `afterDraw` does no clipping, a backing box overhangs exactly as the icon does, so at the left edge it would paint over the "100" tick label's column, creating a new defect rather than failing to help. C never fires, since in this placement the icons never overlap plotted data. The overhang itself is allowed rather than clamped, since clamping an extreme icon back inside the plot would slide it off its own dashed line.

---

### Do the icons need any hover or click behavior?

**Context**: The annotation model supports `expandLabel` with mouse handlers and `LineChart` enables the plugin's mouse events, but neither annotation uses it. Icons are less self-explanatory than words, so a tooltip is plausible, and it would give a way to read an icon hidden underneath a later one.

**Options considered**:
- A) No interaction; icons are static markers, matching today's labels.
- B) Tooltip on hover naming the event (and possibly its time).
- C) Tooltip on hover, plus clicking to surface the underlying icon when several overlap.

**Decision**: **A**, no interaction. Two findings priced the alternatives. First, the plugin's annotation hover does not mean "you are pointing at this one": `inRange` for a vertical line uses the annotation's own height as its x-tolerance and `getNearestItems` reduces matches to the nearest center, so it behaves as "nearest annotation anywhere in the plot", which is not a hover affordance. Second, after the placement decision the icons are drawn **outside** the plugin in a custom `afterDraw`, so the plugin cannot hit-test them at all. B is real work with no design behind it and is undiscoverable on the touchscreen Chromebooks this app targets.

---

### Does anything downstream consume the "Fire Line" / "Helitack" label strings?

**Context**: Graph state feeds the outcome data collected for Hazbot, so it was worth confirming that nothing downstream reads the label strings.

**Options considered**:
- A) Display only; nothing downstream consumes these labels.
- B) Something downstream does consume them and needs updating too.

**Decision**: **A**, display only, traced rather than assumed. The two strings existed in exactly one place, as `Annotation.label` values. Following where an annotation can travel: the chart model stores them and exposes `formattedAnnotations`, which only `LineChart` reads; `chart-store.ts` clears them on reset. That is the complete set of consumers, and `simulation.getOutcomeData` never touches annotations or labels. Every other occurrence of those words is unrelated to the chart (the Hazbot log event, rule matching, the button captions, an `Interaction` enum value).

---

### Which rendering route: a Chart.js canvas plugin, or DOM elements overlaid on the chart?

**Context**: The requirements deliberately left this open. The DOM route can reuse the SVGs as React components and gets "latest on top" from document order; the canvas route needs `Image` objects and explicit draw ordering.

**Options considered**:
- A) A Chart.js plugin drawing both icons in `afterDraw`.
- B) Absolutely positioned DOM elements over the chart, driven by `getPixelForValue`.

**Decision**: **A**, the canvas route, built end to end as a pre-implementation spike with every assumption verified. It is not new machinery: `line-chart.tsx` already ships two custom plugins that draw on the canvas in `afterDraw`. Decisively, the canvas route gets three requirements free because the plugin is stateless and re-reads everything from the live instance each draw: clearing, axis rescaling in both data modes, and surviving chart re-creation. The DOM route owes a re-measurement on every re-creation, which is the 41.4px silent-drift trap recorded in Technical Notes, and it needs new CSS before an overlay has anything to anchor to.

---

### How should an SVG be loaded as a URL, given the build config has no branch for it?

**Context**: `webpack.config.js` has exactly one `.svg` rule whose two branches give a URL for CSS issuers and an svgr React component for TSX issuers. Nothing yields a URL for an SVG imported from a `.tsx` file, and `.nosvgo.svg` is not an escape hatch (it matches no rule at all). This priced the canvas route.

**Options considered**:
- A) A new webpack rule keyed on a `?url` resource query.
- B) Runtime serialization of the svgr component (`renderToStaticMarkup` into a data URI), re-run on every chart re-creation.
- C) Fresh PNG exports from Zeplin, since PNGs already resolve to URLs.

**Decision**: **A**, a `{ resourceQuery: /^\?url$/, type: 'asset' }` branch placed **first** in the existing `oneOf`, since `oneOf` takes the first match and the `issuer` branches would otherwise claim it. Roughly six lines of build config, plus a `declare module "*.svg?url"` block. The pattern is anchored rather than the loose `/url/` webpack's own examples use: an unanchored match would also claim `?nourl`, `?urls` or `?myurl=1` and hand back a URL where an svgr component was meant. B costs a `react-dom/server` import plus runtime work on every module load; C discards the SVG crispness the placement math relies on.

Two consequences carried into implementation: webpack's 8KB inline threshold acts on the **raw source** bytes and decides whether each asset inlines as a data URI or is emitted and fetched, and **svgo does not run on the `?url` path at all**, so whatever bytes are in `src/assets/graph/` are the bytes that ship. That is what makes the `<title>` normalization a real change rather than a tidy-up.

---

### Where should the icon module live, given that `src/charts/` is the generic chart layer?

**Context**: Putting the icon registry, images and plugin in `src/charts/components/` means wildfire artwork is imported from the charting layer. That layer is only semi-generic already, but the two existing plugins draw chart furniture whereas this one draws domain artwork.

**Options considered**:
- A) The module lives in `src/charts/components/` and imports the two assets directly.
- B) The plugin and registry live on the wildfire side and reach the chart through new `plugins` and `paddingTop` props threaded through `Chart` and `LineChart`.
- C) A generic "draw an image per annotation" plugin factory in `src/charts/`, parameterized by an icon registry passed down from `graph.tsx`.

**Decision**: **A**. The boundary is already breached and has been for years: `src/charts/package.json` declares a `cc-charts` package whose extraction never happened (no workspaces, nothing reads the manifest, never published, no second consumer), the manifest is already inaccurate (it omits `react`, `mobx` and `mobx-react`, all of which the layer imports), four files already import app code across the boundary, three components bind to this app's store shape, and `line-chart-controls.tsx` already imports and renders an app asset.

Option B was built as throwaway code rather than estimated: it cost **+22/-3** across two files against A's **+3/-1** in one, added four loosely-typed public props, and produced identical live geometry. C needs all of B's plumbing plus a factory indirection. The accepted cost of A is that wildfire vocabulary lands in `cc-charts`; since the plugin is stateless and self-contained, untangling it later *is* the B diff.

---

### Should the plot-area padding be derived from the artwork, or a plain constant?

**Context**: The requirements fix the value at 30 and record that 29 is the floor below which the shield clips. Deriving it means the single most safety-critical number in the story is computed rather than written down.

**Options considered**:
- A) Derive it as `max(height + gap) + 1`, with a unit test asserting it equals 30.
- B) A named constant `ICON_BAND_HEIGHT = 30` with the reasoning in a comment.
- C) A literal `top: 30` in `defaultOptions`, with no coupling to the artwork.

**Decision**: **A**, derive it, with a `0` fallback so an empty registry cannot produce `-Infinity`, and a comment at the `padding.top` site naming the current value. What decides it is the failure mode when artwork changes: derived, the band auto-grows and the plot quietly loses a few more pixels while `expect(iconBandHeight).toBe(30)` fails and forces a conscious update; constant, the artwork is silently cropped. Both fail loudly in CI, so the tiebreaker is what ships if the test is bypassed, and a 1px crop is invisible in review. Note that `toBe(30)` is the whole tripwire: the per-icon clearance assertion is entailed by the formula and cannot fail under A, so it stands as executable documentation of intent rather than a second guard.

---

### Can the graph helitack asset be size-optimized, or does it ship as exported?

**Context**: `helitack.svg` was 14,211 bytes for a 27 x 22 icon, caused by coordinate precision from a scaled Sketch export rather than artwork complexity (1,096 coordinates with four or more decimal places). Because svgo does not run on the `?url` path, those bytes shipped verbatim, and 14,211 is over webpack's 8,192-byte inline threshold, so the pair split: fire-line inlined as a data URI, helitack was emitted as a separate network request.

**Options considered**:
- A) Run the asset through svgo with the repo's existing config.
- B) Ship as exported, keeping the inline/emitted asymmetry.
- C) Michael re-exports from Sketch at whole-pixel coordinates.

**Decision**: **A**, applied ahead of the answer and sent to Michael for confirmation. The asset is now 5,488 bytes with `<title>Helitack</title>` in place, so both icons inline and neither is fetched. Optimization is not pixel-identical (36 of 594 pixels change at actual size, all on antialiased curve edges, maximum single-pixel change 28/255), which is why it needed a designer rather than a decision here. If Michael prefers a re-export, replacing the file is the whole change; nothing is coupled to which file is on disk.

---

### How does the renderer know which icon to draw once the labels are gone?

**Context**: Removing the text labels removes the only thing distinguishing a fire-line annotation from a helitack one. Measured: with `label` omitted, the two `formatted` objects differ in `borderDash` and nothing else. Inferring artwork by array-comparing `[5,5]` against `[10,5]` works today but fails silently, with no type error, if the patterns are ever unified, and Out of Scope forbids changing them.

**Options considered**:
- A) Infer the artwork from the dash pattern.
- B) Add an `eventKind` field typed as a union in the chart model.
- C) Add `eventKind` as a plain `string` on the generic model, with the kinds named and typed in the icon module, and have `graph.tsx` import those constants.

**Decision**: **C**. A is the silent-failure mode the change exists to remove. B would put wildfire vocabulary into the chart *model*, which the module-location decision deliberately kept out. Under C the registry is the single source of truth: `AnnotationEventKind` is `keyof typeof annotationIcons` (via `satisfies`, so the keys stay literal), so adding artwork adds a kind and a kind with no artwork does not type-check. Verified by compiling each case: a misspelled constant now fails with `TS2820`, and `annotationIcons["totallyMadeUp"]` now fails with `TS7053` where it previously type-checked and returned `IAnnotationIcon` (`noUncheckedIndexedAccess` is off).

This changed the step order as a side effect: `graph.tsx` now imports from the icon module, so its two annotation constructions moved into the same step that adds the icons, removing any commit in which the labels are gone and nothing has replaced them.

---

### Should the icon plugin itself have automated tests?

**Context**: A review found the plugin body cannot be exercised as written: `images` is module-private and jsdom reports `naturalWidth === 0`, so the image guard rejects everything and a stub chart produces zero `drawImage` calls. Exporting `images` and faking `complete`/`naturalWidth` would make the whole hook assertable, including the "most recent on top" requirement, which otherwise has no test.

**Options considered**:
- A) No plugin test; unit-test the placement math only.
- B) Export `images` (or add a test-only setter) and assert draw order, drawn coordinates, and skip cases at the plugin level.

**Decision**: **A**. The skip cases B would cover are already covered directly against `iconPlacement`, leaving draw order as the only new assertion, and that asserts `Array.prototype.forEach` iterates forwards and that `drawImage` paints later over earlier: platform guarantees, not this code's behavior. The costs are one-sided: it widens the module's public surface for no production reason and needs an `Object.defineProperty` hack to defeat a guard that exists precisely because jsdom never decodes an image. Worse, it runs against a hand-built stub, so the failures actually worth catching (an `eventKind` that does not survive Chart.js's config merge, a missing `x-axis-0` scale, the plugin running before `ChartAnnotation`) are exactly the ones a stub stays green through. Those were verified on the live chart instead.

---

### Why must the icon plugin sit after `ChartAnnotation` in the `plugins` array?

**Context**: The obvious reading, that globally registered plugins run first so array position is cosmetic, is wrong, and acting on it would put the dashed lines back over the icons.

**Decision**: Documentation only, no behavior change, but recorded because the mechanism is not the obvious one. `chartjs-plugin-annotation` both exports its plugin and **registers it globally** on import, and Chart.js 2.9 runs hooks in the order `this._plugins.concat(config.plugins || [])`. On top of that, `import * as ChartAnnotation` under `esModuleInterop` yields an `__importStar` copy, a different object from the registered plugin, so Chart.js's identity dedupe does not fire. Confirmed live: `config.plugins[0] !== <the global plugin>`, `config.plugins[0].default === <the global plugin>`, sharing an `afterDraw` reference.

The upshot is that the annotation plugin strokes its lines **twice** per frame, and the icons must sit after the array entry to land on top of the second pass. The double registration is pre-existing and unrelated to this story; only the ordering consequence matters. A three-line comment now sits directly above the `plugins` prop carrying the instruction and the reason.

---

### Should the icon plugin save and restore canvas state, as both sibling plugins do?

**Context**: `legendPlugin` and `yAxisLinePlugin` each wrap their drawing in `ctx.save()` / `ctx.restore()`; the icon plugin calls `drawImage` on whatever context state it inherits.

**Decision**: **Withdrawn, no change.** The siblings save and restore because they **mutate** context state (`strokeStyle`, `lineWidth`, `lineCap`, `setLineDash`) and have to put it back. `drawImage` alters no context state, so a save/restore pair around it would save a state, modify nothing, and restore the same state: a no-op, not a convention being skipped. The suggested fix also would not do what it claimed, since save/restore does not protect a draw call from *inherited* state. And the hazard is not live in any case: the annotation plugin releases its clip before any later `afterDraw` runs, and the icons measured unclipped and correctly placed on the live canvas.
