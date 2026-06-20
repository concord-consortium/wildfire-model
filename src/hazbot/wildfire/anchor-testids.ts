// Canonical list of `data-testid`s the Hazbot tour anchor map (tour-map.tsx) may
// reference (WM-17). Typing the map's `testid` field as `AnchorTestId` makes a
// reference to an unlisted testid a compile error rather than a runtime risk.
//
// Every id here is structurally present regardless of preset/config: the seven
// bottom-bar controls are unconditionally rendered (only a `disabled` prop is
// toggled — bottom-bar.tsx), and the three Setup-panel ids are added by WM-17 and
// present whenever the panel is open at the relevant sub-panel. `fire-intensity-scale`
// is intentionally NOT listed — after deferring ruleset 34's intensity-scale cue no
// tour anchors to it, and it is the one id rendered conditionally (showBurnIndex).
export const ANCHOR_TESTIDS = [
  "restart-button",
  "reload-button",
  "terrain-button",        // the "Setup" button
  "spark-button",
  "start-button",
  "fireline-button",
  "helitack-button",
  "terrain-panel-container",
  "terrain-next",
  "terrain-wind",
] as const;

export type AnchorTestId = typeof ANCHOR_TESTIDS[number];
