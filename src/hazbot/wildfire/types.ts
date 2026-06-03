import { BaseReading } from "../engine";

// Wildfire-specific reading shape. Extends BaseReading with the fields the
// wildfire bridge's translate() callback populates from SimulationStarted /
// SimulationEnded / SimulationStopped event payloads.
export interface WildfireReading extends BaseReading {
  zones?: WildfireZone[];
  sparks?: WildfireSpark[];
  fireLineMarkers?: WildfireFireLineMarker[];
  wind?: { speed: number; direction: number };
  // Immutable-topography elevation extrema of the grid (min/max of
  // cell.baseElevation), computed at the SimulationStarted payload site and
  // forwarded by translate(). Used by SparksAtTopAndBottom to normalize each
  // spark's elevation. Excludes only the fillTerrainEdges perimeter cells; see
  // requirements.md R3 "Exact exclusion rule".
  elevationRange?: { min: number; max: number };
  // Per-preset heightmap max (config.heightmapMaxElevation; default 20000, some
  // presets override to 3000/10000). Carried so the predicate can derive the
  // flat-terrain minimum-span floor (R3) — config is not reachable from a
  // sim-prop. Rides along in the config snapshot; translate() forwards it.
  heightmapMaxElevation?: number;
  // Outcome data from end-of-run triggers; opaque to current rule sets.
  outcome?: unknown;
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
  elevation?: number;
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
