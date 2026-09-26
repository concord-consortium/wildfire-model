# Implementation Plan: Update tilt on 3D terrain model

**Jira**: https://concord-consortium.atlassian.net/browse/WM-59
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Implementation Plan

The first three steps are one branch and one branch deploy: they ship the fix with option A (no top-down margin) as the default behavior, and put the tuning controls behind `?cameraSettings=true` so the project team can compare A and B and send back values. The last step bakes those values in once they arrive.

### Orbit around a pivot that centers the top-down view

**Summary**: Moves OrbitControls' target from `DESIGN_TARGET_POS` to a pivot on the default line of sight, computed from the fitted camera and the canvas height so that the top-down end of the tilt is centered in the gap between the zone labels and the bottom bar. The camera is still placed from `DESIGN_TARGET_POS`, so the default view does not move. Delivers R1 to R6.

**Files affected**:
- `src/components/view-3d/orbit-pivot.ts` (new): the pivot formula and the offset constant.
- `src/components/view-3d/orbit-pivot.test.ts` (new): unit tests for the formula.
- `src/components/view-3d/view-3d.tsx`: `CameraFitter` sets `controls.target` to the pivot; the fit guard also resets when the OrbitControls instance changes; the `target` prop comes off `<OrbitControls>`.

**Estimated diff size**: ~150 lines

`orbit-pivot.ts`:

```ts
import * as THREE from "three";

// The HTML that covers the canvas: the zone labels (60px plus a 10px margin) from the canvas top,
// and the bottom bar's overlap of the canvas bottom. The Cypress framing test guards both against
// layout drift.
export const LABEL_STRIP_PX = 70;
export const BAR_OVERLAP_PX = 22;
// How far below the canvas center, in CSS px, the top-down view should put the model's center: the
// middle of the uncovered gap.
export const TOP_DOWN_CENTER_OFFSET_PX = (LABEL_STRIP_PX - BAR_OVERLAP_PX) / 2;

// The orbit target on the camera's line of sight at which a straight-down view shows the model's
// ground-level center `offsetPx` CSS px below the canvas center. Seen from above, the camera sits
// at height H = t + pivot.z over a pivot t along the line, and the canvas shows
// canvasHeight / (2 H tan(fov / 2)) px per view unit, so the pivot must lead the model's center
// (planeHeight / 2) by offsetPx / that. Solved for t in closed form.
export function computeOrbitPivot(
  cameraPos: THREE.Vector3,
  lookDir: THREE.Vector3,   // unit vector from the camera toward the ground
  planeHeight: number,
  canvasHeight: number,
  fovDeg: number,
  offsetPx: number,
): THREE.Vector3 {
  const k = offsetPx * 2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2) / canvasHeight;
  const t = (planeHeight / 2 + k * cameraPos.z - cameraPos.y) / (lookDir.y - k * (1 + lookDir.z));
  return cameraPos.clone().addScaledVector(lookDir, t);
}
```

`view-3d.tsx`, in `CameraFitter` after the camera is placed (`camera.position.copy(target).addScaledVector(offsetDir, distance)`):

```ts
    // The camera is placed from the design target so the default view never moves, but it orbits
    // around a pivot further along the same line of sight, which is what keeps the model centered
    // between the zone labels and the bottom bar at the straight-down end of the tilt.
    const pivot = computeOrbitPivot(camera.position, lookDir, h, size.height, CAMERA_FIT_FOV_DEG, TOP_DOWN_CENTER_OFFSET_PX);
    (controls as unknown as { target: THREE.Vector3 }).target.copy(pivot);
```

and the guard's reset effect gains `controls`:

```ts
  useEffect(() => {
    fittedRef.current = false;
  }, [size.width, size.height, targetPos, designPos, controls]);
```

with its comment extended: drei replaces the OrbitControls instance while the default camera mounts, and a fit applied to the first instance is lost with it. Measured: without `controls` in the list, the first load ends with the target at the discarded instance's `(0, 0, 0)` once the prop is gone, or at the prop's design target while it is there; with it, the fit lands on the live instance every time.

`<OrbitControls>` loses `target={targetPos}`, with a comment in the style of the existing one on `<PerspectiveCamera>`: the target is intentionally not passed, since `CameraFitter` owns it and drei would otherwise apply the prop to each new instance over the fit. `targetPos` stays as the design target that `CameraFitter` places the camera from.

The comment on the `cameraPos` / `targetPos` `useMemo` in `View3d` says the memo stops drei re-applying position and target props. Once `target` comes off, neither prop reaches drei, so the comment is rewritten to what the memo still does: a new array each render would reset `CameraFitter`'s guard and snap a tilted camera back to the default pose.

`orbit-pivot.test.ts` (Jest; three.js math runs in jsdom without a WebGL context):
- The pivot lies on the line of sight (`(pivot - camera) x lookDir` is ~0).
- With `offsetPx = 0` the pivot's y is exactly `planeHeight / 2`.
- For canvas heights 463, 634, 734 and 1014, a `THREE.PerspectiveCamera` (fov 33, up `DEFAULT_UP`) placed above the pivot at the orbit radius, 1e-4 rad off vertical toward -y (exactly vertical is degenerate with up = +z, as it is for OrbitControls), and looking at the pivot, projects the ground rectangle's center `offsetPx` px below the canvas center, to within 0.5px.
- The design camera at a 463px canvas gives `(0.5, 0.3784, -0.0638)` to 4 places, the value measured in the running app.

Verified with a throwaway version of exactly this change (plainsTwoZone, ground rectangle top-down against the gap): 1241 x 529 100-455 in 92-463, 1920 x 1080 163-944 in 92-1014, 900 x 700 with the graph open 197-529 in 92-634, default view unchanged in each (116-436, 228-928, 207-502), and the target unchanged across a forced `View3d` re-render.

---

### Tuning controls in the camera settings panel

**Summary**: Adds R8's controls to the `?cameraSettings=true` panel: a tilt slider, a center-offset input and a top-down-margin input, all live, with both values in the Copy snippet. The margin implements option B as a projection change (a zoom and a matching vertical image shift that grow toward the straight-down end), so it needs no custom orbit behavior and cannot move the default view.

**Files affected**:
- `src/components/view-3d/orbit-pivot.ts`: `TOP_DOWN_MARGIN_PX = 0`, next to the offset constant, so the store and the framing component both import it from a module with no React or store dependencies (defining it in `top-down-framing.tsx` would make the store and that component import each other).
- `src/components/view-3d/camera-debug-store.ts`: `polarDeg` (live readout), `centerOffsetPx`, `topDownMarginPx`, setters.
- `src/components/view-3d/top-down-framing.tsx` (new): a pure `topDownZoom` helper and the per-frame component that applies it.
- `src/components/view-3d/top-down-framing.test.ts` (new): unit tests for `topDownZoom`.
- `src/components/view-3d/view-3d.tsx`: `CameraFitter` reads the offset from the store when the panel is on; `<TopDownFraming/>` is mounted inside the canvas; `CameraDebugTracker` reports the polar angle.
- `src/components/camera-settings-panel/camera-settings-panel.tsx` and `.scss`: the three controls and the snippet.
- `src/components/camera-settings-panel/camera-settings-panel.test.tsx` (new).

**Estimated diff size**: ~250 lines

Store additions:

```ts
  polarDeg = 0;
  centerOffsetPx = TOP_DOWN_CENTER_OFFSET_PX;
  topDownMarginPx = TOP_DOWN_MARGIN_PX;   // 0 until the project team picks a value

  setPolarDeg(deg: number) { this.polarDeg = deg; }
  setCenterOffsetPx(px: number) { this.centerOffsetPx = px; }
  setTopDownMarginPx(px: number) { this.topDownMarginPx = px; }
```

`CameraFitter` takes the offset as a prop (`offsetPx`), passed from `View3d` as `cameraSettingsEnabled ? cameraDebugStore.centerOffsetPx : TOP_DOWN_CENTER_OFFSET_PX`, and adds it to the reset effect's dependencies, so editing the value re-fits live. A re-fit returns the camera to the default pose (that is what the fitter does on a resize today), so the input's `title` says to tilt again after changing it. `View3d` is already an observer that reads `cameraDebugStore.fov` the same way.

`top-down-framing.tsx`: a `useFrame` component, mounted always, that reads the margin from the store when `?cameraSettings=true` is on and from `TOP_DOWN_MARGIN_PX` otherwise. Each frame the polar angle, the inputs, the canvas size or `cellsElevationFlag` change, it sets `camera.zoom` and a vertical view offset from how far the tilt is past the default pose toward straight down:

```ts
// t runs from 0 at the default pose's polar angle (and anywhere flatter) to 1 straight down, eased
// so most of the change happens near straight down, where the shift is exact.
const t = THREE.MathUtils.smoothstep(1 - polar / designPolar, 0, 1);
// zTop shrinks the straight-down silhouette (the terrain's corners at its actual maximum elevation)
// until it clears the gap by marginPx at both edges; never enlarges.
const z = 1 - t * (1 - zTop);
camera.zoom = z;
if (z < 1) camera.setViewOffset(w, h, 0, -offsetPx * (1 - z), w, h); else camera.clearViewOffset();
camera.updateProjectionMatrix();
```

The zoom calculation is a pure exported function, `topDownZoom({ polar, designPolar, canvasHeight, silhouettePx, marginPx })`, so it can be unit tested without WebGL; the component only gathers its inputs and applies the result. `designPolar` is the default pose's polar angle (28°), taken from the design vectors. `zTop = min(1, (gapPx - 2 * marginPx) / silhouettePx)`, where `gapPx = canvasHeight - LABEL_STRIP_PX - BAR_OVERLAP_PX`, and `silhouettePx` is the straight-down projected height of the terrain's bounding box at its actual maximum cell elevation, a single pass over `simulation.cells` recomputed when `simulation.cellsElevationFlag` changes. Straight down, the camera sits the orbit distance above the pivot, so `silhouettePx = planeHeight * canvasHeight / (2 * (controls.getDistance() + controls.target.z - maxElevation) * tan(camera.fov / 2))`, with `maxElevation` in view units (`cell.elevation * ftToViewUnit`). It uses the live `camera.fov` rather than `CAMERA_FIT_FOV_DEG`, because the panel's fov slider changes the fov. The component skips a frame whose inputs (margin, offset, polar angle, distance, elevation flag, canvas size, fov) are unchanged. With `marginPx = 0` it does nothing (`z` stays 1 and no view offset is set), so the default build is exactly the previous step. The one exception: if the operator sets a margin and then puts it back to 0, the component resets `camera.zoom` to 1 and calls `clearViewOffset()` once, or the old zoom and shift would stay applied. Verified in the running app: at 1241 x 529 straight down, zoom 0.9 with a shift of `-24 * 0.1` px moved the ground rectangle from 100-455 to 117.9-437.2, the predicted 118-437 (centered on the gap's 277.5); `controls.update()` left it there, and clearing both restored 100-455. The zoom and the offset both live in the projection matrix, which three.js's raycaster inverts, so clicks keep landing under the pointer.

Panel additions, after the fov control: a **tilt** range input (0 to 72, step 1) whose value is `cameraDebugStore.polarDeg` and whose change calls `debugCamera.controls.setPolarAngle(deg * π / 180)` then `update()`, the same `window.debugCamera` route the existing Center X button uses; a **center offset** number input and a **top-down margin** number input bound to the store. `buildSnippet` gains two lines, `centerOffsetPx: N` and `topDownMarginPx: N`. `CameraDebugTracker` pushes `controls.getPolarAngle()` in degrees into the store alongside the pose.

The panel is a single fixed 32px row, and at the 1241px Chromebook width the three new controls overflow it by 113px (1342px of content in 1229px), cutting off Center X and Copy. Measured fix that fits the row exactly at 1241: both range inputs go from 120px to 80px, the panel's `gap` goes from 16px to 8px, and the buttons get `white-space: nowrap` (otherwise "Center X" wraps to two lines).

`top-down-framing.test.ts`: straight down, the zoom shrinks the silhouette to exactly the gap less twice the margin; the zoom is exactly 1 at the default pose and flatter; halfway between the default pose and straight down it is halfway between 1 and the straight-down zoom, and 10% of the way down it gives well under 10% of the shrink (the smoothstep easing); it is 1 with a zero margin and when the silhouette already fits.

`camera-settings-panel.test.tsx`: renders the panel, changes each number input and asserts the store; asserts the Copy snippet (mocked `navigator.clipboard.writeText`) contains the two new lines with the current values; asserts the tilt input calls `setPolarAngle` and `update` on a stubbed `window.debugCamera`.

---

### Regression guard in Cypress

**Summary**: R7. A Cypress spec at the target Chromebook viewport that projects the plane's corners through the live camera and asserts the straight-down framing and the unchanged default pose. jsdom does no WebGL or layout, so this cannot live in Jest; Cypress already renders the canvas in CI (`smoke.cy.ts`, `workspace.cy.ts`) and already uses this viewport (`bottom-bar-visuals.cy.ts`).

**Files affected**:
- `cypress/e2e/terrain-tilt-framing.cy.ts` (new)

**Estimated diff size**: ~115 lines

Visits `/?cameraSettings=true&preset=plainsTwoZone` at `cy.viewport(1241, 529)`, waits for `win.debugCamera`, then:
- asserts the camera position is `DESIGN_CAMERA_POS` `(0.5, -0.35, 1.285)` to 3 places (R3);
- sets the polar angle to 0.0001, calls `update()` until damping settles, projects the four ground corners and compares them with the zone labels' bottom and the bottom bar's top: both margins non-negative and within 4px of each other (R1);
- sweeps the polar angle from 0° to 72° in 10° steps plus 72° itself, asserting both margins non-negative at each (R5). The whole range was measured inside the gap at this viewport (0° 100-455 to 72° 188-293 in 92-463), so the sweep fails only if a later change lets the middle of the tilt drift.
- **graph open (R6):** at `cy.viewport(900, 700)`, clicks `[data-testid="right-panel-tab"]` to open the graph, then asserts the default camera sits where the fitter's pull-back puts it for the 569px-wide canvas, `(0.5, -0.675, 1.888)` to 3 places (R3 on the pull-back path), and repeats the straight-down check (margins non-negative and within 4px of each other; measured 105/106 in the 92-634 gap). 900 x 700 rather than the Chromebook size because there the graph actually moves the camera; at 1241 x 529 it changes nothing, so a check there could not fail.

R4 (the tilt, azimuth and zoom limits, damping and speeds unchanged) gets no dedicated test, by decision: no step touches those props, the tuning margin changes `camera.zoom` rather than OrbitControls' distance limits, and the angle sweep above already walks the full tilt range. A test would only restate the prop values.

Mutation check before committing: with the pivot line in `CameraFitter` commented out, the R1 assertion fails (margins -57 / 66).

Selectors: the zone labels are `[data-testid="zone-info"]` (bottom edge = max of their boxes) and the bottom bar is the first `[class*="bottomBar"]`. The straight-down wait is not solved yet; see the open question "What the Cypress test must wait for".

---

### Bake in the project team's values

**Summary**: After the tuning branch has been reviewed, set `TOP_DOWN_CENTER_OFFSET_PX` and `TOP_DOWN_MARGIN_PX` to the values the project team sent back, and update the Cypress expectations if the margin is non-zero (the margins then equal it, rather than differing by at most 4px). If they choose the defaults, this step is empty and is dropped.

**Files affected**:
- `src/components/view-3d/orbit-pivot.ts`: the two constants.
- `cypress/e2e/terrain-tilt-framing.cy.ts`: the expected margins.

**Estimated diff size**: ~10 lines

## Open Questions

<!-- Implementation-focused questions only. Requirements questions go in requirements.md. -->

### OPEN: What the Cypress test must wait for
**Context**: Built as described in "Regression guard in Cypress", the test waited until the camera sat at `DESIGN_CAMERA_POS`, then tilted and measured in the same tick. It was flaky: across three headless Chrome runs (`CI=true npx cypress run --browser chrome`) a different straight-down check failed each time, once 456px and once 43px under the labels, while the same check passed on the other runs. Waiting on the camera position is not enough, because the camera sits at the design position both before and after `CameraFitter` sets the pivot. The cause was not found.
**Options considered**:
- A) Also wait until `controls.target` is off the design target and unchanged across a few frames.
- B) Also wait until the canvas size is stable (a late resize re-fits and re-computes the pivot).
- C) Recompute the expected pivot in the test and wait for `controls.target` to equal it.

**Decision**: Not made. Find which of the above the failures come from before choosing (log the canvas height, the target and the camera position into the assertion message, since the browser console does not reach `cypress run`'s output).

### RESOLVED: Judgment call: hardcode the 24px offset or measure the DOM
**Context**: The offset comes from the label strip and the bottom bar's overlap, both HTML outside the canvas.
**Options considered**:
- A) A constant, with the derivation in its comment and the Cypress test catching drift.
- B) Measure the labels and the bar from inside the canvas at fit time.

**Decision**: **A.** B would couple the 3D view to the HTML layout and to timing (the labels must have laid out before the first fit), for a value measured constant at every viewport tried (labels always end at y 92, the bar always starts 66px above the viewport's bottom). The R8 panel can still override it live.

### RESOLVED: Judgment call: option B through the projection, not the orbit radius
**Context**: A non-zero top-down margin needs the straight-down model smaller than the orbit radius makes it.
**Options considered**:
- A) Zoom plus a vertical view offset, driven by the polar angle.
- B) Grow the camera's distance from the pivot toward the straight-down end.

**Decision**: **A.** It leaves OrbitControls' distance, damping and zoom limits alone, cannot move the default pose (`t` is 0 there), and measured exact. B fights OrbitControls' own dolly state every frame and changes what the zoom limits mean.

### RESOLVED: Judgment call: pivot in `CameraFitter` rather than as a prop
**Context**: The pivot depends on the fitted camera and the canvas height, which `CameraFitter` has and `View3d` does not.
**Options considered**:
- A) `CameraFitter` sets `controls.target`; the prop comes off.
- B) Lift the canvas size and fitted distance out to `View3d` and pass the pivot as the `target` prop.

**Decision**: **A.** It keeps the fit and the pivot in one place, and it follows the file's existing rule for camera position (the fitter owns it; the prop is not passed). B would need the fitter's result to flow back out of the canvas.

### RESOLVED: Low confidence: how the margin eases in between the default pose and straight down
**Context**: With a non-zero margin the zoom and shift grow linearly in the polar angle from the default pose (28°) to straight down. Linear is a guess: it might read as the model shrinking visibly while the student tilts, and the shift is exact only at the straight-down end.
**Options considered**:
- A) Linear in the polar angle.
- B) Eased (for example smoothstep), so most of the change happens near straight down.
- C) Only in the last few degrees.

**Decision**: **B**, `smoothstep`. The shift is exact only at the straight-down end, so easing keeps the middle of the tilt close to the margin-free behavior, which is measured clear of the labels and the bar at every angle (requirements R5). C would make the shrink abrupt. It only matters if the project team picks a non-zero margin, and the tuning branch is where they will feel it; the curve is one line to change if they report it.

### RESOLVED: Low confidence: the silhouette height for the zoom
**Context**: `zTop` needs the straight-down silhouette height. The terrain's actual maximum cell elevation gives the true silhouette; `config.heightmapMaxElevation` is a cheaper upper bound but overstates flat presets such as plains, which would shrink them for no reason.
**Options considered**:
- A) The maximum cell elevation, recomputed when the terrain changes.
- B) `config.heightmapMaxElevation`.

**Decision**: **A.** Measured: the tallest cell is 1,098 ft on `plainsTwoZone`, 8,078 ft on `hillThreeZone` and 19,450 ft on `mountainTwoZone`, against a configured 20,000 ft on all three, so B would shrink the plains view as if it had mountains. The pass over 38,400 cells runs only when the elevation flag changes. The overall maximum rather than the edge maximum is deliberate: a tall peak just inside an edge projects past that edge when seen from above.

## Self-Review

Roles: Senior Engineer, commit reviewer (does each step stand alone), test author (can each named test be written against the harness), and the project team as operators of the tuning panel. Each item was checked against the proposed code by building it far enough to see: the pivot helper and its unit tests were run as a throwaway Jest file (7 of 7 passing once corrected), and the fitter, prop and projection changes were run in the app with a throwaway patch.

### Test author

#### RESOLVED: The straight-down unit test as first written could not pass
A camera placed exactly above the pivot with up = +z has a degenerate `lookAt`, so its projection is arbitrary. The test now places the camera 1e-4 rad off vertical, which is what OrbitControls does at its polar minimum; run as a throwaway, it projects the model's center 24px below the canvas center to within 0.5px at all four canvas heights. Corrected in place.

### Commit reviewer

#### RESOLVED: `TOP_DOWN_MARGIN_PX` was defined in a file that imports the store that imports it
The plan put the constant in `top-down-framing.tsx`, which reads `cameraDebugStore`, while the store's default imports the constant: an import cycle, and the store would load before the step that defines the constant. Moved to `orbit-pivot.ts` in the tuning step, which depends on nothing but three.js. Corrected in place.

### Senior Engineer

#### RESOLVED: The view offset would go stale on a resize
`setViewOffset` records the full width and height it was given. drei's `PerspectiveCamera` updates `aspect` on a resize, but a view offset set for the old size would then shift by the wrong amount until something recomputed it. `TopDownFraming` now recomputes when the canvas size changes as well as the polar angle, the inputs and the elevation flag. It only matters with a non-zero margin. Corrected in place.

#### RESOLVED: The plan did not say whether the framing component runs outside the tuning panel
It must, since the baked-in margin (the last step) applies to everyone. It is mounted always and reads the store only when `?cameraSettings=true` is on; with the default margin of 0 it sets nothing. Corrected in place.

### Project team (operating the tuning panel)

#### RESOLVED: Editing the offset snaps the view back to the default pose
Changing the center offset re-fits, and a re-fit resets the camera, so the operator has to tilt again to see the effect. That is acceptable for a tuning tool and matches what a resize does today; the input's `title` says so. The margin input does not re-fit (it only feeds the per-frame projection), so it can be adjusted while looking straight down. Corrected in place.

