import { SimPropImpl } from "../engine";
import { WildfireDefaults, WildfireReading } from "./types";

// Sim-props are bridge-side TS predicates evaluated against a single Reading
// bound by WITH (per Req 5 / Req 12).

const OneSparkPerZone: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  evaluate: (reading) => {
    if (!reading.sparks || !reading.zones) return false;
    if (reading.sparks.length !== reading.zones.length) return false;
    // Same fail-closed rule as `usedOneSparkPerZone` — undefined zoneIdx values
    // mixed with real ones would inflate the distinct-zone count via Set semantics.
    if (reading.sparks.some((s) => s.zoneIdx === undefined)) return false;
    const zonesUsed = new Set(reading.sparks.map((s) => s.zoneIdx));
    return zonesUsed.size === reading.zones.length;
  },
};

const UniqueVegetationPerZone: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  evaluate: (reading) => {
    if (!reading.zones || reading.zones.length === 0) return false;
    const vegs = reading.zones.map((z) => z.vegetation);
    // Reject undefined zone vegetations — same Set false-positive risk as the
    // spark-per-zone predicates. If the snapshot caught zones before vegetation
    // labels resolved, this fails closed instead of claiming spurious uniqueness.
    if (vegs.some((v) => v === undefined)) return false;
    return new Set(vegs).size === vegs.length;
  },
};

const UniformDroughtLevels: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  evaluate: (reading) => {
    if (!reading.zones || reading.zones.length === 0) return false;
    const droughts = reading.zones.map((z) => z.droughtLevel);
    // All-undefined zones would collapse to Set([undefined]).size === 1 and
    // falsely report "uniform" when the data simply hasn't been set. Fail closed.
    if (droughts.some((d) => d === undefined)) return false;
    return new Set(droughts).size === 1;
  },
};

const UniformTerrainTypes: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  evaluate: (reading) => {
    if (!reading.zones || reading.zones.length === 0) return false;
    const terrains = reading.zones.map((z) => z.terrainType);
    if (terrains.some((t) => t === undefined)) return false;
    return new Set(terrains).size === 1;
  },
};

// Paired-runs check: per the sheet's "two-run" semantics. For now, evaluate
// the witness reading's own zones for the suppression terrain type — full
// paired-run logic comes later if the sheet specifies it.
const ForestWAWOSuppression: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  evaluate: (reading) => {
    if (!reading.zones) return false;
    const hasForestWith = reading.zones.some((z) => z.vegetation === "Forest With Suppression");
    const hasForestWithout = reading.zones.some((z) => z.vegetation === "Forest");
    return hasForestWith && hasForestWithout;
  },
};

const TwoSparks: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  evaluate: (reading) => (reading.sparks?.length ?? 0) === 2,
};

// Reads ambient state (chartTabOpenAtStart) on the witness reading + walks
// updates for ChartTabShown (per Tech Notes / sheet definition).
const GraphOpen: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  ambientStateKeys: { SimulationStarted: ["chartTabOpenAtStart"] },
  evaluate: (reading) => {
    if (reading.ambientState?.chartTabOpenAtStart) return true;
    return reading.updates.some((u) => u.source === "ChartTabShown");
  },
};

// Stub (per Req 6 / IMPL-4).
const SparksAtTopAndBottom: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  isStub: true,
  evaluate: () => false,
};

export const simProps: Record<string, SimPropImpl<WildfireReading, WildfireDefaults>> = {
  OneSparkPerZone,
  UniqueVegetationPerZone,
  UniformDroughtLevels,
  UniformTerrainTypes,
  ForestWAWOSuppression,
  TwoSparks,
  GraphOpen,
  SparksAtTopAndBottom,
};
