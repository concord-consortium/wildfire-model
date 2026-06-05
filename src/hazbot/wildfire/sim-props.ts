import { SimPropImpl } from "../engine";
import { WildfireDefaults, WildfireReading } from "./types";
import {
  TerrainType, terrainLabels, Vegetation, vegetationLabels, DroughtLevel, droughtLabels,
} from "../../types";

// Sim-props are bridge-side TS predicates evaluated against a single Reading
// bound by WITH (per Req 5 / Req 12).

const OneSparkPerZone: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  evaluate: (reading) => {
    if (!reading.sparks || !reading.zones) return false;
    if (reading.sparks.length !== reading.zones.length) return false;
    // Reject the trivial 1-zone / 1-spark case — symmetric with `usedOneSparkPerZone`.
    // The predicate is meant for multi-zone activities; a single spark in a single
    // zone passes the length+distinct check but doesn't demonstrate the per-zone
    // distribution the rubric is testing.
    if (reading.sparks.length < 2) return false;
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

// Sticky-OR over the temporal trail: true if chartTabOpen was ever true at any
// point during the reading's window. Both the R5a seed entry (capturing the
// live value at trigger time) and R5b appends (from ChartTabShown during the
// window) participate; the close-after-open pattern still resolves to true.
const GraphOpen: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  temporalReads: ["chartTabOpen"],
  evaluate: (reading) =>
    reading.temporalHistory.some((c) => c.name === "chartTabOpen" && c.value === true),
};

// SparksAtTopAndBottom (tab 25, WM-15): true when one spark sits near the top of
// the active topography and the other near the bottom. LOCALIZED via a
// multi-scale Topographic Position Index (TPI) rather than a single global
// elevation range: each spark carries a `tpi` array (one entry per concentric
// band, computed by SimulationModel.tpiForSpark at the SimulationStarted payload
// site) where a negative value means the spark is below its surroundings (valley)
// at that scale and a positive value means above them (ridge/peak). The predicate
// sees only the two sparks (each with their tpi array) plus heightmapMaxElevation
// and tpiMarginFraction (which together set the decision margin) — never config or
// the cell grid. Self-contained fail-closed guards, matching OneSparkPerZone /
// TwoSparks (OQ-3 Option A). Distinct-zone placement is intentionally NOT checked
// here; it is composed in via OneSparkPerZone in every ruleset-25 category that ANDs this.

// A spark is classified "top" when its mean TPI rises at least
// (tpiMarginFraction × heightmapMaxElevation) ABOVE its surroundings, and "bottom"
// when it sits at least that far below. tpiMarginFraction rides on the reading
// (config.tpiMarginFraction, URL-tunable via ?tpiMarginFraction=...); this constant
// is only the fallback when the reading omits it. At the default 0.02 × 20000 the
// margin is 400 ft: above heightmap quantization noise, well below real mountain
// relief — so flat terrain (TPI ~ 0 everywhere) never qualifies, replacing the old
// global minimum-span floor. 0.02 was chosen by an empirical sweep against local
// slope-position ground truth: it detects ~97% of obvious mountain-bases (vs ~91%
// at 0.025) while two mid-slope sparks still falsely pass < 1% of the time, because
// mid-slope overfire skews to "bottom" not "top". See the WM-15 addendum. Tunable.
const DEFAULT_TPI_MARGIN_FRACTION = 0.02;

type TpiClass = "top" | "bottom" | "neither";

// Aggregate one spark's multi-scale TPI array into a top/bottom/neither verdict.
// The mean over the populated bands is the spark's overall topographic position;
// `null` bands (no usable cell, e.g. near the map edge) are ignored. Fails closed
// to "neither" when the array is missing or has no finite entry.
const classifyTpi = (tpi: Array<number | null> | undefined, margin: number): TpiClass => {
  if (!tpi) return "neither";
  const vals = tpi.filter((v): v is number => Number.isFinite(v as number));
  if (vals.length === 0) return "neither";
  const mean = vals.reduce((sum, v) => sum + v, 0) / vals.length;
  if (mean >= margin) return "top";
  if (mean <= -margin) return "bottom";
  return "neither";
};

const SparksAtTopAndBottom: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  evaluate: (reading) => {
    const { sparks, heightmapMaxElevation, tpiMarginFraction } = reading;
    // Fail closed: exactly two sparks plus the heightmap max the margin scales to.
    if (!sparks || sparks.length !== 2) return false;
    if (!Number.isFinite(heightmapMaxElevation)) return false;

    // Margin fraction rides on the reading (URL/preset-tunable); fall back to the
    // module default when a reading omits it (e.g. older fixtures).
    const fraction = Number.isFinite(tpiMarginFraction)
      ? (tpiMarginFraction as number) : DEFAULT_TPI_MARGIN_FRACTION;
    // Fail closed on a degenerate threshold: a non-positive fraction (settable via
    // ?tpiMarginFraction=0/-…) makes the margin 0/negative, which would count any
    // faintly-positive mean as "top" (and faintly-negative as "bottom"), so two
    // mid-slope sparks could falsely pass. Omitted/NaN fractions already fell back
    // to the positive default above; this only rejects an explicit degenerate value.
    if (!(fraction > 0)) return false;
    const margin = fraction * (heightmapMaxElevation as number);
    const classes = sparks.map((s) => classifyTpi(s.tpi, margin));
    // Need exactly one spark on top and the other at the bottom. With two sparks,
    // "includes top AND includes bottom" already implies one of each (and neither
    // is "neither"), so it also rejects similar / both-top / both-bottom / flat.
    return classes.includes("top") && classes.includes("bottom");
  },
};

// Per tab 23's sheet definition (CorrectZoneSetup, verified via dump-xlsx.js,
// tab 23): zone 1 = Foothills / Grass / No Drought; zone 2 = Foothills / Grass /
// Mild Drought or Medium Drought. The per-zone *enum choice* is the
// sheet-authored constant — this impl is NOT regenerated on re-extraction (see
// the CorrectZoneSetup Technical Note in requirements.md), so its unit test
// cites the sheet definition as the fixture source of truth (R6). The label
// *strings* are not sheet constants: each enum member is resolved through
// terrainLabels / vegetationLabels / droughtLabels (src/types.ts) — the same
// maps the SimulationStarted payload uses — so a future relabeling tracks
// automatically rather than silently desyncing (per self-review CA-4). The
// `[z1, z2] = zones` destructuring is positional: `reading.zones` is in
// `config.zones` tuple order and is never reordered at runtime, so slots 0 / 1
// are the sheet's "zone 1" / "zone 2" — see the zone-array-order Technical Note
// in requirements.md (per external-review item ER-2).
const CorrectZoneSetup: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  evaluate: (reading) => {
    const zones = reading.zones;
    if (!zones || zones.length !== 2) return false;
    const [z1, z2] = zones;
    const zone1Ok = z1.terrainType === terrainLabels[TerrainType.Foothills] &&
      z1.vegetation === vegetationLabels[Vegetation.Grass] &&
      z1.droughtLevel === droughtLabels[DroughtLevel.NoDrought];
    const zone2Ok = z2.terrainType === terrainLabels[TerrainType.Foothills] &&
      z2.vegetation === vegetationLabels[Vegetation.Grass] &&
      (z2.droughtLevel === droughtLabels[DroughtLevel.MildDrought] ||
        z2.droughtLevel === droughtLabels[DroughtLevel.MediumDrought]);
    return zone1Ok && zone2Ok;
  },
};

// Per tab 25's sheet definition: all zones share vegetation AND droughtLevel.
// terrainType is uniform by design on this activity, so it is not checked.
const UniformZoneSettings: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  evaluate: (reading) => {
    const zones = reading.zones;
    if (!zones || zones.length === 0) return false;
    const vegs = zones.map((z) => z.vegetation);
    const droughts = zones.map((z) => z.droughtLevel);
    // Fail closed on undefined — symmetric with the Uniform* props already here.
    if (vegs.some((v) => v === undefined) || droughts.some((d) => d === undefined)) return false;
    return new Set(vegs).size === 1 && new Set(droughts).size === 1;
  },
};

// Per the sheet (tabs 45/47/54): this run drew a fire line. A fire line needs
// two endpoints, so the SimulationStarted snapshot carries >= 2 markers.
const Fireline: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  evaluate: (reading) => (reading.fireLineMarkers?.length ?? 0) >= 2,
};

// Per the sheet (tabs 45/47): all adjustable variables (vegetation, drought,
// wind) are at default. Wind is matched with tolerance — +/-2 MPH magnitude,
// +/-20 degrees angle — because the wind UI is a continuous control. The
// tolerances are sheet-authored constants; this impl is NOT regenerated on
// re-extraction, so its unit test cites the sheet definition (R6).
//
// The magnitude tolerance is in MPH (the dial's units), but reading/defaults
// carry wind.speed in the model's internal units, where mph = speed /
// scaleFactor (config.windScaleFactor). We convert the delta to MPH before
// comparing; otherwise the tolerance is effectively divided by scaleFactor
// (e.g. scaleFactor 0.2 turned +/-2 into +/-10 MPH, so 10..30 MPH all read as
// default). The angle tolerance needs no conversion — direction is already in
// degrees with no scale factor.
const WIND_MAGNITUDE_TOLERANCE_MPH = 2;
const WIND_ANGLE_TOLERANCE_DEG = 20;
const DefaultVars: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  evaluate: (reading, defaults) => {
    const zones = reading.zones;
    const defaultZones = defaults?.zones;
    // Fail closed on a zone-count mismatch. reading.zones is simulation.zones
    // truncated to config.zonesCount; deriveWildfireDefaults() (WM-27) emits one
    // entry per *populated* config.zones slot independent of zonesCount, so
    // defaultZones can be longer than reading.zones. The zones.every() below
    // iterates reading.zones only — without this guard a too-long defaultZones
    // tail goes unchecked and the prop can pass while ignoring a default zone.
    if (!zones || zones.length === 0 || !defaultZones ||
        zones.length !== defaultZones.length || !reading.wind || !defaults?.wind) return false;
    const zonesAtDefault = zones.every((z, i) => {
      const def = defaultZones[i];
      return def !== undefined &&
        z.vegetation === def.vegetation && z.droughtLevel === def.droughtLevel;
    });
    if (!zonesAtDefault) return false;
    // Compare in MPH so the tolerance is in the dial's units. scaleFactor rides
    // on the SimulationStarted snapshot; absent (e.g. older readings / unit
    // tests), fall back to 1 = no conversion. Round each side to the nearest MPH
    // — the dial only produces integer MPH, and rounding before the subtraction
    // avoids float dust tipping the exact +/-2 boundary (4.4/0.2 = 2.0000…018).
    const scaleFactor = reading.wind.scaleFactor ?? 1;
    const readingMph = Math.round(reading.wind.speed / scaleFactor);
    const defaultMph = Math.round(defaults.wind.speed / scaleFactor);
    const magnitudeOk = Math.abs(readingMph - defaultMph) <= WIND_MAGNITUDE_TOLERANCE_MPH;
    // Circular angle difference — fold the wrap so 350 vs 10 reads as 20.
    const rawDelta = Math.abs(reading.wind.direction - defaults.wind.direction) % 360;
    const angleDelta = Math.min(rawDelta, 360 - rawDelta);
    return magnitudeOk && angleDelta <= WIND_ANGLE_TOLERANCE_DEG;
  },
};

// Per the sheet (tab 54): every zone's vegetation is at its config-sourced
// default. Compares against the WM-27 deriveWildfireDefaults() output — the
// config is the source of truth, so no hard-coded sheet constant (per CA-3).
const DefaultVegetations: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  evaluate: (reading, defaults) => {
    const zones = reading.zones;
    const defaultZones = defaults?.zones;
    // Fail closed on a zone-count mismatch — see the DefaultVars guard comment.
    if (!zones || !defaultZones || zones.length === 0 ||
        zones.length !== defaultZones.length) return false;
    return zones.every((z, i) => {
      const def = defaultZones[i];
      return def !== undefined && z.vegetation === def.vegetation;
    });
  },
};

// Per the sheet (tab 54): every zone is at Severe Drought. Compares against
// droughtLabels[DroughtLevel.SevereDrought] (src/types.ts) — the enum label is
// the source of truth, so no hard-coded sheet constant (per CA-3). The
// SimulationStarted payload sets zones[].droughtLevel = droughtLabels[…]
// (src/components/bottom-bar.tsx), so this matches the payload by construction.
const SevereDroughts: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  evaluate: (reading) => {
    const zones = reading.zones;
    if (!zones || zones.length === 0) return false;
    return zones.every((z) => z.droughtLevel === droughtLabels[DroughtLevel.SevereDrought]);
  },
};

// Per the sheet (tabs 45/47/54): this run dropped a helitack. The translate
// modifier records it on the run-start reading; effectiveness is not measured
// (requirements.md R1), mirroring Fireline above.
const Helitack: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  evaluate: (reading) => reading.helitack === true,
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
  CorrectZoneSetup,
  UniformZoneSettings,
  Fireline,
  DefaultVars,
  DefaultVegetations,
  SevereDroughts,
  Helitack,
};
