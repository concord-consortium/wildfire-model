import React, { ReactNode } from "react";
import { AnchorTestId } from "./anchor-testids";
import mountainImg from "../../assets/hazbot/mountain.png";

// The (ruleSetId, categoryId) → tour anchor map (WM-17).
//
// The map encodes ONLY the part of each tour step that is not reliably parseable
// from the authored prose: the target `data-testid` (or a no-anchor viewport
// placement) and the ring/pointer style. The per-step TEXT comes from the
// build-time-generated artifact (tour-data.generated.ts); the renderer (build-tour.ts)
// zips them: generated step text + this map's anchor[i]. The map value is a
// FACTORY (not a literal array) because a few categories branch on live sim state
// (spark coverage), so the emitted steps are computed at open time.
//
// Anchors are derived from each category's authored `visualFeedback`. Three cues are
// rendered in a simplified v1 form per the spec's resolved decoupled-ring decision:
//   - 25/2 and the conditional spark steps (23/4, 33/4, 35/6) anchor the bubble +
//     ring to the Spark button rather than "centered top (no pointer)" + decoupled ring;
//   - 44/3 and 46/3 ring the Fireline button only (not Fireline + Helitack + Start);
//   - 34's `0.` intensity-scale pointer is deferred (the tour is its 3 arrowText steps).
// The authored instruction text is unaffected in every case.

/** Popover placement around an anchored control (floating-ui sides/alignments). */
export type PopoverSide = "top" | "right" | "bottom" | "left";
export type PopoverAlign = "start" | "center" | "end";

export type StepAnchor =
  // Bubble anchored to a control. The engine's showOutlineRing draws the ring on it;
  // intermediate steps advance on click (added by the renderer, not the map).
  // `side`/`align` override the renderer's top/center default (build-tour.ts) — e.g.
  // the Setup-panel terminal sits to the panel's RIGHT so it clears the tall panel.
  | { kind: "anchor"; testid: AnchorTestId; side?: PopoverSide; align?: PopoverAlign }
  // No-pointer bubble centered at top; no ring (a ViewportPopover has no ring).
  // Optional figure rendered in the popover's image slot.
  | { kind: "viewport"; position: "top-center"; image?: ReactNode };

/** Live sim state read at open time, for conditional steps. */
export interface TourContext {
  /** Distinct zones currently holding a spark. */
  sparkZoneCount: number;
}

export type TourFactory = (ctx: TourContext) => StepAnchor[];

// Shorthand builders for readability.
const anchor = (testid: AnchorTestId, side?: PopoverSide, align?: PopoverAlign): StepAnchor =>
  ({ kind: "anchor", testid, ...(side && { side }), ...(align && { align }) });
const viewportTop = (image?: ReactNode): StepAnchor => ({ kind: "viewport", position: "top-center", image });

// The Setup-panel terminal bubble: anchored to the RIGHT of the panel (vertically
// centered) rather than above it. The panel is tall (~465px) and horizontally centered
// (terrain-panel.scss), so a top-anchored bubble would overlap it; the right side has
// room to spare. On panel close (the terminal "…run again" instruction) it degrades to
// a centered bubble via pre.8's gated degrade-on-removal, so `side` only applies while open.
const setupPanel = (): StepAnchor => anchor("terrain-panel-container", "right");

// The conditional spark step (23/4, 33/4, 35/6): when a zone is still missing its
// spark, anchor the bubble + ring to the Spark button; when both zones already have
// one, a plain centered-top no-pointer bubble (no ring). Either way it is ONE step,
// matching the single arrowText line, so step-count invariants hold.
const conditionalSparkStep = (ctx: TourContext): StepAnchor =>
  ctx.sparkZoneCount >= 2 ? viewportTop() : anchor("spark-button");

/** Keyed ruleSetId (string) → categoryId (number) → factory. */
export const tourMap: Record<string, Record<number, TourFactory>> = {
  // 23 — Setup-conditions tours; terminal step anchored to the Setup panel.
  "23": {
    2: () => [anchor("restart-button"), anchor("terrain-button"), setupPanel()],
    3: () => [anchor("restart-button"), anchor("terrain-button"), setupPanel()],
    4: (ctx) => [anchor("restart-button"), conditionalSparkStep(ctx)],
  },
  // 24 — Restart → Setup → Next → Wind (the held-anchor-removal case on Next→Wind).
  "24": {
    2: () => [anchor("restart-button"), anchor("terrain-button"), anchor("terrain-next"), anchor("terrain-wind")],
    3: () => [anchor("restart-button"), anchor("terrain-button"), anchor("terrain-next"), anchor("terrain-wind")],
    4: () => [anchor("restart-button"), anchor("terrain-button"), anchor("terrain-next"), anchor("terrain-wind")],
  },
  // 25 — spark/imagery tours.
  "25": {
    // "Spark button outlined; coach mark (no pointer) centered top" → bubble + ring on Spark (v1).
    2: () => [anchor("restart-button"), anchor("spark-button")],
    // "Coach mark (no pointer) centered top" → plain centered-top bubble, no ring.
    3: () => [anchor("restart-button"), viewportTop()],
    // Mountain imagery in a centered-top bubble. Sized to fit the figure slot (179×120,
    // the new image's aspect ratio fitted inside the prior 240×120 placeholder bounds).
    4: () => [anchor("restart-button"), viewportTop(<img src={mountainImg} width={179} height={120} alt="" />)],
    // Setup-panel tour.
    5: () => [anchor("restart-button"), anchor("terrain-button"), setupPanel()],
  },
  // 32 — Setup tours + a Spark-button terminal.
  "32": {
    2: () => [anchor("restart-button"), anchor("terrain-button"), setupPanel()],
    3: () => [anchor("restart-button"), anchor("terrain-button"), setupPanel()],
    4: () => [anchor("restart-button"), anchor("terrain-button"), setupPanel()],
    5: () => [anchor("restart-button"), anchor("spark-button")],
  },
  // 33 — Setup tours + a conditional spark step.
  "33": {
    2: () => [anchor("restart-button"), anchor("terrain-button"), setupPanel()],
    3: () => [anchor("restart-button"), anchor("terrain-button"), setupPanel()],
    4: (ctx) => [anchor("restart-button"), conditionalSparkStep(ctx)],
    5: () => [anchor("restart-button"), anchor("terrain-button"), setupPanel()],
  },
  // 34 — Setup tours (the `0.` intensity-scale pointer is deferred; tour = 3 steps).
  "34": {
    2: () => [anchor("restart-button"), anchor("terrain-button"), setupPanel()],
    3: () => [anchor("restart-button"), anchor("terrain-button"), setupPanel()],
    // 34/4 duplicates 34/3 because both terminate on the Setup panel, which is
    // where both the drought slider and the wind dial live (terrain-panel.tsx).
    // No entry for 34/5: it is the success category and has no tour.
    4: () => [anchor("restart-button"), anchor("terrain-button"), setupPanel()],
  },
  // 35 — vegetation/terrain tours. Per visualFeedback, 35/2 and 35/4 terminate on the
  // Setup-panel Next button; 35/3 and 35/5 terminate on the Setup panel; 35/6 is the
  // conditional spark step. 3 and 4 swapped targets in the 2026-08-20 re-extract;
  // no test can see it, since the step count and testids are unchanged either way.
  "35": {
    2: () => [anchor("restart-button"), anchor("terrain-button"), anchor("terrain-next")],
    3: () => [anchor("restart-button"), anchor("terrain-button"), setupPanel()],
    4: () => [anchor("restart-button"), anchor("terrain-button"), anchor("terrain-next")],
    5: () => [anchor("restart-button"), anchor("terrain-button"), setupPanel()],
    6: (ctx) => [anchor("restart-button"), conditionalSparkStep(ctx)],
  },
  // 41 — Reload → Start.
  "41": {
    2: () => [anchor("reload-button"), anchor("start-button")],
  },
  // 44 — Reload → Start; and a Restart → Fireline (ring Fireline only, v1).
  "44": {
    2: () => [anchor("reload-button"), anchor("start-button")],
    3: () => [anchor("restart-button"), anchor("fireline-button")],
  },
  // 46 — Reload → Start; Restart → Fireline; Restart → Start.
  "46": {
    2: () => [anchor("reload-button"), anchor("start-button")],
    3: () => [anchor("restart-button"), anchor("fireline-button")],
    4: () => [anchor("restart-button"), anchor("start-button")],
  },
};
