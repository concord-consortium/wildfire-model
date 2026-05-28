import { Zone } from "../models/zone";

export interface ISetupSnapshot {
  zonesCount: number;
  zones: Array<{ terrainType: number; vegetation: number; droughtLevel: number }>;
  windSpeed: number;
  windDirection: number;
}

export const captureSimulationSnapshot = (
  simulation: { zones: Zone[]; wind: { speed: number; direction: number } }
): ISetupSnapshot => ({
  zonesCount: simulation.zones.length,
  zones: simulation.zones.map(z => ({
    terrainType: z.terrainType,
    vegetation: z.vegetation,
    droughtLevel: z.droughtLevel,
  })),
  windSpeed: simulation.wind.speed,
  windDirection: simulation.wind.direction,
});

export const setupSnapshotDiffers = (
  snapshot: ISetupSnapshot,
  current: { zonesCount: number; zones: Zone[]; windSpeed: number; windDirection: number }
): boolean => {
  if (snapshot.zonesCount !== current.zonesCount) return true;
  if (snapshot.windSpeed !== current.windSpeed) return true;
  if (snapshot.windDirection !== current.windDirection) return true;
  if (snapshot.zones.length !== current.zones.length) return true;
  for (let i = 0; i < snapshot.zones.length; i++) {
    const s = snapshot.zones[i];
    const c = current.zones[i];
    if (s.terrainType !== c.terrainType) return true;
    if (s.vegetation !== c.vegetation) return true;
    if (s.droughtLevel !== c.droughtLevel) return true;
  }
  return false;
};
