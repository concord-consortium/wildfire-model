import { FactorVariableImpl } from "../engine";
import { WildfireDefaults, WildfireReading, WildfireZone } from "./types";
import { vegetationLabels } from "../../types";
import { canonicalRunReadings } from "./canonical-runs";

// Helpers for value extraction.
function simulationStartedReadings(readings: WildfireReading[]): WildfireReading[] {
  return readings.filter((r) => r.triggeredBy === "SimulationStarted");
}

// Per the sheet (tab 24, `uniqueWindValuesUsed` Details): "If the magnitude is 0,
// then the direction has no effect and must be ignored. So set the direction to null,
// if the magnitude is 0." Collapsing zero-speed readings to a single key prevents
// two zero-magnitude runs with different directions from inflating the set's size
// and falsely tripping `uniqueWindValuesUsed.size > 1`.
function windKey(r: WildfireReading): string {
  const speed = r.wind?.speed ?? "?";
  const direction = speed === 0 ? "null" : (r.wind?.direction ?? "?");
  return `${speed}-${direction}`;
}

// === Boolean factor variables ===

const ranSimulation: FactorVariableImpl<boolean, WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  compute: (readings) => {
    const witnesses = simulationStartedReadings(readings);
    return { value: witnesses.length > 0, witnesses };
  },
};

const setDroughtLevel: FactorVariableImpl<boolean, WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  compute: (readings, defaults) => {
    const witnesses = simulationStartedReadings(readings).filter((r) =>
      anyZoneDiffers(r.zones, defaults.zones, "droughtLevel"));
    return { value: witnesses.length > 0, witnesses };
  },
};

const setVegetation: FactorVariableImpl<boolean, WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  compute: (readings, defaults) => {
    const witnesses = simulationStartedReadings(readings).filter((r) =>
      anyZoneDiffers(r.zones, defaults.zones, "vegetation"));
    return { value: witnesses.length > 0, witnesses };
  },
};

const setTerrainType: FactorVariableImpl<boolean, WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  compute: (readings, defaults) => {
    const witnesses = simulationStartedReadings(readings).filter((r) =>
      anyZoneDiffers(r.zones, defaults.zones, "terrainType"));
    return { value: witnesses.length > 0, witnesses };
  },
};

const setWind: FactorVariableImpl<boolean, WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  compute: (readings, defaults) => {
    const witnesses = simulationStartedReadings(readings).filter((r) =>
      r.wind !== undefined && defaults.wind !== undefined &&
      (r.wind.speed !== defaults.wind.speed || r.wind.direction !== defaults.wind.direction));
    return { value: witnesses.length > 0, witnesses };
  },
};

const setAnyZoneVar: FactorVariableImpl<boolean, WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  compute: (readings, defaults) => {
    const witnesses = simulationStartedReadings(readings).filter((r) =>
      anyZoneDiffers(r.zones, defaults.zones, "terrainType") ||
      anyZoneDiffers(r.zones, defaults.zones, "vegetation") ||
      anyZoneDiffers(r.zones, defaults.zones, "droughtLevel"));
    return { value: witnesses.length > 0, witnesses };
  },
};

const setAnyVar: FactorVariableImpl<boolean, WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  compute: (readings, defaults) => {
    const sims = simulationStartedReadings(readings);
    const witnesses = sims.filter((r) => {
      const zonesDiffer =
        anyZoneDiffers(r.zones, defaults.zones, "terrainType") ||
        anyZoneDiffers(r.zones, defaults.zones, "vegetation") ||
        anyZoneDiffers(r.zones, defaults.zones, "droughtLevel");
      const windDiffers = r.wind !== undefined && defaults.wind !== undefined &&
        (r.wind.speed !== defaults.wind.speed || r.wind.direction !== defaults.wind.direction);
      return zonesDiffer || windDiffers;
    });
    return { value: witnesses.length > 0, witnesses };
  },
};

const usedOneSparkPerZone: FactorVariableImpl<boolean, WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  compute: (readings) => {
    const witnesses = simulationStartedReadings(readings).filter((r) => {
      if (!r.sparks || !r.zones) return false;
      if (r.sparks.length !== r.zones.length) return false;
      // The sheet definition reads "two sparks were used with one spark per zone"
      // — the rubric is designed for multi-zone activities (tab 23 needs exactly
      // two zones and two sparks). A 1-zone / 1-spark setup trivially passes the
      // length+distinct check but doesn't demonstrate the behavior the rubric is
      // testing, so we'd falsely advance students who happen to run with one zone
      // earlier in the session. Require at least two sparks (and zones, since the
      // lengths match) so the predicate fires only when the multi-zone constraint
      // is actually exercised.
      if (r.sparks.length < 2) return false;
      // Reject sparks with undefined zoneIdx — `new Set` treats undefined as a
      // distinct value, so a mix like [0, undefined] would falsely look like 2
      // distinct zones in a 2-zone activity (e.g., when the cell lookup at
      // SimulationStarted captured zoneIdx for one spark but not the other).
      // Failing closed here keeps the "used one per zone" predicate honest.
      if (r.sparks.some((s) => s.zoneIdx === undefined)) return false;
      const zonesUsed = new Set(r.sparks.map((s) => s.zoneIdx));
      return zonesUsed.size === r.zones.length;
    });
    return { value: witnesses.length > 0, witnesses };
  },
};

// === Set / Array factor variables ===

const uniqueWindValuesUsed: FactorVariableImpl<Set<string>, WildfireReading, WildfireDefaults> = {
  defaultValue: new Set<string>(),
  compute: (readings) => {
    const sims = simulationStartedReadings(readings);
    const seen = new Set<string>();
    const witnesses: WildfireReading[] = [];
    for (const r of sims) {
      const key = windKey(r);
      if (!seen.has(key)) { seen.add(key); witnesses.push(r); }
    }
    return { value: seen, witnesses };
  },
};

const uniqueNonZeroWindValuesUsed: FactorVariableImpl<Set<string>, WildfireReading, WildfireDefaults> = {
  defaultValue: new Set<string>(),
  compute: (readings) => {
    const sims = simulationStartedReadings(readings).filter((r) => (r.wind?.speed ?? 0) > 0);
    const seen = new Set<string>();
    const witnesses: WildfireReading[] = [];
    for (const r of sims) {
      const key = windKey(r);
      if (!seen.has(key)) { seen.add(key); witnesses.push(r); }
    }
    return { value: seen, witnesses };
  },
};

// One entry per *canonical* run: pause/resume cycles (SimulationStopped →
// SimulationStarted with no reset between) collapse into a single run, so a
// student who pauses to draw a fire line and resumes is not counted as having
// run the model twice. See canonical-runs.ts for the run-boundary model.
const simulationRuns: FactorVariableImpl<WildfireReading[], WildfireReading, WildfireDefaults> = {
  defaultValue: [],
  compute: (readings) => {
    const witnesses = canonicalRunReadings(readings);
    return { value: witnesses, witnesses };
  },
};

// Per the sheet (tab 34): across all runs the union of zone vegetation covers
// every Vegetation enum value. Folds the run-union against vegetationLabels
// (src/types.ts) — the enum is the source of truth, so no sheet constant (CA-3).
const triedAllVegetations: FactorVariableImpl<boolean, WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  compute: (readings) => {
    const witnesses = simulationStartedReadings(readings);
    const seen = new Set<string>();
    for (const r of witnesses) {
      for (const z of r.zones ?? []) {
        if (z.vegetation !== undefined) seen.add(z.vegetation);
      }
    }
    const value = Object.values(vegetationLabels).every((v) => seen.has(v));
    return { value, witnesses };
  },
};

// Per the sheet (tab 45): some run drew a fire line. True if any
// SimulationStarted reading carries >= 2 fire-line markers.
const usedFireline: FactorVariableImpl<boolean, WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  compute: (readings) => {
    const witnesses = simulationStartedReadings(readings).filter(
      (r) => (r.fireLineMarkers?.length ?? 0) >= 2,
    );
    return { value: witnesses.length > 0, witnesses };
  },
};

// Per the sheet (tab 45): some run dropped a helitack. True if any
// SimulationStarted reading is flagged in-run (requirements.md R4).
const usedHelitack: FactorVariableImpl<boolean, WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  compute: (readings) => {
    const witnesses = simulationStartedReadings(readings).filter((r) => r.helitack === true);
    return { value: witnesses.length > 0, witnesses };
  },
};

export const factorVariables: Record<string, FactorVariableImpl<unknown, WildfireReading, WildfireDefaults>> = {
  ranSimulation,
  setDroughtLevel,
  setVegetation,
  setTerrainType,
  setWind,
  setAnyZoneVar,
  setAnyVar,
  usedOneSparkPerZone,
  uniqueWindValuesUsed,
  uniqueNonZeroWindValuesUsed,
  simulationRuns,
  triedAllVegetations,
  usedFireline,
  usedHelitack,
};

// Helpers ===

function anyZoneDiffers(
  zones: WildfireZone[] | undefined,
  defaultZones: WildfireDefaults["zones"],
  field: "terrainType" | "vegetation" | "droughtLevel",
): boolean {
  if (!zones || !defaultZones) return false;
  for (let i = 0; i < zones.length; i++) {
    const def = defaultZones[i];
    if (def === undefined) continue;
    if (zones[i][field] !== def[field]) return true;
  }
  return false;
}
