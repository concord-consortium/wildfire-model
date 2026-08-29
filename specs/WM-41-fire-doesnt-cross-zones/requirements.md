# WM-41: Hazbot: There is an intermittent bug where the fire doesn't cross zones

**Jira**: https://concord-consortium.atlassian.net/browse/WM-41
**Repo**: https://github.com/concord-consortium/wildfire-model
**Status**: **Investigation complete, fix blocked on Open Questions**

## Overview

The reported screenshot is reproduced exactly, and there is no race and no defect in the zone-crossing code, because there is no zone-crossing code: fire crosses a boundary by the same rule it crosses any other cell pair. What produces a hard vertical wall on the boundary is a combination of two calibrated behaviors. `getFireSpreadRate` reads fuel and moisture from the cell being ignited, so `Forest` (0.3 to 1.3 cells per model day) reads as a wall next to `Grass` (13 to 46); and `endOfLowIntensityFire` stops any cell whose burn index is Low from passing fire on, which measurement shows is 100% of Forest cells and 99% to 100% of Plains cells on every heightmap and drought level. The daily coin flip behind that flag is where "intermittent" comes from. All four candidate fixes below are calibration and product decisions rather than code defects, so the Open Questions are the deliverable of this story and no implementation is proposed until they land.

## Project Owner Overview

A student puts one spark in each zone, watches, and the fire in one zone grows into a blob with a knife-straight edge running down the zone boundary while the other zone barely burns at all. Nothing is broken in the sense of a crash or a bad branch. The fire model simply moves 15 to 40 times faster through grass than through forest, and forest never gets hot enough to survive the rule that says a low-intensity fire eventually goes out on its own. Put forest on one side of the boundary and grass on the other and the boundary looks like a fence.

That same rule is why it looks intermittent. The "low-intensity fire goes out" check is a coin flip that runs once per model day, at 60% on day 1 rising to certainty by day 5. Where it lands decides how far the fire got before it froze, so the same setup, same sparks, run twice, produces visibly different burns. Measured over 40 seeds, one setup crossed 9, 17, 27 or 37 cells into the far zone depending only on which day the flip came up.

The fix is a question about what the model should teach, not about what the code should do, so it is Trudi's to answer or to route. Not Sam's: he owns the Hazbot rules, and none of this is a rules question.

## Background

**Where the report came from.** The ticket has no description; the whole of it is Trudi's comment on 2026-08-19, quoting **ISLAND workshop feedback**: *"Users experience a weird behavior where the fire should be crossing between zones and does not. An example screenshot is attached."* So the reporter is a teacher at the workshop, relayed by Trudi, and "should be crossing" is their expectation rather than a stated requirement. That distinction is what the third Open Question turns on.

**The reported screenshot was reproduced from the image alone**, using the river as a coordinate reference. `river-texmap.png` is fixed, so its projected curve identifies the camera: fitting a uniform scale and translation between the screenshot's river and a live render matches to **2.1 px RMS across 904 image columns**, which then converts any screenshot pixel into model feet.

That recovers the setup as two zones, Hills left and Plains right, **mild drought in both** (the olive terrain color is the mild-drought value in `terrain-colors.ts`), with sparks at model **(36350, 27600)** in the left zone and **(66075, 40750)** in the right. Re-running that with **Forest** in the left zone and **Shrub** in the right puts the straight edge at image column **430 against 429** in the screenshot, with the burn's bounding box within 9 px. The reproduction image lives on the Jira ticket.

**The straight edge is the zone boundary.** `DEFAULT_ZONE_DIVISION` (`simulation.ts:21`) splits two zones down the middle, so the boundary is grid column 120/121 at model x = 60000, and the reproduction's leftmost burnt cell is column 121. It looks perfectly vertical on screen because the design camera sits at x = 0.5 in view units looking straight along +y, so that one model column, and only that one, projects to a vertical line: measured, it lands at screen x = 700 at the near edge, the middle and the far edge alike.

Everything else that could have drawn a straight line was ruled out. The `*-plains` heightmaps blend smoothly across the boundary (largest adjacent column-mean step is 142 ft, and it is at x = 103, not at the boundary; the per-row step across x = 120 to 121 is smaller than across x = 60 to 61). The unburnt-island masks are organic blobs with no axis-aligned edges. The nonburnable border band is at columns <= 1 and >= 238. The river is visible in the screenshot and is elsewhere.

## Reproduction

Two sparks, at the positions recovered from the screenshot. `addSpark` takes **model feet**, and the exact cell matters: the right-hand spark has to be close enough to the boundary that the front reaches it before the daily flip freezes the fire, and far enough in that the blob is recognizable.

| | model ft | grid cell | zone |
|---|---|---|---|
| left spark | **(36350, 27600)** | (72, 55) | 0, Hills + Forest |
| right spark | **(66075, 40750)** | (132, 81) | 1, Plains + Shrub |
| zone boundary | x = 60000 | between columns 120 and 121 | |

So the right-hand spark sits **11 cells** in from the first column of its own zone.

Everything needed is on the debug globals `stores.ts:33-37` already exposes: `window.sim` (the `SimulationModel`), `window.test` (the placement helpers), and `window.TerrainType` / `window.Vegetation` / `window.DroughtLevel` (the enums, so the zone literals below do not have to be written as bare numbers). Load `http://localhost:8080/?preset=hillTwoZone&showBurnIndex=false&showZoneLines=true` and paste, verbatim, into the console:

```js
const { TerrainType, Vegetation, DroughtLevel } = window;
window.sim.load({
  zonesCount: 2,
  zones: [
    { terrainType: TerrainType.Foothills, vegetation: Vegetation.Forest, droughtLevel: DroughtLevel.MildDrought },
    { terrainType: TerrainType.Plains,    vegetation: Vegetation.Shrub,  droughtLevel: DroughtLevel.MildDrought },
  ],
});
await window.sim.dataReadyPromise;   // load() refetches the heightmap; starting before it resolves silently no-ops
window.sim.addSpark(36350, 27600);   // model feet, not grid cells, not pixels
window.sim.addSpark(66075, 40750);
window.sim.start();
```

On the URL: the preset only supplies a two-zone shape for `load()` to overwrite, so any two-zone preset works. `showBurnIndex=false` matches the screenshot, where the active front is plain red rather than intensity-colored. `showZoneLines=true` draws the boundary so the edge can be seen landing on it, and is the one thing here the screenshot did *not* have.

**The rest of the conditions are defaults, and all of them matter:** wind at 0 mph (any wind pushes the blob into a teardrop and hides the effect), no fire line and no helitack (both make cells nonburnable or wetter, which is a second way to get a straight edge and would confound this one), `unburntIslandProbability` at 0.5, and `modelDayInSeconds` at 8. Nothing needs to be passed to get those; just do not change them.

**Do not use `window.test.placeSparkInZone(0)` / `(1)` here.** It places at the zone *center*, cell (180, 79), which is **59 cells** from the boundary column: far enough that the fire freezes long before it arrives. It is the right helper for most work in this repo and the wrong one for this reproduction.

**Expect, by model day 3** (about 24 seconds of wall clock at the default speed), and confirmed by running exactly the block above:

```js
// leftmost burnt column in zone 1 is the number that matters: 121 is the boundary column
const sim = window.sim;
let burnt = [0, 0], leftmostInZone1 = sim.gridWidth;
for (const c of sim.cells) if (c.fireState !== 0) {
  burnt[c.zoneIdx]++;
  if (c.zoneIdx === 1 && c.x < leftmostInZone1) leftmostInZone1 = c.x;
}
// => burnt [22, 339], leftmostInZone1 121, sim.simulationEnded false,
//    sim.engine.endOfLowIntensityFire true
```

That is: the right-hand fire is a blob roughly 20 cells across whose left edge is a straight vertical line sitting on the boundary; the left-hand spark has burnt about 20 cells and stopped; and **the run is still going and will not end** (see Requirements). The two burn counts vary with the day the flip lands on, but `leftmostInZone1` is 121 or 122 every time. Reproduced this way the straight edge falls at image column 430 against 429 in the screenshot, with the burn's bounding box within 9 px.

By hand instead of by console: Setup with Hills + Forest on the left and Plains + Shrub on the right, mild drought both, then place one spark in each zone with the right-hand one a short way in from the middle. The effect does not depend on hitting the exact cells; the coordinates above are what makes it match the screenshot pixel for pixel.

Note the seed sweeps in Technical Notes use a **different, single spark at (63000, 40000)**, 6 cells from the boundary, chosen so the front reaches the boundary early enough that the flip's timing is the only variable. That is a measurement setup, not this reproduction.

## Requirements

These hold whichever way the Open Questions land.

- **Whatever changes, a Plains zone and a Forest zone must stop reading as a wall.** The acceptance shape is the Reproduction above. Today the fire enters the forest zone by 2 cells in 60% of runs. That number is what a fix has to move.
- **A run must end.** `simulation.simulationEnded` reads `engine.fireDidStop`, which only becomes true once no cell is burning and no cell holds a finite pending ignition time (`fire-engine.ts:168-172`). With Forest in a zone, a pending ignition can be 7 to 10 model days out, so 40/40 seeds were still running at 5 model days. Until that terminates, `SimulationEnded` never logs and the Hazbot never sees the run finish.
- **Any recalibration is covered by a test that fails on the current constants.** The natural shape is a table-driven assertion over `getFireSpreadRate` at each vegetation and drought level, bounding cells-per-model-day into an agreed band. The mutation it must catch is reverting `FuelConstants` to today's Forest row.
- **`get-fire-spread-rate.ts:126` is corrected regardless of the outcome.** It reads `const e = 0.715 * (-0.000359 * sav);` where Rothermel's E is `0.715 * exp(-0.000359 * sav)`, so `e` comes out negative and the sign of the packing-ratio exponent inverts in both `windFactor` and the inverted effective-wind-speed equation. This is a transcription error, not a tuning choice. It is not what produces the edge, and correcting it will move rendered burn shapes, so it wants its own before-and-after.

## Technical Notes

Measured on 2026-08-28 by driving the real `FireEngine` headlessly against the real heightmap PNGs with a seeded PRNG, and cross-checked in the running app via `window.sim`.

**Spread rate is a property of the cell being ignited.** `getFireSpreadRate` takes `FuelConstants[targetCell.vegetation]` and `targetCell.moistureContent`, so a vegetation change at the boundary is a step change in speed with nothing gradual about it. Minutes for the front to advance one 500 ft cell on flat ground, straight from the shipped code:

| vegetation | no drought | mild | medium | severe |
|---|---|---|---|---|
| Grass | 111 | 62 | 50 | 31 |
| Shrub | 349 | 184 | 139 | 77 |
| Forest | 4172 | 2280 | 1800 | 1077 |
| Forest with suppression | 805 | 432 | 332 | 191 |

In cells per model day: Grass 13 to 46, Shrub 4 to 19, **Forest 0.3 to 1.3**. The grid is 240 cells wide, so a zone is about 120 across.

**The two slowest fuel models were never calibrated.** `get-fire-spread-rate.ts:32-33` carries *"the following two land types have not yet been configured via specification, only by approximation to get the code to compile"* over the `Forest` and `ForestWithSuppression` entries. Those are exactly the two rows that produce the symptom.

**Moisture damping is a function of drought alone.** Every `moistureLookups` row (`zone.ts:11`) is the same fraction of that vegetation's `mx`, so `moistureContent / mx` is 0.85, 0.6, 0.35 and 0.1 at the four drought levels for all four vegetations. All of the vegetation-to-vegetation difference is in the fuel constants, none of it in the moisture table.

**`endOfLowIntensityFire` is a permanent wall wherever the burn index cannot clear Low.** Once the flag is set (`fire-engine.ts:155`), `fireShouldSpread` (`fire-engine.ts:198`) requires the igniting cell's burn index to be above Low. Scanning every cell of each real heightmap for the highest rate it could be ignited at, then bucketing by `Cell.burnIndex` (`cell.ts:93`):

- **Forest is Low in 100% of cells on every terrain and every drought level.** Its highest reachable rate is 4.4 ft/min on foothills at no drought and 27.1 on mountains at severe, against a Low/Medium threshold of 25.
- **Plains is Low in 99% to 100% of cells for every vegetation**, because there is no slope to boost the rate. Grass at severe drought is the only combination with any cells above Low, at 0.6%.
- Foothills and Mountains with Grass or Shrub reach Medium or High in 19% to 81% of cells, which is the only place a fire keeps running after the flag.

So the rule reads, in practice, as "fire on flat ground and fire in forest goes out on its own," and the burn scar's edge lands on the boundary column because that is where the vegetation changes.

**The intermittency is the daily flip and nothing else.** `endOfLowIntensityFireProbability` (`fire-engine.ts:9`) is 0.6, 0.6, 0.7, 0.8, 1.0 for days 1 to 5, so the flag is set 60% of the time by the end of day 1, 84% by day 2, 95% by day 3 and always by day 5. Forty seeds per case, single spark 6 cells from the boundary, counting cells reached in the far zone:

| case | flag on day 1 | day 2 | day 3 | day 4 |
|---|---|---|---|---|
| Hills to Hills, shrub both sides | 9 | 17 | 27 | 37 |
| Hills to Plains, shrub both sides | 12 | 24 | 39 | 47 |
| Hills to Plains, Forest to Shrub | 2 | 3 | 6 | 8 |

Four live browser runs of Mountains-shrub into Plains-shrub, identical setup each time, went 3, 13, 18 and 18 cells in. Same setup, different outcome, no user input in between.

**Reproduction harness.** Every table above is regenerable from `scripts/fire-spread-harness.js`, which drives the real `FireEngine` headlessly: `rates` prints the spread table, `burn-index` the burn-index census, `sweep [seeds]` the crossing-depth table, and `repro [seed]` the screenshot setup plus a plan view of the burn. It decodes the terrain PNGs itself (node has no decoder and this repo has no image dependency), feeds them through the real `populateGrid`, builds `Cell` objects the way `populateCellsData` does, and swaps `Math.random` for a seeded PRNG so a run is replayable by seed number. Nothing in it reimplements the model. The seeded stream is the harness's own, so a given seed does not correspond to any particular browser run; what is reproducible is the distribution, and the numbers above.

## Out of Scope

- **Any zone-aware special case in the engine.** Fire crosses a zone boundary by the same rule it crosses any other cell pair, and adding a boundary rule would hide the calibration problem rather than fix it.
- **Rewriting the Rothermel implementation.** Only the `e` transcription error at line 126 is named above.
- **The burn-index color rendering and the Fire Intensity Scale.** The burn index is diagnosed here as an input to `fireShouldSpread`, not as a display.
- **Hazbot rule or category changes.** If a ruleset turns out to depend on the fire crossing zones, that is a separate story once the model behavior is settled.
- **Accessibility review**, per the standing scope for this repo.

## Open Questions

### OPEN: What should Forest's spread rate be?
**Context**: Forest advances 0.3 to 1.3 cells per model day against Grass at 13 to 46, and its fuel constants are marked in the source as uncalibrated placeholders. This is the single change that would remove the reported symptom. It is a science call rather than a code one, and it is Trudi's to make or to route: it is not Sam's, whose ownership is the Hazbot rules rather than the fire model. Two sub-questions ride along: whether `ForestWithSuppression` (1.8 to 7.5 cells per day) moves with it, and whether the intended relationship is "forest is slower than grass" or "forest is slower than grass by roughly this ratio." The `mx` and moisture rows can stay as they are; the difference lives entirely in `sav`, `netFuelLoad`, `fuelBedDepth` and `packingRatio`.

### OPEN: What is `endOfLowIntensityFire` supposed to model, and against what threshold?
**Context**: As written it ends the fire outright on flat terrain and in forest, because those cells can never reach Medium. Either the `Cell.burnIndex` thresholds (`cell.ts:93-124`) need to be reachable on flat ground, or the rule needs an input other than burn index. Worth settling alongside the first question, because recalibrating Forest changes which cells clear Low and could resolve this one on its own. Trudi's, like the first: the decision that drives it is whether a fire that stops on day 1 is acceptable pedagogically.

### OPEN: Does any activity depend on the fire crossing zones?
**Context**: The workshop feedback says the fire *"should be crossing between zones"*, but that is a teacher's expectation of the simulation, not a cited requirement, and nothing in the repo has been found that depends on it. If a ruleset, a coach mark or a workshop task is written around a fire that spreads between zones, that raises the priority of the first two questions and bounds how far the calibration can move. If nothing is, then the honest answer to the workshop may be that the model is behaving as calibrated and the calibration is what is wrong. Trudi's call, and worth taking first because it sets the urgency of the other two.

### OPEN: Should a stalled run be ended rather than waited out?
**Context**: Once `endOfLowIntensityFire` is set, every remaining pending ignition is scheduled from a cell that will not spread further, so the outcome is already determined; the run just takes 7 to 10 model days of wall clock to drain. Ending it at that point would make `SimulationEnded` fire when the fire visibly stops. The counter-argument is that it changes when the Hazbot sees a run end, which touches run-window folding. Cheap and self-contained if the answer is yes, but it should not be done in isolation if the first two questions change how often the flag matters.
