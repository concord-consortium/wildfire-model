# Wildfire Graph panel: Fireline and Helitack icons at the top of the graph

**Jira**: https://concord-consortium.atlassian.net/browse/WM-30
**Repo**: https://github.com/concord-consortium/wildfire-model
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

Replace the "Fire Line" and "Helitack" text labels that mark suppression events on the Acres Burned vs. Time graph with the corresponding icons, so students can see at a glance what kind of action was taken, and when.

## Project Owner Overview

When a student places a fire line or drops helitack during a run, the graph marks the moment with a dashed vertical line labeled in words. Words at that size are hard to scan while a model is running, and they do not connect visually to the buttons the student just pressed. Showing the same icons the student clicked, at the point on the time axis where the action happened, makes the graph readable at a glance and ties the graph back to the controls.

Several suppression events can happen close together in time, so the icons can overlap. When they do, the most recent action is drawn on top and an earlier icon is partly covered, but its dashed line stays separate and legible, so the number of interventions and their timing remain readable even where the artwork collides. Alternatives that keep every icon visible were considered and rejected, because nudging icons apart makes them point at the wrong time.

There is one case the lines do not cover. The graph plots events to the nearest simulated hour, so a fire line and a helitack that land in the *same* hour sit at exactly the same place: one line, one icon, no sign that two things happened. In wall-clock terms that window is about a third of a second, so it takes two placements in quick succession to hit, and the record is complete everywhere else.

## Background

The graph is rendered by `Graph` (`src/components/graph.tsx`), which feeds a `Chart` → `LineChart` (`src/charts/components/`) built on **Chart.js 2.9** with **react-chartjs-2**.

Suppression events are marked using `chartjs-plugin-annotation`. `graph.tsx` runs two effects, keyed on `simulation.lastFireLineTimestamp` (`:25-43`) and `simulation.lastHelitackTimestamp` (`:45-62`). Each pushes an `Annotation` (`src/charts/models/chart-annotation.ts`) of type `verticalLine` at the current `simulation.timeInHours`, carrying:

- a dashed vertical line (`dashArray` `[5, 5]` for fire line, `[10, 5]` for helitack, `thickness: 1`)
- a text `label` of `"Fire Line"` or `"Helitack"`, positioned `top`, 13px Roboto Condensed, `#606060`, on a white background

Annotations live on the chart model (`src/charts/models/chart-data.ts`), which exposes `formattedAnnotations`; `LineChart` passes that array to the plugin with `drawTime: "afterDraw"`. `ChartStore` clears `chart.annotations` when the chart is reset.

The blocking constraint is the plugin version. The project is pinned to **`chartjs-plugin-annotation` 0.5.7** (`package.json:139`), whose label renderer draws text and nothing else:

```js
// node_modules/chartjs-plugin-annotation/chartjs-plugin-annotation.js:838
ctx.fillText(view.labelContent, view.labelX + (view.labelWidth / 2), ...)
```

Image labels arrive only in the 1.x/2.x line, which requires Chart.js 3+. So this story cannot be "swap the label string for an image": the plugin's own label has to be turned off for these two annotations and the icons drawn by other means.

The design lives on the Zeplin artboard *WM-25 Hazbot: Wildfire Graph panel UI/UX updates*:

**https://app.zeplin.io/project/5fe47ae231d1f6a428c53450/screen/6a1042a9053056f90b7b2b43**

Note the project: this artboard sits in *Portal, LARA Authoring, and Activity Player Runtime*, not in *GeoHazard Wildfire Design* where every other wildfire artboard lives. Searching the wildfire project instead turns up a decoy, the older `8C: Graphs` screen, which carries same-named `Fire Line Marker` and `Helitack ICON` graph markers at **different** sizes (24 x 30 and 32 x 27) and a different placement. Use the URL above.

It supplies dedicated graph-sized artwork distinct from both the bottom-bar icons and the 3D map markers:

| Zeplin layer | Size | Relationship to existing art |
|---|---|---|
| `Fireline Marker Graph` | 21 × 27 | scaled from the map **marker** (`Fireline Marker`, 47 × 60), not the bottom-bar axe icon |
| `Helitack ICON Graph` | 27 × 22 | roughly the bottom-bar **icon** (`Helitack ICON`, 53 × 45) at 50% |

Both have been exported to `src/assets/graph/fire-line.svg` and `src/assets/graph/helitack.svg` on this branch.

## Requirements

- The "Fire Line" and "Helitack" text labels no longer appear on the graph.
- A fire line event is marked with `src/assets/graph/fire-line.svg` (the shield-and-axe marker, 21 x 27, matching the marker left on the 3D map) at the top of the graph, horizontally aligned to the time at which the event occurred.
- A helitack event is marked with `src/assets/graph/helitack.svg` (the helicopter, 27 x 22, matching the Helitack button, since helitack leaves no map marker) in the same way.
- The annotation records which kind of event it marks, rather than the renderer inferring it from the dash pattern.
- When two or more icons overlap, the most recently added icon is drawn on top of earlier ones.
- Icons track the x-axis: when the axis rescales or scrolls (including the Show Recent Data / Show All Data modes), each icon stays aligned with its event time.
- Icons are cleared when the chart data is cleared, so a restarted or reloaded model starts with no icons.
- Icons render correctly in both graph data modes (Show Recent Data and Show All Data), and survive the chart being destroyed and recreated, which happens several times a second while a model runs.
- Icons sit **above** the plot area, each centered on its dashed line, with the fire-line shield 2px above the top gridline and the helicopter 3px above it (per the artboard: bottoms 1px apart, not flush). The dashed line starts at the top gridline and runs the full plot height.
- An icon is drawn only while its event time falls within the currently visible x range; an event that has scrolled out of the Show Recent Data window shows no icon, matching its dashed line, which the plugin already clips. An icon that *is* in range but sits near either end stays centered on its own line and is allowed to overhang the plot bounds rather than being clamped inward. Icons carry no background fill.
- **The overall height of the chart and the graph panel does not change.** The space the icons need comes out of the plot area via `layout.padding.top`, not from growing the 381px chart, and not from the legend or axis-title spacing. The value is **30**, and it is not approximate: `chartArea.top` is `max(padding.top, 8.4)`, the shield needs 29px (27px tall at a 2px gap) and the canvas top edge is y = 0, so **29 is the minimum below which the shield clips** and 30 leaves exactly one pixel. The plot loses 21.6px (276.28 to 254.68, -7.8%).

## Technical Notes

- `graph.tsx:25-62` is where both annotations are created; the `label` field is what has to stop rendering.
- Turning off the plugin label means either omitting `label` on the `Annotation` or adding an explicit opt-out. The dashed line itself is unaffected. Note the mechanism, which is not what the shape of `chart-annotation.ts` suggests: for `type: "verticalLine"` a `label` block is **always** emitted (`chart-annotation.ts:93-105`), carrying `content: this.value`, the hour number. The `if (this.label)` block at `:121-134` only adds `enabled: true` and the styling on top. So omitting `label` suppresses the text because the plugin's `labelDefaults.enabled` is `false` (`node_modules/chartjs-plugin-annotation/chartjs-plugin-annotation.js:495`) and its draw path is gated on `view.labelEnabled && view.labelContent`, not because the block goes away. One consequence to keep in mind: every annotation keeps a live `content: <hour number>`, so anything that later enables labels on these annotations prints hour numbers rather than the old captions.
- **Removing the label removes the only thing that says which icon to draw.** `Annotation` has no field for the kind of event; today `label` is the discriminator, and this story deletes it. Measured with a throwaway Jest test that builds both annotations exactly as `graph.tsx:28-41` and `:47-60` do but with `label` omitted, then diffs the two `formatted` objects: the differing keys are `[ 'borderDash' ]` and nothing else. Everything else, including the surviving `label` block with its `content: <hour number>`, is identical. The dash difference is real and deliberate rather than incidental styling: it is drawn in the artboard mockup (the shield's line is the finer pattern, the helicopter's the longer one), it is implemented at `graph.tsx:13-14` as `borderDash1 = [5, 5]` and `borderDash2 = [10, 5]`, and Out of Scope freezes it. But it is **not recoverable from Zeplin**: all four `Fireline marker line` / `Helitack marker line` layers across both mockup variants report an identical `1.5px center #797979` with no dash data in either the CSS projection or the raw screen JSON, so Sketch rendered the dashes into the artboard bitmap and the import dropped the pattern. This spec and `graph.tsx:13-14` are therefore the only written record of it. Confirmed in the running app that the difference does reach the screen: with a fire line at hour 16 and a helitack at hour 21 in Show All Data, sampling each line's pixel column down the plot gives repeating runs of 6 on / 4 off for the fire line and 11 on / 4 off for the helitack, i.e. the 10px and 15px periods of `[5,5]` and `[10,5]`, with antialiasing widening each dash about 1px (`tmp/playwright/wm30-r3-live-annotation-lines.png`). Hence the requirement that the annotation carry the event kind explicitly: inferring artwork by array-comparing `[5,5]` against `[10,5]` works today but fails silently, with no type error, if the patterns are ever unified.
- Two plausible rendering routes, to be settled in the implementation spec: a Chart.js plugin hook drawing the icons on the canvas, or absolutely positioned DOM elements over the chart driven by `getPixelForValue(timeInHours)`. The canvas route has since been built end to end as a spike (see the section at the end of this document) and every assumption it rests on held, so the choice is now an informed one rather than a coin toss. The DOM route can reuse the SVGs as React components and gets "latest on top" from document order; the canvas route needs `Image` objects and explicit draw ordering. **The canvas route is not new machinery here.** `line-chart.tsx` already ships two custom Chart.js plugins that draw on the canvas in `afterDraw` and are registered alongside the annotation plugin at `:346`: `legendPlugin` (`:19-59`) strokes the legend key lines, and `yAxisLinePlugin` (`:64-80`) reads `chart.chartArea` and strokes into `chart.ctx` to draw the y-axis line, which is exactly the shape an icon renderer needs. Both are handed the live instance on every draw. **The DOM route, by contrast, is not the bare import it looks like**: nothing in the repo holds a `ref` to the chart instance (`<Scatter>` at `line-chart.tsx:339-347` takes none), and the canvas has four `position: static` ancestors before the first positioned one, `rightPanelContent` (`line-chart-container` twice, `chart-container`, then `graph.scss .chartContainer`), so an absolutely positioned overlay has no anchor until new CSS is added. See the re-creation note below for the third cost.
- **The two routes are not equally cheap, because of the build config.** `webpack.config.js:73-121` has exactly one `.svg` rule, with two branches: `issuer: /\.(css|scss|less)$/` gives `type: 'asset'` (a URL), and `issuer: /\.tsx?$/` gives `@svgr/webpack` (a React component). Nothing yields a URL for an SVG imported from a `.tsx`, and `.nosvgo.svg` is not an escape hatch (it is excluded from the SVG rule and matches no other rule). PNGs do get URLs, via `test: /\.(png|woff|woff2|eot|ttf)$/` plus the `declare module "*.png"` string typing at `src/global.d.ts:8`, which is how the 3D map does `img.src = fireLinePng`. So the DOM route is a bare import, while the canvas route additionally needs one of: a new webpack rule, runtime serialization of the svgr component (`renderToStaticMarkup` into a data URI), or fresh PNG exports. This prices the canvas route; it does not rule it out, and drawing both SVGs from a URL into `Image` objects was confirmed working against the live chart. **The new-webpack-rule option has since been built and measured** (see the spike section at the end of this document): a `{ resourceQuery: /url/, type: 'asset' }` branch placed ahead of the two `issuer` branches, plus a `declare module "*.svg?url"` block beside the existing `*.svg` one in `src/global.d.ts`, compiles under webpack 5.85 and ts-loader and resolves at runtime. That is roughly six lines of build config, which is the real price of the canvas route. Two consequences to carry into implementation: webpack's default 8KB inline threshold decides whether each asset is inlined as a base64 data URI or emitted as a separate file and fetched over the network, and svgo does not run on the `?url` path at all, so whatever bytes are in `src/assets/graph/` are the bytes that ship. **Note which size the threshold acts on**: `dataUrlCondition.maxSize` compares the **raw source** bytes. As originally exported those were 5,446 (5.32KB) for `fire-line.svg` and 14,211 (13.88KB) for `helitack.svg`, so the threshold split the pair, inlining the first and emitting the second. **`helitack.svg` was optimized to 5,488 bytes on 2026-08-19** (svgo, artwork unchanged, coordinate precision only; see the implementation spec's resolved question on it), so both assets are now under the threshold, both inline, and neither is fetched. The split is history rather than a live consequence, and is recorded here because it is what established how the threshold behaves on this path. The 7.16KB sometimes quoted for the fire-line asset is the length of the base64 data URI it *becomes*, which is its cost in the JS bundle but not the figure that decides inlining. So the headroom before the fire-line asset stops inlining is about 2.7KB of source, not 0.8KB, and the `<title>` normalization below (which shortens the file) cannot tip it over.
- `LineChart` renders `<Scatter>` with `redraw` and `key={chartStore.chartVersion}`, so any overlay must survive chart re-creation and container resizes.
- **Chart re-creation is constant, not occasional.** `redraw={true}` (`line-chart.tsx:345`) makes react-chartjs-2 destroy and recreate the Chart.js instance on every `LineChart` update. Instance ids sampled over roughly 1.5s of a run: 85, 88, 88, 90, 92, 94, 95. Each cycle rebuilds `options` from the module-level `defaultOptions` object, confirmed by setting `layout.padding.top` on the live instance and watching the next cycle wipe it, so `padding.top` has to be set in source rather than poked onto the instance. `key={chartStore.chartVersion}` (`chart.tsx:37`) is a second, coarser trigger on reset. On the canvas route this means the icons are redrawn from scratch several times a second, so any `Image` must be decoded ahead of time (module-level, not per-instance) or icons will flicker. **The DOM route is not exempt, despite living outside the canvas.** Its drawing is unaffected, but its coordinates are not: they come from `getPixelForValue` on the chart instance, and that instance is replaced out from under any reference to it. Measured during a run on `plainsTwoZone`: instance ids went 189 to 197 in 1.5s (about 5.3 recreations/s; a second sample gave 16 over 2.6s, 6.2/s); the stale instance's canvas was already detached (`document.contains(stale.canvas) === false`); stale `getPixelForValue(5)` returned 59.90 while the live instance returned 18.48 at the same moment, a **41.4px error on a 197px plot**, about 15 simulated hours, and comparable to the 47.8px drift that ruled out horizontal nudging in Q3. It fails silently, since a destroyed Chart.js 2.9 instance keeps answering with last-known values rather than throwing. So the DOM route owes a re-measurement on every re-creation, which the canvas route gets for free.
- **Opening and closing the graph tab changes nothing measurable**, so it is not a useful acceptance case. `<Graph />` is mounted unconditionally (`right-panel.tsx:36`) and the panel is a CSS slide (`right: -$rightPanelWidth` to `right: 0`, `right-panel.scss:6,34-37`). Measured at 1366 x 609 across a close-and-reopen: same Chart.js instance id, same 286 x 381 backing store, same CSS box, identical `chartArea`. Nothing unmounts, resizes or remeasures.
- **The 381px chart height is load-bearing and must not move.** `graph.tsx:187` passes `height={381}` rather than the 400 default; commit `367547f` ("fit graph panel to Chromebook viewport after master merge", 2026-06-09) trimmed it so the chart panel fits the **1366 x 609 Chromebook viewport** with no scrollbar and an even 10px gap on all four sides. That commit also widened `$rightPanelContainerWidth` from 315px to 331px in `common.scss` for the same reason. Any icon placement that needs vertical space must take it from the existing plot area (e.g. `layout.padding` in the chart options, `src/charts/components/line-chart.tsx:108-113`) rather than increasing the chart or panel height.
- **The artboard is 1:1 with app CSS pixels, and its plot width matches; its plot height does not.** Title 16px, tick labels 14px and the 136 x 28 data-mode toggle all match the implementation, so the icons really are 21 x 27 and 27 x 22 on screen. Measured off the artboard's own tick labels, the mockup plot is **202.5 x 200**: x ticks run from "0" centered at 1307.5 to "10" centered at 1510, y ticks from "100" centered at 899 to "0" centered at 1099. The width agrees with the app (WM-25 implemented `chartArea` width 202; measured live at 196.75 when the y-axis maxes at a 3-digit "100"), so **horizontal crowding in the mockup is representative** and the icons take the same fraction of plot width on screen as they do on the artboard. The height does not agree: 200 in the mockup against 276.3 in the app today, or 254.7 after `padding.top: 30`. Note the artboard predates the Chromebook trim (screen created 2026-05-22, commit `367547f` landed 2026-06-09), so it was drawn against the 400px chart, which makes the gap *larger* still, not smaller. Read the mockup's 200px marker line as "full plot height" rather than as a literal length.
- The exported SVGs carry Zeplin's layer GUID in their `<title>` element (e.g. `<title>80CBCDAF-…</title>`), unlike the hand-authored assets in `src/assets/bottom-bar/` whose titles read "Fire Line" and "Helitack". These should be normalized before merge. (Done for `helitack.svg` as part of its 2026-08-19 optimization; `fire-line.svg` still carries its GUID.) On the `?url` import path this is not merely cosmetic: svgo does not run there (only the svgr branch is configured with it), so the GUID ships verbatim, inside a base64 data URI in the fire-line case.
- Existing bottom-bar art is at `src/assets/bottom-bar/fire-line.svg` and `helitack.svg` (both viewBox `0 0 53 45`), imported as React components via svgr in `bottom-bar.tsx:16-19`.
- Pre-existing test-harness gap, worth its own ticket rather than riding along here: `window.test.placeFireLineInZone` (`stores.ts`) places markers but never calls `buildFireLine`, so it leaves `lastFireLineTimestamp` unset and the fire-line annotation is never created. Observed live as `fireLineMarkers: 2` with `lastFireLineTimestamp: null`. `placeHelitackInZone` has no such gap.
- The chart canvas measured a constant **286 x 381** in the running app, and `.rightContent` is a fixed `$rightPanelContainerWidth + $tabWidth` in `app.scss`, so the graph tab is open/closed rather than two sizes. **Fullscreen has since been verified** (see the spike section): Playwright clicks are trusted events, so the app's own fullscreen control does drive `screenfull`, and with `document.fullscreenElement` set the canvas stayed 286 x 381 with a byte-identical `chartArea`. Resizing the viewport to 1600 x 900 changed nothing either, since the panel width is fixed and the 381px height is a prop. So there is no scaling story for the icons to answer.
- **`afterDraw` does no clipping**, unlike the plugin's own label and line drawing, which are clipped to the plot area. Measured with the axis at 30-72 and an event at t=20: the icon renders at x 7.0-34.0, **60.9px left of the y-axis**, floating over the axis-label column with no dashed line beneath it because the line was clipped away. Whichever rendering route is chosen has to suppress icons whose event falls outside the visible x range. **The boundary is now measured rather than left open**: watching an event scroll out of the Show Recent Data window, at `value === scale.min` the plugin still strokes its line, at x 70.25, which is `chartArea.left` to the hundredth, and one hour later, at x 59.90, the line is clipped away. So `value >= scale.min && value <= scale.max` reproduces the plugin's own clipping exactly, with no special case at the edge. At that boundary the icon centers on the y-axis and about half its width overhangs the tick-label column, which the overhang rule above already allows.
- **The icon needs no rounding to sit on its line, and no rounding to stay crisp.** The plugin strokes the annotation line centered on the raw `scale.getPixelForValue(value)` rather than a rounded pixel: measured ink centers were 111.883 against a computed 111.820, and 122.939 against 122.904, i.e. inside 0.07px. So `left = getPixelForValue(value) - iconWidth / 2` with `top = chartArea.top - gap - iconHeight` puts the icon on its own line with no compensation. The fractional `left` that produces (101.32 in the measured case) does not soften the artwork either, because these are SVG images rasterized at the draw position rather than bitmaps resampled onto a fractional offset; a 6x zoom of fractional against integer placement is indistinguishable. Note that this property belongs to the SVG route specifically, so it would have to be rechecked if the PNG fallback is ever taken.
- **Drawing in CSS pixels is correct on a retina display.** Chart.js 2.9 retina-scales the context, so a custom `afterDraw` inherits the same transform the plugin's own line drawing uses. Forced to `devicePixelRatio: 2`, the chart rebuilt with a 572 x 762 backing store at 286 x 381 CSS, `chartArea` stayed in CSS pixels (`top` 30), and line ink centers measured in device pixels and halved matched `getPixelForValue` to 0.004px. The icons drew in the right place at the right size. The dev machine runs at dpr 1, so this was forced rather than observed naturally.
- **Do not rename anything outside the annotation `label` field.** The Hazbot log event is named `"Helitack"` (emitted at `use-helitack-interaction.ts:18` and `stores.ts:85`) and rule-sets 45, 47 and 54 match on that exact string via `translate.ts:50`. It looks like the chart label but is unrelated to it.
- **Icon counts are not small at the top end.** The cooldowns are the only limit: `canUseHelitack` (`simulation.ts:120-127`) gates on `helitackDelay` of 240 minutes (`config.ts:195`), so the button re-enables every 4 simulated hours, about 1.3 real seconds; `canAddFireLineMarker` (`:110-117`) gates on `fireLineDelay` of 1440 minutes (`config.ts:194`). Neither has a run-total cap, and suppression *extends* the run rather than ending it: an unsuppressed `plainsTwoZone` with two sparks stopped at hour 67, while the same setup played at maximum rate was still burning past hour 275. Density and axis length therefore compound. Measured at maximum rate: 37 events in 40 real seconds, 2.86px between adjacent dashed lines in Show All Data, with one 27px helicopter spanning 9 neighbor spacings. Nothing breaks, but do not size anything on the assumption of a handful.

## Out of Scope

- Upgrading `chartjs-plugin-annotation` or Chart.js.
- Growing the chart or the right panel to make room for the icons; the Chromebook fit set in `367547f` is fixed.
- Changing the dashed vertical lines themselves (color, dash pattern, thickness).
- Any change to the bottom-bar Fireline/Helitack buttons or the 3D map markers.
- Legend, axis, or Show Recent Data / Show All Data behavior beyond keeping icons aligned.
- Accessibility work, which this project handles separately.

## Verification

Manual, against a running dev server with the graph tab open:

- Fire line: `window.sim.buildFireLine({ x, y }, { x, y })`. **Not** `window.test.placeFireLineInZone`, which places markers without setting `lastFireLineTimestamp` and so never creates the annotation.
- Helitack: `window.test.placeHelitackInZone(0)`, which does trigger its annotation.
- **Two preconditions on those helpers, both of which fail silently.** First, the model has to be running and past hour 1: both effects are guarded by `if (simulation.timeInHours > 0)` (`graph.tsx:27,46`) and `timeInHours` is `Math.floor(time / 60)` (`simulation.ts:89-91`), so calling either helper on a loaded but never-started model sets the timestamp and produces nothing. Second, each staged event needs `sim.time` to have advanced since the previous one: the effects are keyed on the timestamp *value* and the helpers assign `lastFireLineTimestamp = this.time` (`simulation.ts:684`) / `lastHelitackTimestamp = this.time` (`:706`), so while the model is paused every call after the first writes an identical value, React sees an unchanged dependency, and no annotation appears. Measured while paused: `t0 === t1 === 2740.718`, annotation count unchanged across two `buildFireLine` calls. To stage several events, let the model tick between calls or advance `sim.time` directly.
- Cover: both data modes, an event scrolled out of the rolling window, two events in the same simulated hour, and events at both ends of the axis.
- **Clearing.** Place one of each, then press Restart and confirm no icons remain; repeat with Reload. Both paths run `chartStore.reset()` (`bottom-bar.tsx:324,339`), which sets `this.chart.annotations = []` (`chart-store.ts:37`), so this is confirming the icons follow the annotations rather than outliving them in a separate overlay.
- **Geometry.** With `layout.padding.top: 30`, `chartArea.top` is 30, so the shield's top edge should sit at canvas y = 1 and its bottom at 28, and the helicopter's top at y = 5 and bottom at 27. Check the numbers rather than the look: the shield has one pixel of clearance from the canvas edge, and a 1px crop is invisible in review.
- **Height, the one an overlay breaks by default.** At 1366 x 609, confirm the canvas still measures 286 x 381 and the green graph panel still has its 10px gaps on all four sides. This is the acceptance check for the no-height-change requirement, and it is the one a DOM-overlay implementation fails without trying: the four ancestors between the canvas and the first positioned element (`rightPanelContent`) are all `position: static`, so an overlay added without new CSS sits in flow, pushes the canvas down and breaks the Chromebook fit set in `367547f`.
- Confirm both icons are legible in the running app at the **1366 x 609 Chromebook viewport**, at 100% zoom, before merge. A pre-check is encouraging rather than alarming: both exported SVGs were drawn onto the live 286 x 381 canvas at 1:1 at that viewport, and the helicopter read clearly at 27 x 22 (orange fuselage, blue cockpit glazing, rotor and skids all distinguishable), as did the 21 x 27 shield. Keep the check anyway, since that was one reviewer's eye rather than a student's. If either does not read in place, raise it with Michael for a simplified asset rather than redrawing or rescaling it here, since the artwork choice is deliberate.

- **Production build.** If the implementation takes the `resourceQuery: /url/` route, run `npm run build` and confirm both assets resolve. Keep this as a pre-merge step, but it is no longer an open risk: measured against a production bundle (2026-08-19), **both assets inline** as base64 data URIs that decode byte-identical to their source files (7,290 B and 7,346 B in the bundle), and no SVG is emitted for either. Both resolve, with no console errors in the running build. An earlier measurement the same day, before `helitack.svg` was optimized from 14,211 to 5,488 bytes, emitted it as a hashed file at the dist root instead; that is the behavior to expect if the asset is ever replaced by a larger export. The `/assets/../<hash>.svg` publicPath quirk seen on the dev server does not appear in the production output. The byte-identical inline is also the direct confirmation that svgo does not run on this path, so the `<title>` normalization below is a real change to what ships rather than a tidy-up of the source tree.

Automated: at minimum a unit test over the placement math (given an event time, a plot rect and an axis range, where does the icon go, and is it suppressed when off-window). The drawing itself is not assertable in jsdom, so the visual check stays manual.

## Open Questions

### RESOLVED: Is the exported Zeplin artwork the intended art for both icons?

**Context**: The artboard supplies `Fireline Marker Graph` (21 × 27) and `Helitack ICON Graph` (27 × 22), which I exported to `src/assets/graph/`. They are not simply the bottom-bar icons scaled down: the helitack one is close to the bottom-bar icon at 50%, but the fire line one derives from the **map marker** (the pin shape), not the axe icon on the Fireline button. That means the two icons on the graph come from different visual families, and the fire line icon will not match the button the student pressed.

**Options considered**:
- A) Use both exported graph assets exactly as the artboard specifies.
- B) Use the graph helitack asset, but the bottom-bar axe artwork scaled for fire line, so both icons match their buttons.
- C) Something else, to be confirmed with Michael.

**Decision**: **A**, use both exported assets as designed. The mixed families are deliberate, not an oversight: each graph icon echoes what the student can still see elsewhere on screen. A fire line leaves a persistent shield marker on the 3D map (`FireLineMarkersContainer`, `view-3d.tsx:220`, drawing `assets/interactions/fire-line.png`, which is the same shield artwork), so the graph icon matches the marker. Helitack leaves **no** persistent map marker at all (`use-helitack-interaction.ts` only calls `setHelitackPoint`; its only images are transient cursors), so its graph icon matches the button instead. Verified by rendering all five candidate assets side by side at natural size, 4x and normalized height.

Caveat to watch during implementation: at 27 x 22 the helicopter carries fine detail (rotor, skids, bucket) and might read as a blob against a white plot, where the 21 x 27 shield stays legible. Since checked, and the worry looks unfounded: drawn at 1:1 on the live 286 x 381 canvas at the Chromebook viewport, the helicopter reads clearly. The check stays in Verification anyway. If it does prove illegible in place, that is a follow-up for Michael rather than a reason to change the asset now.

---

### RESOLVED: Where exactly do the icons sit vertically, and do the dashed lines stay?

**Context**: The ticket says "at the top of the graph" and the current labels sit at `labelPosition: "top"` with `labelYOffset: 4`, i.e. inside the plot. The artboard *does* carry placement mockups (inside the `Graphs` group, in both the Show Recent Data and Show All Data variants), which settle it.

Note the height constraint above: the chart is fixed at 381px for the Chromebook viewport, so an icon that sits outside the plot area has to be bought with plot-area padding, which shortens the plotted curves slightly. An icon inside the plot area costs no height but can overlap the data.

**Options considered**:
- A) Icon sits inside the plot area, centered horizontally on the dashed line, top-aligned with a small offset, dashed line retained. No height cost.
- B) Icon sits above the plot area in a padding band, dashed line retained and running the full plot height. Needs a 30px band, of which 21.6px comes out of the plot.
- C) Icon replaces the line's top portion (line starts below the icon), dashed line retained. No height cost.
- D) Dashed lines are removed and the icon alone marks the event.

**Decision**: **B**, icons above the plot area with the dashed lines retained, exactly as the artboard draws it. Design geometry, read off the mockup (design px):

| Layer | Rect | Consequence |
|---|---|---|
| y-axis label `100` | y 891-907, center **899** | the plot's top gridline sits at y 899 |
| `Fireline Marker Graph` | 21 x 27 at y **870-897** | entirely above the plot, 2px gap |
| `Helitack ICON Graph` | 27 x 22 at y **874-896** | entirely above the plot, 3px gap |
| `Fireline marker line` / `Helitack marker line` | 1px wide, **200px** tall, starting y 899 | full plot height, beginning at the gridline, not behind the icon |

Three details beyond "above the plot": the icons are **bottom-anchored rather than top-aligned** (bottoms at 897 and 896, 1px apart, so not flush), which makes the taller shield start higher; each line is **centered under its icon** (line x 1337 against icon center 1337.5); and the line **starts below** the icon rather than running behind it.

This comes out of the plot area via `layout.padding.top`, since the 381px canvas cannot grow. The value is **30** and the margin is one pixel. Swept on the live chart, `chartArea.top` is `max(padding.top, 8.4)`, so above 8.4 the band grows 1:1 with the padding:

| `layout.padding.top` | `chartArea.top` | plot height | shield top edge (y) |
|---|---|---|---|
| 0 (today) | 8.4 | 276.28 | -20.6, clipped |
| 25 | 25 | 259.68 | -4, clipped |
| 28 | 28 | 256.68 | -1, clipped |
| 29 | 29 | 255.68 | 0, flush with the canvas edge |
| **30** | **30** | **254.68** | **1** |
| 32 | 32 | 252.68 | 3 |

The shield needs 29px (27px tall at a 2px gap) against a canvas top edge of y = 0, so 29 is the floor and 30 leaves one pixel. The helicopter is never at risk: at 30 its top edge is y = 5. Rounding down to 28 crops the shield's top row, which is not a failure anyone notices in review.

The alternatives were measured in a harness running the repo's own Chart.js 2.9 and plugin 0.5.7 at the true 286 x 381 canvas:

| Variant | plot height | vs today |
|---|---|---|
| today (labels inside plot) | 273.3px | baseline |
| **chosen**: `padding.top: 30` | **251.7px** | -21.6px, -7.9% |
| rejected: reclaim from legend + axis title | 274.7px | +1.4px, but the legend band drops 38px -> 26px and ends flush with the canvas bottom edge, removing the breathing room WM-25/WM-26 set |

Note the two rigs report slightly different absolute plot heights, 273.3 to 251.7 in the harness against 276.28 to 254.68 in the running app, but the same 21.6px delta. They are not in conflict; prefer the app figures.

The loss lands on an axis that is mostly empty in practice, and it is one line of config to revisit if the compressed plot reads badly in the real app.

---

### RESOLVED: What does "latest-most addition takes highest z-order" mean when icons collide?

**Context**: The ticket states the rule but not the visual result. With icons roughly 21-27px wide on a ~294px-wide plot, two events a few simulated hours apart will overlap substantially, and a purely "draw later on top" rule means the earlier icon can be almost entirely hidden.

**Options considered**:
- A) Pure paint order: later icons simply cover earlier ones, nothing is nudged. Accepts that an earlier icon can be hidden.
- B) Paint order plus horizontal nudging so overlapping icons remain at least partly visible.
- C) Paint order plus vertical stacking (later icons sit lower or higher) so both stay fully visible.

**Decision**: **A**, pure paint order, exactly as the ticket states. Nothing is nudged or stacked.

Verified in a harness at the true canvas with a realistic crowded case (fire line at t=20 plus helitacks at 24, 28, 32 on a 72h run in Show All Data, 2.77 px/hour):

| Strategy | Result |
|---|---|
| paint order only | 11.1px center gaps; icons smear together and the shield nearly vanishes, but the four dashed lines stay individually legible |
| horizontal nudge | icons all readable at 25-28px gaps, but drift from true time reaches **47.8px**, about **17 simulated hours**, and each icon visibly floats off its own dashed line |
| vertical stacking | needs a second ~29px band, dropping the plot from 251.7px to roughly 222px, which the height budget set above forbids |

Nudging trades a readability problem for a correctness problem on a graph whose job is showing *when* things happened, so it was rejected. What makes paint order tolerable is that the **dashed lines remain distinct wherever the events sit at different hours**, so the number of interventions and their timing stay readable from the lines; only the icon artwork degrades.

Crowding is also mode-dependent: in Show Recent Data (~19h window, 10.4 px/hour) two helitacks a cooldown apart sit 41px apart and never touch. The pile-up only appears in Show All Data on long runs.

**The one case the lines do not cover: two events in the same simulated hour.** Annotation `value` is `simulation.timeInHours`, i.e. `Math.floor(time / 60)` (`simulation.ts:89-91`), so x is quantized to whole hours and two events inside one hour get *identical* values rather than merely close ones. Since the two cooldowns are independent (`fireLineDelay` 24h, `helitackDelay` 4h), a fire line and a helitack can do this. Reproduced live on `plainsTwoZone`: both annotations landed at `value: 39` and the chart drew a **single** dashed line with a single label, the later one, on top (`tmp/playwright/wm30-coincident-lines.png`). Under this story that becomes one line and one icon, with nothing indicating two interventions.

Note the earlier icon is **mostly** hidden, not entirely: the two are not stacked concentrically. The shield is 27px tall at a 2px gap and the helicopter 22px tall at a 3px gap, so the shield extends about 6px lower and a yellow wedge stays visible below the helicopter. Confirmed by drawing both assets at the artboard geometry on the live canvas (`tmp/playwright/wm30-topband-4x.png`). That wedge is a side effect of the bottom alignment, not a designed affordance, so it is not something to rely on.

This is accepted rather than fixed. The model runs at **3 simulated hours per real second** (`config.ts:150` sets `modelDayInSeconds: 8`, one model day per eight real seconds, and nothing in `src/` overrides it; the only other references are the ratio math at `simulation.ts:462-473`). Measured live to confirm: 465.5 model minutes elapsed in 2587ms of real time, i.e. 3.00 simulated hours per real second. So one simulated hour is about **333ms**, and it takes two placements within a double-click interval to hit. That does not reopen the paint-order decision above, but the margin is narrower than an earlier draft of this spec claimed (it said 5 h/s and 200ms, which was wrong by two thirds). It is recorded so the "read the count off the dashed lines" argument is not overstated: that argument holds everywhere except inside a shared hour.

---

### RESOLVED: Does the icon keep the white background the text label had?

**Context**: The current labels render on `labelBackgroundColor: "white"`, which keeps them legible where they cross the plotted zone lines. An icon with transparent background will have zone lines and gridlines showing through it.

**Options considered**:
- A) No background; the icon sits directly on the chart.
- B) Keep a white background behind the icon, matching today's label treatment.
- C) White background only where the icon overlaps plotted data.

**Decision**: **A**, no background. The Q2 placement removed the reason for one: the icons now sit in the band above the plot, where there are no gridlines and no curves behind them.

Verified at the axis extremes, where that band is not infinitely wide:

| Case | Result |
|---|---|
| event at t=0 | icon spans x 57.4-78.4, **10.5px past the y-axis** (plot left 67.9), overhanging the tick-label column |
| event at the last hour | icon spans x 253.5-280.5, **13.5px past the plot right**, still inside the 286px canvas |
| either, with white backing | the backing box overhangs identically, so at the left edge it paints over the "100" tick label's column |

That last row rules out B: a backing box does not merely fail to help, it creates a new defect at the left edge. Drawing in `afterDraw` does no clipping to the plot area, so anything the icon overhangs, its backing overhangs too. C never fires, since in this placement the icons never overlap plotted data.

Related detail settled at the same time: **the overhang is allowed, not clamped.** Clamping an extreme icon back inside the plot would slide it off its own dashed line, which is the same correctness problem that ruled out nudging in the overlap question.

---

### RESOLVED: Do the icons need any hover or click behavior?

**Context**: The annotation model supports `expandLabel` with mouse enter/leave/click handlers (`chart-annotation.ts:140-148`), and `LineChart` enables `events: ["click", "mouseenter", "mouseleave"]` on the plugin, but neither of these two annotations uses it today. Icons are less self-explanatory than words, so a tooltip is a plausible addition, and it would also give a way to read an icon that is hidden underneath a later one.

**Options considered**:
- A) No interaction; icons are purely decorative markers, matching today's static labels.
- B) Tooltip on hover naming the event (and possibly its time).
- C) Tooltip on hover, and clicking surfaces the underlying icon when several overlap.

**Decision**: **A**, no interaction. The icons are static markers, as the labels they replace are today.

Two findings from checking what hover would actually cost:

The plugin's annotation hover does not mean "you are pointing at this one". `inRange` for a vertical line uses the annotation's own height as its x-tolerance, and `getNearestItems` then reduces matches to whichever annotation's center is nearest the pointer. Measured with annotations at t=20 and t=50 and synthetic mouse moves: pointing at the t=20 line fired `enter:A`; midway fired `leave:A` with no enter for B; far right, nowhere near either line, fired `leave:B`. It behaves as "nearest annotation anywhere in the plot", which is not a hover affordance.

And after the placement decision the icons are drawn **outside** the plugin in a custom `afterDraw`, so the plugin cannot hit-test them at all. Hover would need custom hit-testing against icon rects on the canvas route, though it comes free on a DOM-overlay route.

So B is real work with no design behind it (nothing specifies a tooltip's content or styling), and it is undiscoverable on the touchscreen Chromebooks this app targets, which weakens it as the answer to the hidden-icon case from the overlap question. Note for later: if the implementation lands on a DOM overlay, a native `title` per icon is nearly free, so B stays cheap to add once there is a design for it.

For context, Chart.js data-point tooltips already exist on this chart (`tooltips` in `line-chart.tsx`); that is the tooltip visible in the artboard mockup. Tooltips on annotations do not exist today.

---

### RESOLVED: Does anything downstream consume the "Fire Line" / "Helitack" label strings?

**Context**: WM-30 is a clone of WM-25 and its parent is AP-80. The graph appears in the running model, and graph state also feeds the outcome data collected for Hazbot (`simulation.getOutcomeData`). This story is presumably only about what is drawn on screen, but it is worth confirming that nothing downstream reads the label strings "Fire Line" or "Helitack" from the graph.

**Options considered**:
- A) Display only; nothing downstream consumes these labels.
- B) Something downstream does consume them and needs updating too.

**Decision**: **A**, display only. Traced rather than assumed.

The two strings exist in exactly one place, `graph.tsx:31` and `:50`, as `Annotation.label` values. Following where an annotation can travel: `chart-data.ts` stores them and exposes `formattedAnnotations`, which only `LineChart` reads when building plugin options; `src/models/chart-store.ts:37` clears them on reset. That is the complete set of consumers. `simulation.getOutcomeData`, which builds the Hazbot outcome payload, never touches annotations or labels.

Every other occurrence of those words is unrelated to the chart:

| Location | What it is |
|---|---|
| `use-helitack-interaction.ts:18`, `stores.ts:85` | the **log event** named `Helitack` |
| `hazbot/wildfire/translate.ts:50`, rule-sets 45/47/54 | rule matching on that log event, plus factor variables named `Fireline` / `Helitack` |
| `bottom-bar.tsx:201,211` | the button captions |
| `ui.ts:8` | an `Interaction` enum value |

**Warning carried into Technical Notes**: the Hazbot log event is literally named `"Helitack"` and rule-sets 45, 47 and 54 match on that string. It reads like the chart label, so a tidy-up during this work could rename it and silently break rule matching, the same trap WM-39 had with `terrainLabels`. This story touches nothing outside the chart annotation's `label` field.

## Self-Review

### Senior Engineer

#### RESOLVED: Icons for events outside the visible window are drawn outside the plot

The Show Recent Data mode shows a rolling window, so an event can scroll off the left. Today's text labels are clipped by the plugin, which paints inside a clipped region. Icons drawn in a custom `afterDraw` are **not** clipped, and neither is the annotation line, which the plugin does clip.

Verified in the harness with the axis set to 30-72 and events at t=5, 20 and 50: the t=20 icon renders at x **7.0-34.0**, i.e. **60.9px left of the y-axis**, floating over the axis-label column with no dashed line beneath it, because the line was clipped away. The t=5 icon lands off-canvas and is harmless.

The spec has no requirement covering this, so an implementation that satisfies every current bullet can still ship orphaned icons over the axis labels. **Resolved**: added a requirement that an icon is drawn only while its event time is within the visible x range, plus a Technical Note recording that `afterDraw` does no clipping and carrying the measured 60.9px overhang. Boundary behavior for an event exactly on the window edge is left to the implementation spec, where the rendering route decides whether it is a coordinate comparison or a CSS overflow rule.

---

#### RESOLVED: "Supported sizes, including collapsed/expanded panel states" is vague and may be vacuous

The requirement asks for correct rendering at "the graph's supported sizes, including the collapsed/expanded graph panel states", but the graph tab toggles the panel **open or closed** rather than between two sizes, and `.rightContent` is a fixed `$rightPanelContainerWidth + $tabWidth` in `app.scss`, so the canvas appears to be a constant 286 x 381 whenever it is visible.

As written the bullet is untestable and implies a variation that may not exist. **Resolved**: the bullet now names the states that genuinely vary (the two data modes, and closing/reopening the tab). Fullscreen moved to a Technical Note as an explicit implementation check rather than an assumption, since `screenfull` needs a user gesture that could not be supplied from the test harness.

---

### QA Engineer

#### RESOLVED: No verification approach, and the obvious manual route silently does nothing

The spec states behavior but never says how any of it is checked, which matters here because the rendering route is undecided and each route is testable in a different way.

There is also a concrete trap I hit while investigating. The documented helper `window.test.placeFireLineInZone(0)` places markers but **does not set `lastFireLineTimestamp`** (observed live: `fireLineMarkers: 2`, `lastFireLineTimestamp: null`), so it never triggers the fire-line annotation effect at `graph.tsx:25-43`. Anyone verifying by hand with the documented helper will conclude the feature is broken. `window.sim.buildFireLine(start, end)` is the path that works.

**Resolved**: added a Verification section naming the manual recipe that works, the cases to cover, and the expected automated coverage. The `placeFireLineInZone` gap itself is recorded in Technical Notes as a pre-existing harness defect deserving its own ticket, since fixing it touches `stores.ts` and is not this story's work.

---

### Product Manager

#### RESOLVED: The overview oversells legibility given the resolved overlap rule

The Overview says the icons let students "read at a glance what happened and when", and the Project Owner Overview says the most recent action "is always the one they can see". The resolved overlap decision means an earlier icon can be **entirely hidden** by a later one (fire line and helitack at the same instant hide the fire line completely), and hover was declined, so there is no way to recover it.

**Resolved**: both overviews rewritten. The Overview now promises seeing *what kind of action and when* rather than reading everything at a glance, and the Project Owner Overview states plainly that an earlier icon can be partly or entirely covered, names the same-instant case, and points at the dashed lines as the complete record. It also records that the alternatives were considered and why they lost, so the trade-off does not read as an oversight.

---

### Student

#### RESOLVED: Icon legibility at 27 x 22 is a caveat, not an acceptance check

The helitack icon carries fine detail (rotor, skids, bucket) at 27 x 22, and the risk that it reads as an orange blob is recorded only as an aside inside a resolved question. A student scanning a running model is exactly the case that would suffer, and nothing in the Requirements obliges anyone to look.

**Resolved**: added as a check in the Verification section, where whoever does the work will actually see it, rather than left in the decision log. It names the Chromebook viewport, identifies the helitack icon as the one at risk, and instructs escalation to Michael rather than a silent redraw, since the artwork choice was deliberate (each icon echoes what the student can still see elsewhere on screen).


---

### Re-review (Senior Engineer)

#### RESOLVED: Two adjacent requirements read as contradictory

The overhang bullet and the newly added in-range bullet were logically compatible (in range but near the edge means draw and overhang; out of range means do not draw) but read in sequence as though the second revoked the first. An implementer skimming the list could have clipped icons at the plot edge, reproducing the clipped-label problem observed in the live app.

**Resolved**: merged into a single bullet that states the visibility rule, the overhang rule and the no-background rule once, in that order. Introduced by the fix for the off-window finding above, so recorded here rather than patched silently.

Nothing else surfaced: the requirements, resolved decisions, Verification section and Technical Notes agree with each other, and every claim traces to a measurement rather than an assumption.

---

## Self-Review: round 2 (multi-role, 2026-08-18)

Roles: Senior Engineer, QA Engineer, Product Manager, Student, Design/Visual QA.
Every finding below was checked against the running app (Playwright at 1366 x 609),
the Zeplin artboard, or a throwaway Jest test before being written down.

### Senior Engineer

#### RESOLVED: The canvas rendering route has no supported way to load these SVGs

Technical Notes offers "two plausible rendering routes, to be settled in the implementation
spec", and says only that the canvas route "needs raster `Image` objects". The build config
makes that a harder constraint than it sounds.

`webpack.config.js:73-121` has exactly one `.svg` rule, with two branches: `issuer:
/\.(css|scss|less)$/` gives `type: 'asset'` (a URL), and `issuer: /\.tsx?$/` gives
`@svgr/webpack` (a React component). There is no branch that yields a URL for an SVG
imported from TSX. PNGs do get URLs (`test: /\.(png|woff|woff2|eot|ttf)$/` with
`type: 'asset'`, plus the `declare module "*.png"` string typing at `src/global.d.ts:8`),
which is why the 3D map can do `img.src = fireLinePng`. `.nosvgo.svg` is not an escape
hatch either: it is excluded from the SVG rule and matches no other rule.

So the canvas route additionally needs one of: a new webpack rule, runtime serialization of
the svgr component (`renderToStaticMarkup` plus a data URI, re-run on every chart
re-creation), or fresh PNG exports from Zeplin. The DOM route is a bare import. The two
routes are not the even trade the note implies, and the implementation spec should choose
with that asymmetry visible.

**Resolved**: added a Technical Notes bullet recording the webpack constraint, the three ways out, and the PNG contrast at `src/global.d.ts:8`. Framed as a price on the canvas route rather than a veto, since drawing both SVGs from a URL into `Image` objects was confirmed working against the live chart.

---

#### RESOLVED: The re-render requirement names a state that cannot change, and misses the one that changes constantly

The bullet reads "Icons render correctly in both graph data modes (Show Recent Data and Show
All Data) and after the graph tab is closed and reopened."

The tab clause is vacuous. `<Graph />` is mounted unconditionally at `right-panel.tsx:36`,
and the panel is a CSS slide (`right: -$rightPanelWidth` to `right: 0`,
`right-panel.scss:6,34-37`). Toggling the tab closed and open again at 1366 x 609 left the
Chart.js instance id (`85`), the canvas backing store (286 x 381), the CSS box and the whole
`chartArea` byte-identical. Nothing unmounts, resizes or remeasures, so no implementation
can fail this clause.

Meanwhile the state that does churn has no requirement at all. `<Scatter redraw={true} />`
(`line-chart.tsx:345`) destroys and recreates the chart on every LineChart update. Instance
ids sampled over about 1.5s of a run: 85, 88, 88, 90, 92, 94, 95, i.e. several
destroy-and-create cycles per second, each rebuilding `options` from the module-level
`defaultOptions` object. Confirmed by setting `layout.padding.top` on the live instance and
watching the next cycle wipe it. `key={chartStore.chartVersion}` (`chart.tsx:37`) is a
second, coarser recreation trigger on reset. Technical Notes mentions both, but "must
survive chart re-creation" never becomes a testable bullet, and it is the condition most
likely to produce a flickering or missing icon (for instance an `Image` that is not yet
decoded on a fresh instance).

**Resolved**: the requirement now reads "Icons render correctly in both graph data modes
(Show Recent Data and Show All Data), and survive the chart being destroyed and recreated,
which happens several times a second while a model runs." Two Technical Notes were added:
one recording the measured instance-id churn, the `options` rebuild from `defaultOptions`,
and what that implies per route; one recording that the tab toggle changes nothing
measurable, so it is not a useful acceptance case. The tab clause was replaced rather than
kept alongside, because a criterion that cannot fail dilutes the list.

---

#### RESOLVED: Technical Note misdescribes how the plugin label is turned off

The note says the label can be suppressed by "omitting `label` on the `Annotation` (see
`chart-annotation.ts:121-134`, which only emits a label block when `this.label` is set)".

A throwaway Jest test against the real model shows otherwise. For `type: "verticalLine"` a
`label` block is **always** emitted (`chart-annotation.ts:93-105`), carrying
`content: this.value`, the hour number. The `if (this.label)` block at 121-134 only adds
`enabled: true` plus the styling. Omitting `label` works for a different reason: the
plugin's `labelDefaults.enabled` is `false`
(`node_modules/chartjs-plugin-annotation/chartjs-plugin-annotation.js:495`).

The conclusion in the spec holds, but the stated reason is wrong, and the residue matters a
little: every annotation keeps a live `content: <hour number>`, so anything that later flips
`enabled` prints hour numbers rather than the old captions.

**Resolved**: the Technical Notes bullet now gives the real mechanism (the label block is always emitted; suppression comes from the plugin's `labelDefaults.enabled: false` and its `view.labelEnabled && view.labelContent` draw gate) and records the leftover `content: <hour number>`.

---

### QA Engineer

#### RESOLVED: The verification recipe has two silent-failure modes

The Verification section correctly warns off `window.test.placeFireLineInZone`, but the
replacement it names, `window.sim.buildFireLine(start, end)`, has two traps of its own. Both
reproduced live.

1. **It does nothing before the first simulated hour.** Both annotation effects are guarded
   by `if (simulation.timeInHours > 0)` (`graph.tsx:27,46`), and `timeInHours` is
   `Math.floor(time / 60)` (`simulation.ts:89-91`). Calling `buildFireLine` on a loaded but
   never-started model sets the timestamp and produces no annotation.

2. **A second call at the same `sim.time` is a no-op.** The effects are keyed on the
   timestamp *value*, and `buildFireLine` assigns `lastFireLineTimestamp = this.time`
   (`simulation.ts:684`). While the model is paused `time` is frozen, so the second and
   every later call writes the identical value, React sees an unchanged dependency, and no
   annotation is added. Measured: `t0 === t1 === 2740.718`, annotation count stayed at 2.

That second one bites precisely the cases the section asks to cover ("two events at the same
instant, and events at both ends of the axis"), because the natural way to stage them is to
pause and call the helper repeatedly.

**Resolved**: added a Verification bullet stating both preconditions, with the measurement,
the line references and the workaround for staging several events. The "Cover" bullet now
says "two events in the same simulated hour" rather than "at the same instant", which is the
condition that actually collides (see the Product Manager finding below).

---

### Product Manager

#### RESOLVED: "The dashed vertical lines stay separate and legible in every case" is false

This claim carries a lot of weight. The Project Owner Overview uses it to justify the
trade-off to a non-technical reader, and the Q3 decision rests on it: "What makes paint order
tolerable is that the dashed lines remain distinct even when the icons overlap, so the number
of interventions and their timing stay readable from the lines; only the icon artwork
degrades."

It is not true when two events share an hour. Annotation `value` is
`simulation.timeInHours`, which is `Math.floor(time / 60)` (`simulation.ts:89-91`), so the x
position is quantized to whole simulated hours. A fire line and a helitack in the same
simulated hour therefore get *identical* values, not merely close ones.

Reproduced live on `plainsTwoZone`: both annotations landed at `value: 39`, and the chart
drew a single dashed line with one label, the later one, on top. Screenshot at
`tmp/playwright/wm30-coincident-lines.png`. There is no visual evidence that two
interventions occurred: not two lines, not two labels, and under this story not two icons
either.

The spec already names this case ("Worst case is a fire line and a helitack at the same
instant, since their cooldowns are independent"), but then keeps asserting the lines are a
complete record. Both cannot hold. The quantization also makes the case wider than "the same
instant": anything inside one simulated hour collides exactly.

**Resolved**: "in every case" and the "complete record" framing are gone from both the
Project Owner Overview and Q3. Both now state that two events in the same simulated hour
collapse to one line and one icon, and both record the wall-clock width of
that window. The case is accepted rather than fixed: it is too narrow to justify reopening
the paint-order decision, and the point of recording it is that the "read the count off the
dashed lines" argument holds everywhere except inside a shared hour.

*Corrected in round 3.* The width recorded here and in Q3 was 200ms, from an assumed 5 simulated
hours per real second. The real rate is 3 h/s (`config.ts:150`, `modelDayInSeconds: 8`), measured
live at 3.00, so the window is about **333ms**. The conclusion is unchanged; the margin is two
thirds wider than stated.

---

### Student

#### RESOLVED: The legibility alarm is overstated, and so is "fully hidden"

Two claims checked by rendering the real exported SVGs onto the live 286 x 381 canvas at
1:1, at the Chromebook viewport, with `layout.padding.top: 30` applied. Screenshots:
`tmp/playwright/wm30-icons-placed.png` and the 4x crop `wm30-topband-4x.png`.

1. **Helitack legibility.** Q1 and the Verification section flag the 27 x 22 helicopter as
   the icon at risk of reading as an orange blob, with an instruction to escalate to Michael.
   Rendered unobstructed at natural size it reads clearly: orange fuselage, blue cockpit
   glazing, rotor and skids are all distinguishable. The 21 x 27 shield is likewise fine. The
   check is still worth keeping, but the framing ("the one at risk") is not supported.

2. **"Fully hidden".** The Project Owner Overview says "a fire line and a helitack in the
   same moment show only the helitack", and Q3 says "the earlier icon is then fully hidden".
   At the artboard geometry they are not stacked concentrically: the shield is 27px tall at a
   2px gap, the helicopter 22px tall at a 3px gap, so the shield extends about 6px lower and
   a yellow wedge stays visible below the helicopter. Visible in the 4x crop.

Neither is a defect, but both are statements a reader will act on.

**Resolved**: the Verification bullet and the Q1 caveat now record the 1:1 pre-check result
and drop the "the one at risk" framing, while keeping the check itself and the escalation
route if it does fail. Q3 now says the earlier icon is mostly rather than entirely hidden,
with the 6px protruding wedge explained and flagged as a side effect of the bottom alignment
rather than an affordance to rely on. The Project Owner Overview's "show only the helitack"
was already replaced while resolving the Product Manager finding above.

Neither half of this was a defect. Recorded because both were statements a reader would have
acted on.

---

### Design / Visual QA

#### RESOLVED: The artboard is not locatable from this spec, and one requirement bullet disagrees with its own geometry table

**Traceability.** The spec cites "the Zeplin artboard *WM-25 Hazbot: Wildfire Graph panel
UI/UX updates*" with no URL. No screen by that name exists in the *GeoHazard Wildfire Design*
project, where every other wildfire artboard lives. The artboard is actually in *Portal, LARA
Authoring, and Activity Player Runtime*:
`https://app.zeplin.io/project/5fe47ae231d1f6a428c53450/screen/6a1042a9053056f90b7b2b43`.
The only way to find it is `specs/WM-25-graph-panel-ui-updates.md:69`. Anyone verifying this
work against design will lose time, and the older `8C: Graphs` artboard in the wildfire
project is a decoy: it carries same-named `Fire Line Marker` / `Helitack ICON` graph markers
at different sizes (24 x 30 and 32 x 27) and a different placement.

**Everything in the Q2 table verifies exactly** against the right artboard:

| Claim | Zeplin |
|---|---|
| `Fireline Marker Graph` 21 x 27 at y 870-897 | x 1327, y 870, 21 x 27 |
| `Helitack ICON Graph` 27 x 22 at y 874-896 | x 1383, y 874, 27 x 22 |
| marker lines 1px x 200px starting y 899 | x 1337 and x 1396, y 899, 1 x 200 |
| `100` tick label y 891-907, center 899 | y 891, h 16, center 899 |
| lines centered under icons | icon centers 1337.5 / 1396.5, line centers 1337.5 / 1396.5 |
| exported assets are these layers | SVG `<title>` GUIDs matched the two exportable layers (helitack's title has since been normalized; both GUIDs are recorded in the implementation spec) |
| map `Fireline Marker` 47 x 60, bottom-bar `Helitack ICON` 53 x 45 | both confirmed |

**Requirement bullet disagrees with the table.** The Requirements say the icons sit
"bottom-aligned to each other with a ~2px gap above the top gridline". The artboard has
bottoms at 897 and 896 and gaps of 2px and 3px, which the Q2 table records accurately.
Implementing the bullet literally puts the helicopter 1px below design and removes the
protruding-shield effect noted in the Student finding above.

**Scale.** The artboard is 1:1 with app CSS pixels (title 16px, tick labels 14px, the
136 x 28 data-mode toggle all match the implementation), so the icons really are 21 x 27 and
27 x 22 on screen.

*Corrected after review.* A first pass estimated the mockup plot at roughly 233px wide by
eyeballing it from the centered "Time (hours)" label, and concluded the icons would be about
19% more crowded on screen than the artboard shows. That was wrong. Measured properly off
the artboard's own tick labels, the mockup plot is **202.5 x 200** (x ticks "0" centered
1307.5 to "10" centered 1510; y ticks "100" centered 899 to "0" centered 1099). The width
agrees with the app to within a few pixels, so horizontal crowding in the mockup is
representative and there is no distortion to warn about. Only the height differs: 200 in the
mockup against 276.3 in the app today, or 254.7 after `padding.top: 30`.

The artboard also predates the Chromebook trim, which is worth recording but does not explain
the height gap: the screen was created 2026-05-22 and `367547f` landed 2026-06-09, so the
mockup was drawn against the 400px chart, whose plot would have been taller still. The trim
moved the app *toward* the mockup, not away from it.

**Resolved**, three changes. Background now carries the artboard URL
(`project/5fe47ae231d1f6a428c53450/screen/6a1042a9053056f90b7b2b43`), names the project it
actually lives in, and warns about the `8C: Graphs` decoy in the wildfire project. The
Requirements bullet now states the real geometry: shield 2px above the top gridline,
helicopter 3px, bottoms 1px apart rather than flush. A Technical Note records that the
artboard is 1:1 with app CSS pixels and that its plot measures 202.5 x 200, so the width
matches the app while the height does not, plus the dating relative to the Chromebook trim.

The Q2 geometry table itself needed no correction: every row verified exactly against the
artboard, including the icon rects, the 1 x 200 marker lines at y 899, the `100` tick label
centered on 899, the exact line-under-icon centering (1337.5 and 1396.5), and the two SVG
`<title>` GUIDs matching the two exportable layers.

---

### Re-review (round 2)

#### RESOLVED: Q2 wording contradicted the corrected requirement bullet

Fixing the placement bullet to say the icon bottoms are "1px apart, not flush" left Q2 still
saying the icons are "bottom-aligned to each other". Same numbers, opposite reading.
**Resolved**: Q2 now says "bottom-anchored rather than top-aligned (bottoms at 897 and 896,
1px apart, so not flush)", which keeps its original point (the taller shield starts higher)
without contradicting the requirement.

---

#### RESOLVED: Three stale internal references

Audited every code reference in the spec. Correct as written: `graph.tsx:187`,
`graph.tsx:31,50`, `chart-annotation.ts:140-148`, `package.json:139`, `translate.ts:50`,
`use-helitack-interaction.ts:18`, `stores.ts:85`, `bottom-bar.tsx:16-19` and `:201,211`,
`ui.ts:8`, `view-3d.tsx:220`, and the plugin's `:838` and `:495`. Three had drifted and are
now fixed:

| Was | Is |
|---|---|
| `graph.tsx:26-42` / `:44-61` (the two effects) | `:25-43` / `:45-62` |
| `line-chart.tsx:105-110` (`layout.padding`) | `:108-113`; 105-107 is the `animation` block |
| `chart-store.ts:37` | `src/models/chart-store.ts:37`, not `src/charts/models/` |

---

### Round 2 close-out

Seven findings raised, all resolved; two re-review items raised, both resolved. No OPEN
items remain in this document.

One correction made during the round, recorded rather than patched silently: the Design
finding's first pass estimated the artboard's plot at about 233px wide and concluded the
icons would be roughly 19% more crowded on screen than the mockup shows. Measuring the
artboard's own tick labels put it at 202.5 x 200, which matches the app's width closely, so
that claim was withdrawn. Only the mockup's plot *height* differs from the app.

Verification basis for this round: Playwright against the running dev server at the
1366 x 609 Chromebook viewport (canvas measured at 286 x 381), the Zeplin artboard via MCP,
a throwaway Jest test against `Annotation.formatted` (since removed), and the pinned
`chartjs-plugin-annotation` 0.5.7 source. Screenshots kept under the gitignored
`tmp/playwright/`: `wm30-coincident-lines.png`, `wm30-icons-placed.png`,
`wm30-topband-4x.png`.

## Self-Review: round 3 (multi-role, 2026-08-18)

Roles: Implementing Engineer, Design / Geometry, Product Manager / Spec Editor, QA Engineer,
Student / Teacher, Performance Engineer. Every finding below was verified against the running
app (Playwright at 1366 x 609, canvas 286 x 381), the repo's own config, or a throwaway Jest
test before being written down.

### Implementing Engineer

#### RESOLVED: Removing the label leaves nothing that says which icon to draw

The Requirements say a fire line event is marked with `fire-line.svg` and a helitack event with
`helitack.svg`. Nothing in the spec says how the renderer tells the two apart, and the
mechanism the Technical Notes recommends removes the only thing that does today.

`Annotation` (`chart-annotation.ts`) has no field for the kind of event. Today the two are told
apart by `label`, which is exactly what this story deletes. A throwaway Jest test over the real
model, building the two annotations exactly as `graph.tsx:28-41` and `:47-60` do but with
`label` omitted, prints:

```
fire-line: {"type":"line","mode":"vertical","scaleID":"x-axis-0","value":39,
            "label":{...,"content":39},"borderColor":"#797979","borderWidth":1,"borderDash":[5,5]}
helitack:  {"type":"line","mode":"vertical","scaleID":"x-axis-0","value":39,
            "label":{...,"content":39},"borderColor":"#797979","borderWidth":1,"borderDash":[10,5]}
differing keys: [ 'borderDash' ]
```

`borderDash` is the *only* difference. So an implementer following the Technical Note lands on
one of:

- key the icon off `dashArray` (`[5,5]` = shield, `[10,5]` = helicopter), which silently couples
  icon choice to a dash pattern that Out of Scope forbids anyone from changing, and which
  `graph.tsx:13-14` shares with the zone-1 and zone-2 dataset line styles;
- keep `label` and add an explicit opt-out (the second option the note already offers), which
  preserves the discriminator but leaves a "Fire Line" string on a model whose label no longer
  renders;
- add a field to `Annotation`, which nothing in the spec authorizes.

These are not equivalent, and the choice is a requirements-visible one: it decides whether the
annotation model carries the event kind. The spec should name the discriminator rather than
leave it to be rediscovered.

**Checked against the design.** The dash difference is drawn in the artboard mockup, so it is
deliberate rather than incidental, but it is **not recoverable from Zeplin**: all four
`Fireline marker line` / `Helitack marker line` layers across both mockup variants report an
identical `1.5px center #797979`, with no dash data in either the CSS projection or the raw
screen JSON (`keys: id, sourceId, type, name, rect, fills, borders, shadows, opacity, blendMode,
borderRadius, rotation, exportable`). Sketch rendered the dashes into the artboard bitmap and the
import dropped the pattern, so there is no redline to cite and anyone who looks will repeat the
dead end. The icon/line pairing does verify: the shield at x 1327 w 21 centers on 1337.5 against
a line at 1336.5, and the helicopter at x 1383 w 27 centers on 1396.5 against a line at 1395.5.

**Checked against the running app.** Both annotations reach the plugin with the expected styling
(fire line `value: 16, borderDash: [5,5]`, helitack `value: 21, borderDash: [10,5]`, both
`borderColor: "#797979"`, `borderWidth: 1`), and the difference survives to the screen: sampling
each line's pixel column down the plot gives repeating runs of 6 on / 4 off for the fire line and
11 on / 4 off for the helitack, the 10px and 15px periods of `[5,5]` and `[10,5]`. The same
screenshot incidentally shows today's two text labels colliding into "Fire Helitack" at only 5
hours apart, which is the problem this story is fixing.

**Resolved**, two changes. A Requirements bullet now states that the annotation records which kind
of event it marks rather than the renderer inferring it from the dash pattern. A Technical Note
records the measured `[ 'borderDash' ]` diff, the fact that the dash difference is designed,
implemented at `graph.tsx:13-14` and frozen by Out of Scope but absent from Zeplin's layer data,
and why an explicit discriminator is preferred: array-comparing `[5,5]` against `[10,5]` works
today but fails silently, with no type error, if the patterns are ever unified.

---

#### RESOLVED: The route comparison credits the DOM route with a property it does not have, and omits the canvas precedent sitting in the same file

Two claims in Technical Notes price the DOM route below the canvas route:

> "The DOM route can reuse the SVGs as React components and gets 'latest on top' from document order"
> "on the DOM route the overlay lives outside the canvas and is unaffected"

The second is false in the part that matters. The overlay's *drawing* is unaffected by chart
re-creation; its *coordinates* are not, because they come from `getPixelForValue` on the chart
instance, and that instance is replaced several times a second. Measured during a run on
`plainsTwoZone`:

| | |
|---|---|
| instance ids over 1.5s | 189 → 197, i.e. 8 recreations, about 5.3/s (16 over 2.6s in a second sample, 6.2/s) |
| stale instance's canvas still in the document | **no** (`document.contains(stale.canvas) === false`) |
| stale `getPixelForValue(5)` | 59.90, and it still answers rather than throwing |
| live `getPixelForValue(5)` at the same moment | 18.48 |
| error from holding the reference 1.5s | **41.4px** on a 197px plot, about 15 simulated hours |

That is larger than the 47.8px drift used to reject horizontal nudging in Q3, and it fails
silently: a destroyed Chart.js 2.9 instance keeps returning last-known pixel values.

The DOM route also is not "a bare import". There is no `ref` to the chart instance anywhere in
the repo (`<Scatter>` at `line-chart.tsx:339-347` takes none), and the canvas has four
`position: static` ancestors before the first positioned one, `rightPanelContent`
(`line-chart-container` x2, `chart-container`, `graph.scss .chartContainer`), so an absolutely
positioned overlay has no anchor until new CSS is added.

Meanwhile the canvas route has an in-repo precedent the spec never mentions: `line-chart.tsx`
already ships two custom Chart.js plugins that draw on the canvas in `afterDraw` and are
registered alongside the annotation plugin at `:346`. `yAxisLinePlugin` (`:64-80`) reads
`chart.chartArea` and strokes into `chart.ctx`, which is exactly the shape an icon renderer
needs, and it gets the live instance handed to it on every draw, so the staleness problem above
cannot arise.

The note's asymmetry is therefore backwards from how it reads: the canvas route pays for asset
loading once at build time and inherits a working pattern; the DOM route pays in ref plumbing,
new CSS, and a re-measurement obligation on every chart re-creation.

**Resolved**, both Technical Notes rewritten. The two-routes note now names the existing
`legendPlugin` / `yAxisLinePlugin` precedent with line refs, and records the DOM route's two
hidden costs (no `ref` anywhere in the repo, four `position: static` ancestors before the first
positioned one). The re-creation note now replaces "the overlay lives outside the canvas and is
unaffected" with the measured staleness result: 41.4px of silent drift from a 1.5s-old reference,
against a live instance, on a 197px plot. Left as a comparison rather than a decision, since the
route choice belongs to the implementation spec; the point is that the asymmetry runs the
opposite way from how the note read.

---

### Design / Geometry

#### RESOLVED: The icon band has exactly 1px of slack, and the spec describes it as "~30px"

The Requirements say the space "comes out of the plot area (`layout.padding.top`)" and Q2 says
"the ~30px this needs". Approximate language is wrong for this number. Swept live on the
running chart:

| `layout.padding.top` | `chartArea.top` | plot height | shield top edge (y) |
|---|---|---|---|
| 0 (today) | 8.4 | 276.28 | -20.6 (clipped) |
| 25 | 25 | 259.68 | -4 (clipped) |
| 28 | 28 | 256.68 | **-1 (clipped)** |
| 29 | 29 | 255.68 | 0 (flush with the canvas edge) |
| **30** | **30** | **254.68** | **1** |

`chartArea.top` is `max(padding.top, 8.4)`, so above 8.4 the band grows 1:1 with the padding.
The shield needs 29px (27px tall at a 2px gap) and the canvas top edge is y = 0, so **29 is the
minimum and the chosen 30 leaves one pixel**. An implementer who reads "~30" and rounds to 28
loses the top row of the shield, and the failure is a 1px crop that no reviewer will notice.

The helicopter is not at risk either way: at `padding.top: 30` its top edge is y = 5.

This also gives the plot-height number for the app rather than the harness: 276.28 today,
254.68 after, a loss of 21.6px (7.8%). The spec currently carries 273.3 → 251.7 from the
harness in Q2 and 276.3 → 254.7 from the app in a Technical Note, which are the same delta
measured on two different rigs but read as a contradiction.

**Resolved**, three changes. The Requirements bullet now states the value is 30 rather than
"~30px", gives the `max(padding.top, 8.4)` rule, names 29 as the floor below which the shield
clips, and records the 21.6px plot loss. Q2 carries the full sweep table in place of "the ~30px
this needs". A line in Q2 reconciles the harness figures (273.3 to 251.7) with the app figures
(276.28 to 254.68) as the same delta on two rigs rather than a contradiction, and points at the
app numbers as the ones to prefer.

---

### Product Manager / Spec Editor

#### RESOLVED: The simulated-time rate is wrong by two thirds, and it is the number that justifies accepting a known defect

The same-hour collapse (two events in one simulated hour draw one line and one icon) is accepted
rather than fixed, and the argument for accepting it is that the window is too narrow to hit.
That argument is stated twice with a specific number:

- Project Owner Overview: "In wall-clock terms that window is about a fifth of a second"
- Q3: "At roughly 5 simulated hours per real second, one simulated hour is about 200ms, so it
  takes two placements within a double-click interval to hit"

Both are wrong. `config.ts:150` sets `modelDayInSeconds: 8`, and nothing overrides it anywhere in
`src/` (the only other references are the ratio math at `simulation.ts:462-473`). One model day
in eight real seconds is **3 simulated hours per real second**, so one simulated hour is about
**333ms**, not 200ms. Measured live to confirm: 465.5 model minutes elapsed in 2587ms of real
time, i.e. 3.00 simulated hours per real second.

The window is therefore two thirds wider than the spec claims. The conclusion survives, since
333ms is still inside a typical double-click threshold, but the margin is thinner than stated and
the number appears in the paragraph written for a non-technical reader.

**Resolved**, three places corrected. The Project Owner Overview now says "about a third of a
second". Q3 gives the rate with its source (`config.ts:150`, `modelDayInSeconds: 8`, no override
in `src/`, ratio math at `simulation.ts:462-473`), the live confirmation (465.5 model minutes in
2587ms, 3.00 h/s), the 333ms figure, and a note that an earlier draft was wrong by two thirds.
The closed round-2 Product Manager finding, which also carried "roughly 200ms", now ends with a
dated correction pointing at the real number rather than being edited silently. The
accept-rather-than-fix decision is unchanged.

---

### QA Engineer

#### RESOLVED: Three requirements have no verification step, including the one the implementation is most likely to break

The Verification section's coverage list is "both data modes, an event scrolled out of the
rolling window, two events in the same simulated hour, and events at both ends of the axis",
plus the legibility check. Mapped against the ten requirement bullets, three have nothing:

| Requirement | Covered by |
|---|---|
| Icons cleared when chart data is cleared | nothing |
| Shield 2px above the top gridline, helicopter 3px, bottoms 1px apart | nothing |
| **Overall height of the chart and the graph panel does not change** | nothing |

The last is the one that matters, because it is the requirement a DOM-overlay implementation
breaks by default. The four ancestors between the canvas and the first positioned element are
all `position: static`, so an overlay added without new CSS is in flow and pushes the canvas
down, growing the panel past the Chromebook fit that `367547f` set. There is no step telling
anyone to measure it.

The other two are cheap to check and currently rest on inspection: annotations are cleared via
`chartStore.reset()` on both Restart and Reload (`bottom-bar.tsx:324,339` →
`chart-store.ts:33-38`, `this.chart.annotations = []`), and the 2px/3px offsets are the geometry
the artboard specifies and the previous finding shows is 1px from clipping.

**Resolved**: three bullets added to Verification, one per uncovered requirement. The clearing
bullet names Restart and Reload and says what it is really testing (that the icons follow the
annotations rather than outliving them in a separate overlay). The geometry bullet gives the
expected canvas y values (shield 1 to 28, helicopter 5 to 27) and says to check the numbers
rather than the look, since a 1px crop is invisible in review. The height bullet names the
286 x 381 canvas and the 10px panel gaps at 1366 x 609, and records that it is the check a DOM
overlay fails by default.

---

### Student / Teacher

#### RESOLVED: "The number of icons per run is small" is not true, and the dashed-line argument has a density bound

Q3 rejects nudging and stacking on one measured crowded case, four icons at 11.1px center gaps,
and Technical Notes generalizes that to "the number of icons per run is small".

Staged the ceiling instead: `plainsTwoZone`, two sparks, a helitack every 4 simulated hours and a
fire line every 24, which is exactly what the cooldowns allow. Result: **37 events in 40 real
seconds**, and suppression *extended* the run rather than ending it (an unsuppressed baseline of
the same setup stopped at hour 67; this one was still burning past hour 275), so density and axis
length compound. In Show All Data at that point the adjacent dashed lines sit **2.86px** apart and
one 27px helicopter spans 9 neighbor spacings. The lines render as a solid hatched block; nothing
is countable from them.

That bounds, but does not overturn, the argument Q3 leans on: "the dashed lines remain distinct
wherever the events sit at different hours, so the number of interventions and their timing stay
readable from the lines". True at ordinary density, false at the ceiling.

**Resolved, deliberately minimal.** The decision is unchanged and no alternative would do better
here (nudging 31 icons apart needs 837px of a 197px plot; stacking them needs a band taller than
the chart), so Q3 and the Project Owner Overview were left alone. Only the Technical Notes claim
was corrected, since that is the line an implementation might be sized against. Recorded here so
the density bound on the dashed-line argument is not re-derived later and mistaken for a bug.

---

### Performance Engineer

No finding. The chart is destroyed and recreated 5 to 6 times a second during a run (measured
above), but the per-draw cost of the icons is 2 to 18 `drawImage` calls on the canvas route, or
the same number of absolutely positioned nodes on the DOM route, against a full Chart.js
teardown and rebuild happening anyway. The decode hazard the spec already records (module-level
`Image` rather than per-instance) is the only real cost, and it is already recorded.

---

### Round 3: checked and not defects

Recorded so the round is legible, since each of these looked like a finding until measured:

- **Duplicate SVG ids on the DOM route.** `webpack.config.js:108-116` documents a real collision
  (the Forest icon hijacking Forest-with-Suppression's masks) and adds `prefixIds` to namespace
  ids *per file*, not per instance, so N copies of one icon would still repeat ids. Harmless
  here: neither exported asset contains a `<mask>`, `<defs>`, `<use>`, `xlink:href` or `url(#…)`,
  so no id is ever referenced.
- **`defaultOptions` being shared.** `layout.padding.top` lives on a module-level object, but
  `LineChart` is used only by `Chart` (`chart.tsx:29`), which is used only by `Graph`
  (`graph.tsx:181`), so setting it there reaches no other chart.
- **Code references.** All 24 cited locations re-audited and correct, including the three round-2
  fixed. One imprecision: `package.json:139` reads `"chartjs-plugin-annotation": "^0.5.7"`, a
  caret range rather than a pin, though the argument is unaffected since `^0.5.7` cannot reach
  the 1.x line where image labels appear. Installed version is 0.5.7.
- **Chart geometry while the graph tab is closed.** Confirmed again: canvas stays 286 x 381 and
  `chartArea` stays identical with the panel slid off-screen (`panelRect.x` 1381 at a 1366px
  viewport), so the round-2 conclusion holds.

---

### Round 3 close-out

Six findings raised, all resolved. No OPEN items remain in this document.

Two residues left deliberately rather than fixed:

- The Project Owner Overview still says an earlier icon's "dashed line stays separate and legible,
  so the number of interventions and their timing remain readable". That holds at ordinary density
  and not at the ceiling, per the last finding. Left as written because the paint-order decision is
  unchanged, no alternative does better at that density, and the section is written for a reader
  this spec does not currently have.
- The `^0.5.7` caret range is described elsewhere as a pin. Harmless, since the caret cannot reach
  the 1.x line where image labels appear.

Verification basis for this round: Playwright against the running dev server at the 1366 x 609
Chromebook viewport (canvas 286 x 381), reading the live Chart.js instance through the React
fiber; a throwaway Jest test over `Annotation.formatted` (since removed); the Zeplin artboard via
MCP, including a raw screen dump; and `src/config.ts` plus `src/models/simulation.ts` for the
timing and cooldown figures. Screenshots were taken but are not cited: they live in the gitignored
`tmp/playwright/` and would be dead pointers by the time anyone followed them. The three round-2
screenshot references have the same weakness.

## Pre-implementation spike (2026-08-19)

Six assumptions this document leaves for the implementation spec were checked against a
working spike rather than reasoned from the code. The spike was the shape the
implementation would actually take: a `{ resourceQuery: /url/, type: 'asset' }` branch in
the webpack SVG rule, a `declare module "*.svg?url"` block, an `eventKind` field on
`IChartAnnotation` passed through `formatted`, `layout.padding.top: 30` in
`defaultOptions`, and an `iconPlugin` registered after `ChartAnnotation` that draws both
exported SVGs in `afterDraw`. Run on a dev server at the 1366 x 609 Chromebook viewport,
canvas 286 x 381, `plainsTwoZone`, with the labels removed. The spike was reverted
afterwards, so nothing from it is in the tree.

**1. The canvas route can load these SVGs.** The `?url` branch compiles under webpack 5.85
and ts-loader and resolves at runtime, at a cost of about six lines of build config. Both
`Image` objects reported `complete` with correct natural sizes (21 x 27 and 27 x 22) before
the chart's first draw: the emitted helitack file was fetched in 13.5ms, before
DOMContentLoaded, and the fire-line data URI needs no fetch at all. The module-level decode
hazard is real but comfortably won, since a user has to clear Terrain Setup, place sparks
and run past hour 1 before any annotation exists. Two side effects worth carrying: the 8KB
inline threshold treats the two assets differently (one inlined, one emitted), and svgo does
not run on this path.

**2. An explicit discriminator survives to the draw hook.** `eventKind` reaches
`chart.options.annotation.annotations[i].eventKind` inside a custom `afterDraw`, in push
order, so chronological order and therefore "latest on top" come for free from
`addAnnotation` (`chart-data.ts:164-168`). Plugin 0.5.7 ignores the unknown key: both lines
drew normally with their correct dash patterns and no console errors. The residual
`label.content` predicted in round 2 was present and inert, carrying the hour numbers 30 and
38.

**3. Placement needs no rounding.** The plugin strokes on the raw `getPixelForValue`, so an
icon centered on the same value sits on its own line to within 0.07px, and the resulting
fractional `left` does not blur SVG artwork. Recorded as a Technical Note above.

**4. `layout.padding.top: 30` behaves in source exactly as the live sweep predicted.** Set
in `defaultOptions` rather than poked onto an instance that the next redraw wipes:
`chartArea.top` exactly 30, bottom 284.68 (plot 254.68), canvas unchanged at 286 x 381 CSS,
shield top 1 and bottom 28, helicopter top 5 and bottom 27. Legend, axis title and gridlines
did not move. This is the first end-to-end confirmation of the height requirement, since
every earlier figure came from a mutated instance.

**5. The in-range rule matches the plugin's clipping exactly.** `value >= scale.min &&
value <= scale.max`, with no special case at the edge. Measured while an event scrolled out
of the rolling window; recorded in the `afterDraw` clipping note above.

**6. Fullscreen and retina are both non-issues.** Fullscreen leaves the canvas and
`chartArea` identical, as does a 1600 x 900 viewport, and a forced `devicePixelRatio: 2`
rebuild draws the icons correctly in CSS pixels. Recorded above, in the fullscreen note and
a new Technical Note.

**The production build, left unverified by this spike, has since been verified.** The spike
exercised the dev server only. `npm run build` was run against the full implementation on
2026-08-19: webpack 5.85 compiles, inlines `fire-line.svg` as a base64 data URI decoding
byte-identical to the source, and (as measured at the time, before that asset was optimized) emitted `helitack.svg` as a hashed file at the dist root. The
`/assets/../<hash>.svg` publicPath quirk is a dev-server artifact and does not appear in the
production output. Recorded in Verification above, where the build check is retained as a
pre-merge step rather than as an open risk. Nothing in this document is now unverified.

**Incidental.** The stale-chart-instance hazard from round 3 reproduced by accident: a
reference held across about a second of a run kept answering with pixel values from a scale
window that had already moved on. Not a paired same-moment measurement, so it corroborates
the round-3 finding rather than adding to it.

**What this settles for the implementation spec.** The rendering route can be chosen on
measured cost rather than on the asymmetry argument alone; the placement math and the
in-range rule are exact formulas; the discriminator mechanism is confirmed; and fullscreen
and retina drop off the risk list.
