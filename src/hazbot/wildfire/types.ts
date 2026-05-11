import { BaseReading } from "../engine";

// Wildfire-specific reading shape. Extends BaseReading with the fields the
// wildfire bridge's translate() callback populates from SimulationStarted /
// SimulationEnded / SimulationStopped event payloads.
export interface WildfireReading extends BaseReading {
  zones?: WildfireZone[];
  sparks?: WildfireSpark[];
  wind?: { speed: number; direction: number };
  ambientState?: { chartTabOpenAtStart?: boolean };
  // Outcome data from end-of-run triggers; opaque to current rule sets.
  outcome?: unknown;
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
