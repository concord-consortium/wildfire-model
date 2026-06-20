import { EngineStep } from "@concord-consortium/coachmarks";
import { tourData } from "./tour-data.generated";
import { tourMap, TourContext } from "./tour-map";

// Pure tour-building logic (WM-17): zip the build-time-generated per-step TEXT
// (tour-data.generated.ts) with the hand-authored per-step ANCHOR/style (tour-map.tsx)
// into the coachmarks `EngineStep[]` passed to a gated `drive(...)`. Returns null for a
// non-coaching category (no generated text or no map entry), so the renderer falls back
// to the plain intro popover.
//
// Advance semantics are decided here, not in the map: the terminal step is Done-terminated
// (no advanceOn); each earlier ANCHOR step advances on a click of its target (gated). Anchor
// steps use a `target` CSS selector (resolved + awaited at step entry by pre.8) so steps that
// appear only after an earlier action (the Setup panel, its Next button, its Wind section)
// anchor once present. Viewport steps are no-pointer centered-top bubbles with no ring.
export function buildTour(
  ruleSetId: string,
  categoryId: number,
  ctx: TourContext,
): EngineStep[] | null {
  const data = tourData[ruleSetId]?.[categoryId];
  const factory = tourMap[ruleSetId]?.[categoryId];
  if (!data || !factory) return null; // non-coaching → no tour

  const anchors = factory(ctx);
  // Step counts are also asserted in tour-map.test.ts; guard defensively at runtime so
  // a future authoring drift degrades to the intro popover rather than a mis-zipped tour.
  if (anchors.length !== data.steps.length) return null;

  return anchors.map((a, i) => {
    const isLast = i === anchors.length - 1;
    const description = data.steps[i].text;
    if (a.kind === "viewport") {
      // No-pointer centered-top bubble; no ring. The image (when present) renders in the
      // popover figure slot (pre.8). Viewport steps are never intermediate-advanceable.
      return {
        popover: {
          position: a.position,
          description,
          ...(a.image ? { image: a.image } : {}),
        },
      };
    }
    // Anchor step → selector target; the engine's showOutlineRing draws the ring on the
    // resolved element (ringTarget defaults to target). Intermediate steps advance on a
    // click of the target; the terminal step is Done-terminated.
    return {
      target: `[data-testid="${a.testid}"]`,
      ...(isLast ? {} : { advanceOn: { event: "click" as const } }),
      popover: { side: "top" as const, align: "center" as const, description },
    };
  });
}
