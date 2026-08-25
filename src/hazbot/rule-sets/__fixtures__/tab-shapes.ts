// The per-tab reading shapes, shared by each `<tab>.test.ts` and by the windowed sweep.
//
// A TabFixture carries no reading builder. Every tab's own `startReading` is
// `mkReading("SimulationStarted", at, { <base fields>, ...opts })` and nothing more, so
// one shared builder covers all ten and each tab file keeps a thin wrapper over its
// `base`. The module-private helpers below only assemble the data.
//
// Having one source means a sheet change breaks the per-category tests and the sweep
// together, instead of leaving the sweep quietly guarding a different activity than the
// one it names.

import {
  TerrainType, terrainLabels, Vegetation, vegetationLabels, DroughtLevel, droughtLabels,
} from "../../../types";
import { WildfireDefaults, WildfireReading, WildfireZone } from "../../wildfire/types";

export interface TabShape {
  // Used in sweep failure messages, e.g. "correct/perZone -> default/noSparks".
  name: string;
  // The delta over the tab's `base` that produces this shape.
  reading: Partial<WildfireReading>;
}

export interface TabFixture {
  id: string;
  // Optional, mirroring makeWildfireEngine's own signature rather than tightening it.
  // Rule set 25 references no `set*` factor variable and no defaults-consuming sim-prop,
  // so it is the one tab that deliberately builds its engine with no defaults. Requiring
  // it here would force a meaningless value into the one tab whose point is not having
  // one.
  defaults?: WildfireDefaults;
  // The per-reading fields this tab's own startReading fills in before spreading opts.
  base: Partial<WildfireReading>;
  shapes: TabShape[];
}

const noWind = { speed: 0, direction: 0 };

// Every tab's axis set is its zone shapes crossed with one other axis (sparks, wind, or
// tools), so one cross covers all ten. Plain forEach loops: this project's TS lib target
// predates ES2019, so flatMap does not compile.
function cross(
  zoneShapes: Array<{ name: string; zones: WildfireZone[] }>,
  variants: TabShape[],
): TabShape[] {
  const out: TabShape[] = [];
  zoneShapes.forEach((z) => {
    variants.forEach((v) => {
      out.push({ name: `${z.name}/${v.name}`, reading: { zones: z.zones, ...v.reading } });
    });
  });
  return out;
}

const noSparksOrPerZone = (sparks: WildfireReading["sparks"]): TabShape[] => [
  { name: "noSparks", reading: {} },
  { name: "perZone", reading: { sparks } },
];

const toolVariants = (fireLine: WildfireReading["fireLineMarkers"]): TabShape[] => [
  { name: "noFireline/noHelitack", reading: {} },
  { name: "noFireline/helitack", reading: { helitack: true } },
  { name: "fireline/noHelitack", reading: { fireLineMarkers: fireLine } },
  { name: "fireline/helitack", reading: { fireLineMarkers: fireLine, helitack: true } },
];

// ---------------------------------------------------------------------------- 23

const zone23 = {
  terrainType: terrainLabels[TerrainType.Plains],
  vegetation: vegetationLabels[Vegetation.Shrub],
  droughtLevel: droughtLabels[DroughtLevel.MildDrought],
};
const defaultZones23 = [zone23, zone23];
// The sheet-defined "correct zone setup" (CorrectZoneSetup, tab 23 R16):
//   zone 1 = Foothills / Grass / No Drought; zone 2 = Foothills / Grass / Mild Drought.
// Built through the label maps so a src/types.ts relabeling tracks automatically.
const correctZones23 = [
  {
    terrainType: terrainLabels[TerrainType.Foothills],
    vegetation: vegetationLabels[Vegetation.Grass],
    droughtLevel: droughtLabels[DroughtLevel.NoDrought],
  },
  {
    terrainType: terrainLabels[TerrainType.Foothills],
    vegetation: vegetationLabels[Vegetation.Grass],
    droughtLevel: droughtLabels[DroughtLevel.MildDrought],
  },
];
// Changed from default but NOT the correct setup (zone-1 drought bumped to Severe).
const changedIncorrectZones23 = [
  { ...zone23, droughtLevel: droughtLabels[DroughtLevel.SevereDrought] },
  zone23,
];
const oneSpark23 = [{ x: 0, y: 0, zoneIdx: 0 }];
const sparksPerZone23 = [{ x: 0, y: 0, zoneIdx: 0 }, { x: 1, y: 0, zoneIdx: 1 }];

// Annotated rather than asserted: every WildfireDefaults field is optional, so an
// `as` cast would silently accept a misspelled key.
const defaults23: WildfireDefaults = { zones: defaultZones23, wind: noWind };

export const vars23 = {
  defaults: defaults23,
  correctZones: correctZones23,
  changedIncorrectZones: changedIncorrectZones23,
  sparksPerZone: sparksPerZone23,
};

export const tab23: TabFixture = {
  id: "23",
  defaults: vars23.defaults,
  base: { zones: defaultZones23, sparks: [], wind: noWind },
  shapes: cross(
    [
      { name: "default", zones: defaultZones23 },
      { name: "correct", zones: correctZones23 },
      { name: "changed", zones: changedIncorrectZones23 },
    ],
    [
      { name: "noSparks", reading: {} },
      { name: "oneSpark", reading: { sparks: oneSpark23 } },
      { name: "perZone", reading: { sparks: sparksPerZone23 } },
    ],
  ),
};

// ---------------------------------------------------------------------------- 25

const uniformZones25 = [
  { vegetation: "Shrub", droughtLevel: "Mild Drought" },
  { vegetation: "Shrub", droughtLevel: "Mild Drought" },
];
const nonUniformZones25 = [
  { vegetation: "Shrub", droughtLevel: "Mild Drought" },
  { vegetation: "Forest", droughtLevel: "Mild Drought" },
];
const oneSpark25 = [{ x: 0, y: 0, zoneIdx: 0 }];
const twoSparksSameZone25 = [{ x: 0, y: 0, zoneIdx: 0 }, { x: 1, y: 0, zoneIdx: 0 }];
const oneSparkPerZone25 = [{ x: 0, y: 0, zoneIdx: 0 }, { x: 1, y: 0, zoneIdx: 1 }];
// Topography fixtures for the cats 4/5/6 readings. heightmapMaxElevation × the margin
// fraction scales the predicate's margin (0.02 × 20000 = 400 ft); the ridge / valley TPI
// arrays clear it, the mid-slope arrays do not. The fraction is pinned on every reading
// that carries these sparks so these tests stay stable if SparksAtTopAndBottom's
// DEFAULT_TPI_MARGIN_FRACTION is later retuned.
const HEIGHTMAP_MAX_25 = 20000;
const TPI_MARGIN_FRACTION_25 = 0.02;
const topo25 = { heightmapMaxElevation: HEIGHTMAP_MAX_25, tpiMarginFraction: TPI_MARGIN_FRACTION_25 };
// One spark per zone: zone 0 on a ridge (positive TPI at every scale), zone 1 in a
// valley (negative TPI at every scale).
const sparksTopBottom25 = [
  { x: 0, y: 0, zoneIdx: 0, tpi: [3000, 2000, 1500] },
  { x: 1, y: 0, zoneIdx: 1, tpi: [-3000, -2000, -1500] },
];
// One spark per zone, both mid-slope (TPI ~ 0 -> NOT top/bottom).
const sparksPerZoneMid25 = [
  { x: 0, y: 0, zoneIdx: 0, tpi: [200, -100, 50] },
  { x: 1, y: 0, zoneIdx: 1, tpi: [-150, 100, 0] },
];

export const vars25 = {
  uniformZones: uniformZones25,
  nonUniformZones: nonUniformZones25,
  oneSpark: oneSpark25,
  twoSparksSameZone: twoSparksSameZone25,
  oneSparkPerZone: oneSparkPerZone25,
  HEIGHTMAP_MAX: HEIGHTMAP_MAX_25,
  TPI_MARGIN_FRACTION: TPI_MARGIN_FRACTION_25,
  sparksTopBottom: sparksTopBottom25,
  sparksPerZoneMid: sparksPerZoneMid25,
};

// No `defaults`: rule set 25 references no `set*` factor variable and no
// defaults-consuming sim-prop, and 25.test.ts builds its engine with one argument.
export const tab25: TabFixture = {
  id: "25",
  base: { zones: uniformZones25, sparks: [], wind: noWind },
  shapes: cross(
    [
      { name: "uniform", zones: uniformZones25 },
      { name: "nonUniform", zones: nonUniformZones25 },
    ],
    [
      { name: "noSparks", reading: {} },
      { name: "oneSpark", reading: { sparks: oneSpark25 } },
      { name: "twoSameZone", reading: { sparks: twoSparksSameZone25 } },
      // The topography fields ride with the sparks that need them rather than sitting in
      // `base`, so `base` stays equal to 25.test.ts's own startReading literal.
      { name: "perZoneMid", reading: { sparks: sparksPerZoneMid25, ...topo25 } },
      { name: "topBottom", reading: { sparks: sparksTopBottom25, ...topo25 } },
    ],
  ),
};

// ---------------------------------------------------------------------------- 32

const zone32: WildfireZone = { terrainType: "Plains", vegetation: "Grass", droughtLevel: "Mild Drought" };
const defaultZones32 = [zone32, zone32, zone32];
// Three distinct vegetations, one per zone → UniqueVegetationPerZone true.
const uniqueVegUniformDrought32: WildfireZone[] = [
  { terrainType: "Plains", vegetation: "Grass", droughtLevel: "Mild Drought" },
  { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Mild Drought" },
  { terrainType: "Plains", vegetation: "Forest", droughtLevel: "Mild Drought" },
];
const uniqueVegNonUniformDrought32: WildfireZone[] = [
  { terrainType: "Plains", vegetation: "Grass", droughtLevel: "Mild Drought" },
  { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Mild Drought" },
  { terrainType: "Plains", vegetation: "Forest", droughtLevel: "Severe Drought" },
];
// Drought changed but vegetation left at default (all Grass) → not unique veg.
const droughtChangedNotUniqueVeg32: WildfireZone[] = [
  { terrainType: "Plains", vegetation: "Grass", droughtLevel: "Severe Drought" },
  { terrainType: "Plains", vegetation: "Grass", droughtLevel: "Mild Drought" },
  { terrainType: "Plains", vegetation: "Grass", droughtLevel: "Mild Drought" },
];
const sparksPerZone32 = [
  { x: 0, y: 0, zoneIdx: 0 }, { x: 1, y: 0, zoneIdx: 1 }, { x: 2, y: 0, zoneIdx: 2 },
];

const defaults32: WildfireDefaults = { zones: defaultZones32, wind: noWind };

export const vars32 = {
  defaults: defaults32,
  uniqueVegUniformDrought: uniqueVegUniformDrought32,
  uniqueVegNonUniformDrought: uniqueVegNonUniformDrought32,
  droughtChangedNotUniqueVeg: droughtChangedNotUniqueVeg32,
  sparksPerZone: sparksPerZone32,
};

export const tab32: TabFixture = {
  id: "32",
  defaults: vars32.defaults,
  base: { zones: defaultZones32, sparks: [], wind: noWind },
  shapes: cross(
    [
      { name: "default", zones: defaultZones32 },
      { name: "uniqVegUniform", zones: uniqueVegUniformDrought32 },
      { name: "uniqVegNonUniform", zones: uniqueVegNonUniformDrought32 },
      { name: "droughtNotUniqVeg", zones: droughtChangedNotUniqueVeg32 },
    ],
    noSparksOrPerZone(sparksPerZone32),
  ),
};

// ---------------------------------------------------------------------------- 33

const zone33: WildfireZone = { terrainType: "Mountains", vegetation: "Shrub", droughtLevel: "Mild Drought" };
const defaultZones33 = [zone33, zone33];
// One zone Forest, the other Forest With Suppression → ForestWAWOSuppression true.
const forestWWUniformDrought33: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Forest", droughtLevel: "Mild Drought" },
  { terrainType: "Mountains", vegetation: "Forest With Suppression", droughtLevel: "Mild Drought" },
];
const forestWWNonUniformDrought33: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Forest", droughtLevel: "Mild Drought" },
  { terrainType: "Mountains", vegetation: "Forest With Suppression", droughtLevel: "Severe Drought" },
];
// A var changed (drought) but no forest-with/without-suppression pairing.
const changedNotForest33: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Shrub", droughtLevel: "Severe Drought" },
  { terrainType: "Mountains", vegetation: "Shrub", droughtLevel: "Mild Drought" },
];
const sparksPerZone33 = [{ x: 0, y: 0, zoneIdx: 0 }, { x: 1, y: 0, zoneIdx: 1 }];

const defaults33: WildfireDefaults = { zones: defaultZones33, wind: noWind };

export const vars33 = {
  defaults: defaults33,
  forestWWUniformDrought: forestWWUniformDrought33,
  forestWWNonUniformDrought: forestWWNonUniformDrought33,
  changedNotForest: changedNotForest33,
  sparksPerZone: sparksPerZone33,
};

export const tab33: TabFixture = {
  id: "33",
  defaults: vars33.defaults,
  base: { zones: defaultZones33, sparks: [], wind: noWind },
  shapes: cross(
    [
      { name: "default", zones: defaultZones33 },
      { name: "forestUniform", zones: forestWWUniformDrought33 },
      { name: "forestNonUniform", zones: forestWWNonUniformDrought33 },
      { name: "changedNotForest", zones: changedNotForest33 },
    ],
    noSparksOrPerZone(sparksPerZone33),
  ),
};

// ---------------------------------------------------------------------------- 34

const terrains34 = ["Mountains", "Foothills", "Plains"];
// Keeps each zone's fixed terrain; vegetation and drought vary. Private to this module:
// only its outputs are shared, which 34.test.ts takes from `vars34` rather than rebuilding.
function zones34(veg: [string, string, string], drought = "Mild Drought"): WildfireZone[] {
  return [0, 1, 2].map((i) => ({
    terrainType: terrains34[i], vegetation: veg[i], droughtLevel: drought,
  }));
}
const defaultZones34 = zones34(["Shrub", "Shrub", "Shrub"]);
const vegChanged34 = zones34(["Forest", "Shrub", "Shrub"]);
const droughtChanged34 = zones34(["Shrub", "Shrub", "Shrub"], "Severe Drought");
const vegAndDroughtChanged34 = zones34(["Forest", "Shrub", "Shrub"], "Severe Drought");
const changedWind34 = { speed: 9, direction: 90 };

const defaults34: WildfireDefaults = { zones: defaultZones34, wind: noWind };

export const vars34 = {
  defaults: defaults34,
  changedWind: changedWind34,
  vegChanged: vegChanged34,
  droughtChanged: droughtChanged34,
  vegAndDroughtChanged: vegAndDroughtChanged34,
};

export const tab34: TabFixture = {
  id: "34",
  defaults: vars34.defaults,
  base: { zones: defaultZones34, sparks: [], wind: noWind },
  shapes: cross(
    [
      { name: "vegDefault/droughtDefault", zones: defaultZones34 },
      { name: "vegDefault/droughtSevere", zones: droughtChanged34 },
      { name: "vegChanged/droughtDefault", zones: vegChanged34 },
      { name: "vegChanged/droughtSevere", zones: vegAndDroughtChanged34 },
    ],
    [
      { name: "windDefault", reading: { wind: noWind } },
      { name: "windChanged", reading: { wind: changedWind34 } },
    ],
  ),
};

// ---------------------------------------------------------------------------- 35

const zone35: WildfireZone = { terrainType: "Mountains", vegetation: "Shrub", droughtLevel: "Mild Drought" };
const defaultZones35 = [zone35, zone35];
// One zone Forest, the other Forest With Suppression → ForestWAWOSuppression true.
const forestWW35: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Forest", droughtLevel: "Mild Drought" },
  { terrainType: "Mountains", vegetation: "Forest With Suppression", droughtLevel: "Mild Drought" },
];
const forestWWNonUniformDrought35: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Forest", droughtLevel: "Mild Drought" },
  { terrainType: "Mountains", vegetation: "Forest With Suppression", droughtLevel: "Severe Drought" },
];
const forestWWNonUniformTerrain35: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Forest", droughtLevel: "Mild Drought" },
  { terrainType: "Foothills", vegetation: "Forest With Suppression", droughtLevel: "Mild Drought" },
];
// A var changed (drought), terrain left uniform, no forest-with/without-suppression
// pairing → cat 4 under the new table.
const changedNotForest35: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Shrub", droughtLevel: "Severe Drought" },
  { terrainType: "Mountains", vegetation: "Shrub", droughtLevel: "Mild Drought" },
];
// The state that used to match NO category: uniform terrain, UNIFORM drought, and no
// forest pairing, with a var still changed (vegetation off its Shrub default) so the
// setAnyVar guard is satisfied. Note the uniform drought — changedNotForest above has
// two different droughts and so was always covered, by the old cat 4 as well as the new.
const uniformDroughtNoForest35: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Forest", droughtLevel: "Mild Drought" },
  { terrainType: "Mountains", vegetation: "Forest", droughtLevel: "Mild Drought" },
];
const sparksPerZone35 = [{ x: 0, y: 0, zoneIdx: 0 }, { x: 1, y: 0, zoneIdx: 1 }];

const defaults35: WildfireDefaults = { zones: defaultZones35, wind: noWind };

export const vars35 = {
  defaults: defaults35,
  forestWW: forestWW35,
  forestWWNonUniformDrought: forestWWNonUniformDrought35,
  forestWWNonUniformTerrain: forestWWNonUniformTerrain35,
  changedNotForest: changedNotForest35,
  uniformDroughtNoForest: uniformDroughtNoForest35,
  sparksPerZone: sparksPerZone35,
};

export const tab35: TabFixture = {
  id: "35",
  defaults: vars35.defaults,
  base: { zones: defaultZones35, sparks: [], wind: noWind },
  shapes: cross(
    [
      { name: "default", zones: defaultZones35 },
      { name: "forestWW", zones: forestWW35 },
      { name: "forestNonUniformDrought", zones: forestWWNonUniformDrought35 },
      { name: "forestNonUniformTerrain", zones: forestWWNonUniformTerrain35 },
      { name: "changedNotForest", zones: changedNotForest35 },
      { name: "uniformDroughtNoForest", zones: uniformDroughtNoForest35 },
    ],
    noSparksOrPerZone(sparksPerZone35),
  ),
};

// ---------------------------------------------------------------------------- 41

const defaultZones41: WildfireZone[] = [
  { terrainType: "Foothills", vegetation: "Grass", droughtLevel: "Medium Drought" },
  { terrainType: "Foothills", vegetation: "Shrub", droughtLevel: "Mild Drought" },
];
const defaultWind41 = { speed: 10, direction: 270.5 };
const changedWind41 = { speed: 25, direction: 90 };

const defaults41: WildfireDefaults = { zones: defaultZones41, wind: defaultWind41 };

export const vars41 = {
  changedWind: changedWind41,
  defaults: defaults41,
};

export const tab41: TabFixture = {
  id: "41",
  defaults: vars41.defaults,
  base: { zones: defaultZones41, sparks: [], wind: defaultWind41 },
  shapes: [
    { name: "default", reading: {} },
    { name: "changedWind", reading: { wind: changedWind41 } },
  ],
};

// ---------------------------------------------------------------------------- 44

const defaultZones44: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Shrub", droughtLevel: "No Drought" },
  { terrainType: "Foothills", vegetation: "Shrub", droughtLevel: "No Drought" },
  { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "No Drought" },
];
const defaultWind44 = { speed: 20, direction: 100 };
// A zone changed from default → DefaultVars false.
const changedZones44: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Shrub", droughtLevel: "Severe Drought" },
  { terrainType: "Foothills", vegetation: "Shrub", droughtLevel: "No Drought" },
  { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "No Drought" },
];
const fireLine44 = [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.2 }];

const defaults44: WildfireDefaults = { zones: defaultZones44, wind: defaultWind44 };

export const vars44 = {
  changedZones: changedZones44,
  fireLine: fireLine44,
  defaults: defaults44,
};

export const tab44: TabFixture = {
  id: "44",
  defaults: vars44.defaults,
  base: { zones: defaultZones44, sparks: [], fireLineMarkers: [], wind: defaultWind44 },
  shapes: cross(
    [{ name: "default", zones: defaultZones44 }, { name: "changed", zones: changedZones44 }],
    toolVariants(fireLine44),
  ),
};

// ---------------------------------------------------------------------------- 46

const defaultZones46: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Forest", droughtLevel: "Mild Drought" },
  { terrainType: "Foothills", vegetation: "Shrub", droughtLevel: "Medium Drought" },
  { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Medium Drought" },
];
const defaultWind46 = { speed: 30, direction: 265 };
// A zone changed from default → DefaultVars false.
const changedZones46: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Forest", droughtLevel: "Severe Drought" },
  { terrainType: "Foothills", vegetation: "Shrub", droughtLevel: "Medium Drought" },
  { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Medium Drought" },
];
const fireLine46 = [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.2 }];

const defaults46: WildfireDefaults = { zones: defaultZones46, wind: defaultWind46 };

export const vars46 = {
  changedZones: changedZones46,
  fireLine: fireLine46,
  defaults: defaults46,
};

export const tab46: TabFixture = {
  id: "46",
  defaults: vars46.defaults,
  base: { zones: defaultZones46, sparks: [], fireLineMarkers: [], wind: defaultWind46 },
  shapes: cross(
    [{ name: "default", zones: defaultZones46 }, { name: "changed", zones: changedZones46 }],
    toolVariants(fireLine46),
  ),
};

export const TAB_FIXTURES: TabFixture[] = [
  tab23, tab25, tab32, tab33, tab34, tab35, tab41, tab44, tab46,
];
