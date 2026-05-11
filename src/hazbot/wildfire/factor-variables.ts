import { FactorVariableImpl } from "../engine";
import { WildfireDefaults, WildfireReading, WildfireZone } from "./types";
import { sawIntenseFire } from "./factor-variable-stubs";

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
  requiredDefaults: ["zones[*].droughtLevel"],
  compute: (readings, defaults) => {
    const witnesses = simulationStartedReadings(readings).filter((r) =>
      anyZoneDiffers(r.zones, defaults.zones, "droughtLevel"));
    return { value: witnesses.length > 0, witnesses };
  },
};

const setVegetation: FactorVariableImpl<boolean, WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  requiredDefaults: ["zones[*].vegetation"],
  compute: (readings, defaults) => {
    const witnesses = simulationStartedReadings(readings).filter((r) =>
      anyZoneDiffers(r.zones, defaults.zones, "vegetation"));
    return { value: witnesses.length > 0, witnesses };
  },
};

const setTerrainType: FactorVariableImpl<boolean, WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  requiredDefaults: ["zones[*].terrainType"],
  compute: (readings, defaults) => {
    const witnesses = simulationStartedReadings(readings).filter((r) =>
      anyZoneDiffers(r.zones, defaults.zones, "terrainType"));
    return { value: witnesses.length > 0, witnesses };
  },
};

const setWind: FactorVariableImpl<boolean, WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  requiredDefaults: ["wind.speed", "wind.direction"],
  compute: (readings, defaults) => {
    const witnesses = simulationStartedReadings(readings).filter((r) =>
      r.wind !== undefined && defaults.wind !== undefined &&
      (r.wind.speed !== defaults.wind.speed || r.wind.direction !== defaults.wind.direction));
    return { value: witnesses.length > 0, witnesses };
  },
};

const setAnyZoneVar: FactorVariableImpl<boolean, WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  requiredDefaults: ["zones[*].terrainType", "zones[*].vegetation", "zones[*].droughtLevel"],
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
  requiredDefaults: [
    "zones[*].terrainType", "zones[*].vegetation", "zones[*].droughtLevel",
    "wind.speed", "wind.direction",
  ],
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

const simulationRuns: FactorVariableImpl<WildfireReading[], WildfireReading, WildfireDefaults> = {
  defaultValue: [],
  compute: (readings) => {
    const witnesses = simulationStartedReadings(readings);
    return { value: witnesses, witnesses };
  },
};

// Stub factor variables (per Req 6) imported from `./factor-variable-stubs`
// at the top of this file.
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
  sawIntenseFire,
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
