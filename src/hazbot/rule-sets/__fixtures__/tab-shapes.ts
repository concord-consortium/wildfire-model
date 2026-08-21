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

export const vars23 = {
  defaults: { zones: defaultZones23, wind: noWind } as WildfireDefaults,
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

export const vars32 = {
  defaults: { zones: defaultZones32, wind: noWind } as WildfireDefaults,
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

export const vars33 = {
  defaults: { zones: defaultZones33, wind: noWind } as WildfireDefaults,
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
// only its outputs are shared, and 34.test.ts keeps its own copy for its local cases.
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

export const vars34 = {
  defaults: { zones: defaultZones34, wind: noWind } as WildfireDefaults,
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

export const vars35 = {
  defaults: { zones: defaultZones35, wind: noWind } as WildfireDefaults,
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

// ---------------------------------------------------------------------------- 42

const defaultZones42: WildfireZone[] = [
  { terrainType: "Foothills", vegetation: "Grass", droughtLevel: "Medium Drought" },
  { terrainType: "Foothills", vegetation: "Shrub", droughtLevel: "Mild Drought" },
];
const defaultWind42 = { speed: 10, direction: 270.5 };
const changedWind42 = { speed: 25, direction: 90 };

export const vars42 = {
  changedWind: changedWind42,
  defaults: { zones: defaultZones42, wind: defaultWind42 } as WildfireDefaults,
};

export const tab42: TabFixture = {
  id: "42",
  defaults: vars42.defaults,
  base: { zones: defaultZones42, sparks: [], wind: defaultWind42 },
  shapes: [
    { name: "default", reading: {} },
    { name: "changedWind", reading: { wind: changedWind42 } },
  ],
};

// ---------------------------------------------------------------------------- 45

const defaultZones45: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Shrub", droughtLevel: "No Drought" },
  { terrainType: "Foothills", vegetation: "Shrub", droughtLevel: "No Drought" },
  { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "No Drought" },
];
const defaultWind45 = { speed: 20, direction: 100 };
// A zone changed from default → DefaultVars false.
const changedZones45: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Shrub", droughtLevel: "Severe Drought" },
  { terrainType: "Foothills", vegetation: "Shrub", droughtLevel: "No Drought" },
  { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "No Drought" },
];
const fireLine45 = [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.2 }];

export const vars45 = {
  changedZones: changedZones45,
  fireLine: fireLine45,
  defaults: { zones: defaultZones45, wind: defaultWind45 } as WildfireDefaults,
};

export const tab45: TabFixture = {
  id: "45",
  defaults: vars45.defaults,
  base: { zones: defaultZones45, sparks: [], fireLineMarkers: [], wind: defaultWind45 },
  shapes: cross(
    [{ name: "default", zones: defaultZones45 }, { name: "changed", zones: changedZones45 }],
    toolVariants(fireLine45),
  ),
};

// ---------------------------------------------------------------------------- 47

const defaultZones47: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Forest", droughtLevel: "Mild Drought" },
  { terrainType: "Foothills", vegetation: "Shrub", droughtLevel: "Medium Drought" },
  { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Medium Drought" },
];
const defaultWind47 = { speed: 30, direction: 265 };
// A zone changed from default → DefaultVars false.
const changedZones47: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Forest", droughtLevel: "Severe Drought" },
  { terrainType: "Foothills", vegetation: "Shrub", droughtLevel: "Medium Drought" },
  { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Medium Drought" },
];
const fireLine47 = [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.2 }];

export const vars47 = {
  changedZones: changedZones47,
  fireLine: fireLine47,
  defaults: { zones: defaultZones47, wind: defaultWind47 } as WildfireDefaults,
};

export const tab47: TabFixture = {
  id: "47",
  defaults: vars47.defaults,
  base: { zones: defaultZones47, sparks: [], fireLineMarkers: [], wind: defaultWind47 },
  shapes: cross(
    [{ name: "default", zones: defaultZones47 }, { name: "changed", zones: changedZones47 }],
    toolVariants(fireLine47),
  ),
};

// ---------------------------------------------------------------------------- 54

const terrains54 = ["Mountains", "Foothills", "Plains"];
const defaultZones54: WildfireZone[] = terrains54.map((t) => ({
  terrainType: t, vegetation: "Shrub", droughtLevel: "No Drought",
}));
const defaultWind54 = { speed: 10, direction: 165 };
// Default vegetation (all Shrub) with every zone at Severe Drought.
const severeZones54: WildfireZone[] = terrains54.map((t) => ({
  terrainType: t, vegetation: "Shrub", droughtLevel: "Severe Drought",
}));
// Vegetation changed off default, drought left below severe → cat 2.
const vegChangedNotSevere54: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Forest", droughtLevel: "No Drought" },
  { terrainType: "Foothills", vegetation: "Shrub", droughtLevel: "No Drought" },
  { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "No Drought" },
];
const fireLine54 = [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.2 }];

export const vars54 = {
  severeZones: severeZones54,
  vegChangedNotSevere: vegChangedNotSevere54,
  fireLine: fireLine54,
  defaults: { zones: defaultZones54, wind: defaultWind54 } as WildfireDefaults,
};

// Tab 54's axis is SEVERITY, not the default-vs-changed of 45 and 47. Its cats 3 and 4
// both require DefaultVegetations AND SevereDroughts, and SevereDroughts demands every
// zone at Severe Drought while the tab's SIMINIT default is No Drought everywhere. So a
// "default" run fails it and a "changed" run bumping one zone fails it too: both land on
// cat 2, and a default-vs-changed sweep would classify all 64 states as 2, reaching cats
// 3 and 4 never.
export const tab54: TabFixture = {
  id: "54",
  defaults: vars54.defaults,
  base: { zones: defaultZones54, sparks: [], fireLineMarkers: [], wind: defaultWind54 },
  shapes: cross(
    [
      { name: "default", zones: defaultZones54 },
      { name: "severe", zones: severeZones54 },
      { name: "vegNotSevere", zones: vegChangedNotSevere54 },
    ],
    toolVariants(fireLine54),
  ),
};

export const TAB_FIXTURES: TabFixture[] = [
  tab23, tab25, tab32, tab33, tab34, tab35, tab42, tab45, tab47, tab54,
];
