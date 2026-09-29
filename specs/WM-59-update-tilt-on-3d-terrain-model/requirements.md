# Update tilt on 3D terrain model

**Jira**: https://concord-consortium.atlassian.net/browse/WM-59
**Repo**: https://github.com/concord-consortium/wildfire-model
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

Tilting the 3D terrain until it faces the viewer straight on pushes the model up under the zone labels and leaves an empty band above the bottom bar. This story moves the point the camera tilts around so the model stays vertically centered between the zone labels and the bottom controls at that end of the tilt, without changing the view students see when the model first loads.

## Project Owner Overview

Students tilt the terrain to look at it from above. Today, the further they tilt toward a straight-down view, the higher the model rides: at the classroom Chromebook's screen size the top 53px of the terrain disappears under the zone labels, while a strip of empty space opens up above the bottom controls. Michael's mockup on the ticket shows the intended result, with the whole model visible and centered in the space between the labels and the controls.

The opening view, which the PIs chose, stays exactly as it is. The fix changes only where the camera pivots when a student tilts, so the model swings around its own middle instead of around a point near its front edge. It is tuned for the target Chromebook (a 1241 x 529 viewport), where the model fits with a few pixels to spare, and it keeps the model centered at larger screen sizes as well, where there is more room around it.

## Background

The ticket's screenshot (two frames, the second with a blue outline) shows the problem end of the tilt: dragging so the camera looks straight down at the terrain. In that pose the model today sits high, its far edge under the zone labels, with a large gap between its near edge and the bottom bar. The blue outline is the target: the model's full rectangle, vertically centered between the bottom of the zone labels and the top of the bottom bar.

The camera is a react-three-fiber `PerspectiveCamera` driven by drei's `OrbitControls` in `src/components/view-3d/view-3d.tsx`. OrbitControls rotates the camera around its `target`, which is set to `DESIGN_TARGET_POS` = `(0.5, 0.263, 0.15)` in view units (the plane is 1 wide and `planeHeight` = 0.667 deep for the default 120000 x 80000 ft model, with z up). That target is not the model's center: it sits at y = 0.263 against a plane center of 0.333, and 0.15 above the ground. Looking straight down at it therefore puts more of the plane above the screen center than below, which is exactly the ride-up in the screenshot. The default pose's polar angle is 28°; the tilt runs from 0° (straight down) to `maxPolarAngle` = 72°.

The line of sight from `DESIGN_CAMERA_POS` = `(0.5, -0.35, 1.285)` through `DESIGN_TARGET_POS` passes through `(0.5, 0.333, 0.020)`, within 0.02 view units of the model's center on the ground. Any point on that line can serve as the orbit target without changing the default view, because the camera's position and look direction are unchanged; only the point it swings around moves. Measured in the running app, moving the target along that line leaves the default view pixel-identical on every shipped preset and viewport tested, and moves the top-down framing down into the gap between the labels and the bottom bar.

The zone labels are HTML over the top of the canvas (`src/components/simulation-info.scss`: 60px tall with a 10px margin, so at every viewport they span y 32 to 92 with the canvas starting at y 22). The bottom bar overlaps the canvas's bottom 22px. So the usable space is not the canvas: it is offset downward from the canvas center by (70 - 22) / 2 = 24px, a constant in CSS pixels.

## Requirements

- **R1 (Chromebook framing).** At the target Chromebook viewport, **1241 x 529**, on any preset with the default 120000 x 80000 ft model, tilting to the top-down end (polar angle 0) shows the model's whole ground-level rectangle (its four corners at elevation 0) between the bottom edge of the zone labels and the top edge of the bottom bar, **vertically centered in that gap to within 4px** (the space above and the space below differ by at most 4px).
- **R2 (other viewports).** At viewports from 1024 x 700 to 1920 x 1080, on the same presets, the top-down model is likewise whole and **vertically centered in the gap to within 4px**. The pivot is therefore computed for the current viewport rather than fixed (see Open Question "Centering away from the Chromebook size"), and recomputed whenever the fitter re-runs on a resize. This includes the sizes where the fitter pulls the camera back (the graph open at narrow windows), where the pivot has to be computed from where the fitter actually put the camera.
- **R3 (default view unchanged).** The view on load, camera position and look direction, is identical to today's for every preset and viewport, **including the presets and viewports where `CameraFitter` pulls the camera back** from the design distance (the square 100000 x 100000 ft presets, and narrow viewports). Changing the orbit target must not change where the fitter places the camera.
- **R4 (controls unchanged).** The tilt limits (`maxPolarAngle` = 0.4π, polar minimum 0), the azimuth limits (±π/4), the zoom limits (`minDistance` 0.8, `maxDistance` 5), damping and rotate/zoom speeds are unchanged, and the tilt stays continuous: no jump or snap at any point in the range or on release.
- **R5 (the whole swing).** At every angle through the tilt range, the flat (72°) end included, the model's ground-level rectangle stays clear of both the zone labels and the bottom bar at the viewports in R1 and R2.
- **R6 (graph panel).** R1 to R5 hold with the graph panel open as well as closed. (Measured: opening the graph narrows the canvas from 1241 to 910px and leaves the framing unchanged, since the fitter's distance is set by the design distance at these sizes.)
- **R7 (regression guard).** An automated check at 1241 x 529 asserts R1 and R3 by projecting the plane's corners through the live camera. jsdom does no WebGL or layout, so this has to run in Cypress, the repo's existing browser suite.
- **R8 (tuning panel).** With `?cameraSettings=true`, the existing camera settings panel also offers: a **tilt slider** (polar angle 0° to 72°, with a degree readout) so the framing can be checked without click-dragging, which a trackpad makes awkward; **live controls for the values the open items turn on**, at minimum the vertical centering offset in CSS px (default: the gap-derived value, 24) and a top-down margin in CSS px (default 0; a non-zero value shrinks the straight-down model through the projection, a camera zoom plus a matching vertical view offset eased in toward the top-down end, so it leaves that margin while OrbitControls' radius and limits stay unchanged); and the panel's **Copy** snippet includes those values. This ships first, on its own branch deploy, so the project team can try the options and hand back the values the final change uses, the way the default pose was chosen.

## Technical Notes

**Files.** `src/components/view-3d/view-3d.tsx` holds `CameraFitter` and the `<OrbitControls>` props; the design pose `DESIGN_CAMERA_POS`, `DESIGN_TARGET_POS` and `DESIGN_PLANE_HEIGHT` sits beside the pivot formula in `src/components/view-3d/orbit-pivot.ts` (the depth axis scales by `yScale = planeHeight / DESIGN_PLANE_HEIGHT`, so the point on the line of sight above the model's center, `s = 1.1147`, is the same for every aspect ratio; the gap-centering `s` is not, since it depends on the camera's height). `top-down-framing.tsx` applies the optional top-down margin through the projection. No other file positions the camera. `window.debugCamera` (`{ camera, controls }`) is exposed only with `?cameraSettings=true`, via `CameraDebugTracker`.

**How the fitter interacts with the target.** `CameraFitter` places the camera at `target + offsetDir * max(designDistance, distH, distW)`, where `designDistance` and the fit extents are all measured from the target it is given. When `designDistance` wins (every 1.5-aspect preset at the sizes measured) the camera lands on `DESIGN_CAMERA_POS` whatever point on the line of sight the target is. When `distH` or `distW` wins, it does not: on the square `basic` preset at 1241 x 529 the camera moved from `(0.5, -0.726, 1.533)` to `(0.5, -0.569, 1.34)` when the target moved, and the default view grew from y 124-444 to y 109-477. Passing the fitter today's `DESIGN_TARGET_POS` while giving OrbitControls the new pivot kept the camera at `(0.5, -0.726, 1.533)` and the default view at y 124-444, which is what R3 requires.

**Measurements** (1241 x 529 unless stated, `plainsTwoZone`, plane corners at z = 0 projected through the live camera; gap = labels' bottom to bottom bar's top). `s` parameterizes the pivot on the design line of sight, `pivot = camera + s * (DESIGN_TARGET_POS - camera)`: `s = 1` is today's target, `s = 1.1147` the point above the model's center.

| s | default view | top-down (gap 92-463) | flat end (72°) |
|---|---|---|---|
| 1 (today) | 116-436 | 35-397 (57px under the labels, 66px empty above the bar) | 259-416 |
| 1.1147 | 116-436 | 75-433 (centered on the canvas, 17px under the labels) | not measured at z = 0 |
| 1.17 | 116-436 | 94-449 | 193-306 |
| 1.19 | 116-436 | 101-455 (9px above, 8px below) | 186-294 |

At a fixed `s = 1.19` across viewports (top-down, space above / below the model): 1024 x 700 38/18, 1366 x 768 49/23, 1440 x 800 55/25, 1920 x 1080 102/43. Always fully visible, centered only at the Chromebook size, because the pivot's pixel effect scales with the viewport while the label strip is a fixed 70px.

**Per-viewport pivot.** At the top-down end the camera sits directly above the pivot at height `H(s) = |camera - pivot| + pivot.z`, which on the design line is `1.285 + 0.155 s` (default aspect). The canvas then shows `ppu = canvasHeight / (2 H tan(fov / 2))` CSS px per view unit, and centering the model in the gap needs the pivot `24 / ppu` view units beyond the model's center in y, so `pivot.y = h / 2 + 24 / ppu`. Solved for `s` this predicts 1.188 at 1241 x 529 (canvas 463px), 1.168 at 1024 x 700 (634px), 1.163 at 1366 x 768 (702px), 1.161 at 1440 x 800 (734px) and 1.148 at 1920 x 1080 (1014px). Measured with those values: 101-455 in the 92-463 gap (9/8), 120-606 in 92-634 (28/28), 127-667 in 92-702 (35/35), 131-695 in 92-734 (39/39) and 163-943 in 92-1014 (71/71).

**The formula must use the fitted camera, not `DESIGN_CAMERA_POS`.** With the graph open at narrow windows the fitter pulls the camera back (1024 x 700: canvas 693px wide, camera at `(0.5, -0.508, 1.577)`; 900 x 700: 569px, `(0.5, -0.675, 1.888)`), which raises `H`. Using the design camera's height there left the model 9px (1024 x 700, 68/77) and 16px (900 x 700, 97/113) off center. Re-solved from the fitted camera the pivot moves to `s` 1.181 and 1.193, measured 165-561 in 92-634 (73/73) and 197-528 in 92-634 (105/106). The default view stayed identical at every pivot in both cases, confirming R3 on the narrow-canvas path as well as on the square preset. The gap edges are constant in CSS px at every size measured: the labels always end at y 92 and the bottom bar always starts 66px above the viewport's bottom. The 24px is (70 - 22) / 2: the label strip's 70px below the canvas top, less the bottom bar's 22px overlap of the canvas bottom.

**Size at top-down is fixed by the orbit radius.** Moving the pivot along the line of sight changes the camera's height above the ground at top-down by about 1%, so the top-down model is essentially the same size (358px tall at the Chromebook) at every `s`. Only its position changes. The 371px gap leaves about 6-9px either side.

**Presets.** Every preset the activities ship with uses the default 120000 x 80000 ft model. Only `basic`, `basicWithWind`, `slope45deg` and `basicWithSlopeAndWind` override it (100000 x 100000); they are dev presets. Seen from straight above, the square model is taller than the gap at 1241 x 529 whatever the pivot, so R1 is scoped to the 1.5-aspect model.

**Measurement method, for reuse.** Load `?cameraSettings=true`, read `window.debugCamera`, call `controls.setPolarAngle(0.0001)` then `controls.update()` repeatedly (damping), and project `(x, y, 0)` for the four plane corners with `vector.project(camera)`. Projected extents matched the rendered pixels (top-down y 36-397 projected against 39-398 rendered).

## Out of Scope

- The zone labels themselves (position, size, overlap with the Time and Wind Meter displays, which WM-49 accepted).
- Zoom. Zooming changes the orbit radius, and no framing guarantee survives it; the zoom limits stay as they are.
- The square dev presets' top-down framing (they only need R3).
- Changing the PI-chosen default pose or `CAMERA_FIT_FOV_DEG`.
- The azimuth (side-to-side) rotation's framing.
- Keyboard control of the tilt. OrbitControls' key handling is never attached (`listenToKeyEvents` is not called), so tilting is pointer-only today, and this story does not change that.
- A resize or opening the graph re-runs `CameraFitter`, which resets the camera to the default pose. That is today's behavior and stays; the per-viewport pivot depends only on the canvas height, so opening the graph (which narrows the canvas) does not move it.

## Open Questions

### RESOLVED: Judgment call: move the pivot, or shift the projection?
**Context**: Two mechanisms can move the top-down model down into the gap. Shifting the projection (`camera.setViewOffset`) is exact at every viewport but moves every pose, the default included.
**Options considered**:
- A) Move the orbit target along the default line of sight.
- B) Shift the projection down by the label strip's 24px offset.
- C) Change the default pose.

**Decision**: **A.** At 1241 x 529 the default view is already centered in the gap (y 116-436 in 92-463), so B would push it 24px low, and C re-opens a pose the PIs chose. A leaves the default view pixel-identical and needs no OrbitControls customization, only a different `target`.

### RESOLVED: Judgment call: which model aspect to optimize for
**Context**: R1's 4px centering can only be met for one aspect ratio with a fixed pivot, and the square dev presets cannot fit top-down at 1241 x 529 at all.
**Options considered**:
- A) Optimize for the default 120000 x 80000 ft model, which every shipped preset uses.
- B) Require R1 for every preset.

**Decision**: **A.** B is unachievable for the square model at this viewport (its top-down rectangle is taller than the gap), and no activity ships a square preset.

### RESOLVED: Centering away from the Chromebook size
**Context**: A fixed pivot tuned for 1241 x 529 centers the top-down model there but sits it low at larger sizes (38/18px at 1024 x 700 up to 102/43px at 1920 x 1080), because the label strip is a fixed 70px in CSS pixels while the pivot's effect scales with the viewport. Michael's mockup was captured at a larger window and shows equal space above and below.
**Options considered**:
- A) A fixed pivot tuned for the Chromebook. Always fully visible, centered only at 1241 x 529.
- B) Compute the pivot per viewport when the fitter runs, so the top-down model is centered in the gap at every size. Still only a different `target`, recomputed on resize.
- C) Center on the canvas instead of the gap (`s = 1.1147`), which is simpler but fails R1 by 17px at the Chromebook.

**Decision**: **B.** The ticket asks for the model "centered vertically within the space", with no viewport attached, and B delivers that at every size for the cost of a formula: measured centered to the pixel at 1241 x 529 (9/8), 1440 x 800 (39/39) and 1920 x 1080 (71/71), with the default view unchanged at each (see Technical Notes, "Per-viewport pivot"). It is still only a different OrbitControls `target`, computed where the fitter already runs. A was the fallback if the formula had not held.

### RESOLVED: Low confidence: are 6-9px margins at the Chromebook enough?
**Context**: At 1241 x 529 the top-down model is 358px tall in a 371px gap, whatever the pivot. The mockup shows visibly more breathing room, but it was drawn at a larger window. More room at the Chromebook needs the camera farther away at the top-down end, which means the orbit radius varying with the tilt: a customization of the orbit behavior, and a model that shrinks as the student tilts.
**Options considered**:
- A) Accept the tight fit: the model is whole and centered.
- B) Grow the orbit radius toward the top-down end so the model shrinks to leave a set margin.

**Decision**: **A.** The ticket asks for centering, not for a margin, and the mockup's room comes from its larger window: with the per-viewport pivot, 1440 x 800 gets 39px above and below, the proportion the mockup shows. B would make the model visibly shrink while the student tilts, a behavior change nobody asked for, and it is the one option here that needs custom orbit behavior.

### RESOLVED: Low confidence: the flat end moves up
**Context**: The ticket is about the top-down end only. Moving the pivot also moves the flat (72°) end: at 1241 x 529 it goes from y 259-416 (sitting low, center 60px below the gap's center) to y 186-294 (sitting high, center 37px above). It stays clear of the labels by 94px, so R5 holds, but it is a visible change nobody asked for.
**Options considered**:
- A) Accept it: R5 holds and neither position is centered today.
- B) Also require the flat end to be centered, which a single fixed pivot cannot do together with R1.

**Decision**: **A.** R5 holds with room to spare (94px clear of the labels at the Chromebook), neither end is centered today, and one pivot cannot center both ends. Centering the flat end too would need the pivot to move during the tilt, which is custom orbit behavior for a request the ticket does not make. Stated here so a reviewer who disagrees can reopen it.

## Self-Review

Roles: Senior Engineer, QA Engineer, Product/Design (against Michael's mockup), Student, WCAG Accessibility Expert. Every item below was checked in the running app with a throwaway patch before being written up.

### Senior Engineer

#### RESOLVED: Technical Notes claimed the centering parameter is aspect-independent
The note under **Files** said the line-of-sight parameter that centers the model is the same for every aspect ratio. That holds for the point above the model's center (`s = 1.1147`), but not for the gap-centering `s`, which depends on the camera's height and so on the fitter's distance. Corrected in place.

### QA Engineer

#### RESOLVED: R1 did not say what "the model" is measured by
On terrain with height, the rendered silhouette seen from above is larger than the ground rectangle, because raised edges are closer to the camera. R1 and R2 are now defined on the ground-level rectangle (corners at elevation 0), which is what the projection check in R7 can measure deterministically; the silhouette is the subject of the open item below.

### Product/Design

#### RESOLVED: "The swing" covers the whole tilt, not only its ends
The ticket asks that "the swing should show the model centered", and R5 only covered the flat end. Measured at 1241 x 529 with the proposed pivot, the ground rectangle stays inside the 92-463 gap at every angle checked: 0° 100-455, 10° 102-455, 20° 108-448, 28° 115-437 (the default), 40° 131-411, 50° 146-381, 60° 164-344, 72° 188-293. R5 now covers the whole range.

#### RESOLVED: On mountain presets the silhouette fills the Chromebook gap edge to edge
Rendered top-down at 1241 x 529 with the proposed pivot, the terrain's pixels span y 99-454 on `plainsTwoZone` (7px under the labels' 92, 9px above the bar's 463) but y 89-461 on `mountainTwoZone`, 92-461 on the default preset and 93-461 on `mountainsandplainsTwoZone`: up to 3px under the labels and 2px from the bar. The raised terrain edges appear larger in perspective and use up the margin. This revisits the settled "are 6-9px margins enough" decision, which assumed the margin was there.
**Options considered**:
- A) Accept it: at most 3px under the labels' white border, only on mountain terrain, only at the exact top-down pose on the smallest target screen (at 10° the ground rectangle is already 102-455).
- B) Make the top-down model smaller so the silhouette clears with a margin, which needs the orbit radius to grow toward the top-down end (custom orbit behavior, and the model shrinks as the student tilts).
- C) Center on the silhouette's bounding box instead of the ground rectangle: this moves the model but cannot make it smaller, so the overlap stays and moves to the other edge.

**Decision**: **Left to the project team, using the R8 tuning panel.** The tuning branch ships A as the default (top-down margin 0) with B available as the panel's top-down margin control, so they can compare the two on the branch deploy and send back a margin, 0 meaning A. The implementation's last step bakes in whatever they pick. Nothing extra is built for this, since R8 needs the control anyway.

