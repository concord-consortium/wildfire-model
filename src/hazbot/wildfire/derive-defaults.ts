import { ISimulationConfig } from "../../config";
import {
  terrainLabels, vegetationLabels, droughtLabels,
  TerrainType, Vegetation, DroughtLevel,
} from "../../types";
import { WildfireDefaults } from "./types";

// Derives the engine's change-detection defaults from a resolved simulation
// config (preset + URL params) — per WM-27 Requirements 2–4.
//
// One zone default is emitted per populated entry of the config.zones tuple,
// in tuple order, independent of zonesCount (Requirement 3). Enum values are
// converted to the same string labels the SimulationStarted payload uses
// (terrainLabels / vegetationLabels / droughtLabels — bottom-bar.tsx) so the
// set* factor-variable comparisons are like-for-like.
//
// No defensive validation, by design (see requirements.md Technical Notes).
// The `as` casts are required because `ZoneOptions` (the config zone shape in
// src/models/zone.ts) types these fields loosely: `terrainType?` / `vegetation?`
// are optional and `droughtLevel?` is `number`, not `DroughtLevel`. A resolved
// config's zones are always fully populated at runtime — getDefaultConfig() and
// every preset in src/presets.ts set all three fields, and both are
// TypeScript-checked — so the casts assert a guarantee the `ZoneOptions` type is
// too loose to express. They add no runtime check; a malformed hand-crafted
// `?zones=` URL param is a pre-existing loud failure of the simulation itself.
export function deriveWildfireDefaults(config: ISimulationConfig): WildfireDefaults {
  const zones = config.zones
    .filter((z): z is NonNullable<typeof z> => z !== undefined)
    .map((z) => ({
      terrainType: terrainLabels[z.terrainType as TerrainType],
      vegetation: vegetationLabels[z.vegetation as Vegetation],
      droughtLevel: droughtLabels[z.droughtLevel as DroughtLevel],
    }));
  return {
    zones,
    wind: { speed: config.windSpeed, direction: config.windDirection },
  };
}
