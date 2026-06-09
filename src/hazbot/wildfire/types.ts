import { BaseReading } from "../engine";

// Wildfire-specific reading shape. Extends BaseReading with the fields the
// wildfire bridge's translate() callback populates from SimulationStarted /
// SimulationEnded / SimulationStopped event payloads.
export interface WildfireReading extends BaseReading {
  zones?: WildfireZone[];
  sparks?: WildfireSpark[];
  fireLineMarkers?: WildfireFireLineMarker[];
  // speed/direction are in the model's internal units (the SimulationStarted
  // snapshot logs simulation.wind.speed, not the MPH shown on the dial).
  // scaleFactor (config.windScaleFactor) converts internal speed to MPH:
  // mph = speed / scaleFactor. DefaultVars applies it so its tolerance is in
  // user-facing MPH; without it the tolerance silently scales with the preset.
  wind?: { speed: number; direction: number; scaleFactor?: number };
  // Per-preset heightmap max (config.heightmapMaxElevation; default 20000, some
  // presets override to 3000/10000). Carried so SparksAtTopAndBottom can scale its
  // TPI decision margin to the preset — config is not reachable from a sim-prop.
  // Rides along in the config snapshot; translate() forwards it.
  heightmapMaxElevation?: number;
  // Fraction of heightmapMaxElevation a spark's mean TPI must clear to count as
  // top/bottom (config.tpiMarginFraction, default 0.02, URL-tunable). Carried so
  // SparksAtTopAndBottom can set its decision margin; translate() forwards it.
  tpiMarginFraction?: number;
  // Outcome data from end-of-run triggers; opaque to current rule sets.
  outcome?: unknown;
  // Set true by the Helitack translate modifier when a helitack is dropped during
  // this run (only on SimulationStarted readings whose window is still open). Read
  // by the Helitack sim-prop and usedHelitack factor variable. Mirrors how Fireline
  // reads fireLineMarkers — tool *use*, not effectiveness (requirements.md R1).
  helitack?: boolean;
  // Set true by the no-op run terminators (Restart / Reload / TopBarReload) to
  // close this run's helitack window, so a between-runs helitack after a no-op
  // terminator is not attributed to the prior run (requirements.md R2, Technical
  // Notes "Not all run terminators currently produce readings").
  runWindowClosed?: boolean;
}

// One endpoint of a fire line drawn during a run. Matches the SimulationStarted
// payload built in src/components/bottom-bar.tsx (x / y normalized to the model
// extent; elevation from the cell under the marker).
export interface WildfireFireLineMarker {
  x: number;
  y: number;
  elevation?: number;
}

export interface WildfireZone {
  index?: number;
  terrainType?: string;
  vegetation?: string;
  droughtLevel?: string;
}

export interface WildfireSpark {
  x: number;
  y: number;
  // Matches the LARA payload field — see src/components/bottom-bar.tsx
  // SimulationStarted call site (`zoneIdx: cell?.zoneIdx`).
  zoneIdx?: number;
  // Multi-scale Topographic Position Index for this spark, one entry per
  // config.tpiBands concentric band (in band order); `null` for a band that
  // captured no usable cell. Negative => valley at that scale, positive =>
  // ridge/peak. Computed at the SimulationStarted payload site by
  // SimulationModel.tpiForSpark and used by SparksAtTopAndBottom to localize the
  // spark instead of normalizing against a single global elevation range.
  tpi?: Array<number | null>;
}

// Wildfire-specific defaults. All fields optional at the type level so the
// loader can validate per factor-variable need (Req 11a).
export interface WildfireDefaults {
  zones?: ZoneDefaults[];
  wind?: { speed: number; direction: number };
}

export interface ZoneDefaults {
  terrainType?: string;
  vegetation?: string;
  droughtLevel?: string;
}
