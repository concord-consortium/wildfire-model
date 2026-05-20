declare const __dirname: string;
declare const require: (id: string) => unknown;
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const { readFileSync } = require("fs") as { readFileSync: (path: string, encoding: string) => string };
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const { resolve } = require("path") as { resolve: (...paths: string[]) => string };
import { Engine, computeMatchedCategoryForEngine, EngineOpts } from "../engine";
import { factorVariables } from "./factor-variables";
import { simProps } from "./sim-props";
import { temporalVariables } from "./temporal-variables";
import { translate } from "./translate";
import { ruleSets } from "../rule-sets";
import { WildfireDefaults, WildfireReading } from "./types";

interface FixtureExpected {
  readings: WildfireReading[];
  observed: Record<string, boolean>;
  temporalValues: Record<string, unknown>;
  matchedCategoryHistory: (number | null)[];
}

// Engine generates a fresh sessionId per instance; strip it from both sides
// before comparing so we don't have to mock session-id generation just to
// satisfy strict equality. The sessionId is non-deterministic by design.
function stripSessionId(r: WildfireReading): Omit<WildfireReading, "sessionId"> {
  const { sessionId: _sid, ...rest } = r;
  return rest;
}

describe("ruleset 25 — replay fixture regression (R18c)", () => {
  it("matches expected readings, observed, temporalValues, matchedCategory history", () => {
    const fixturesDir = resolve(__dirname, "__fixtures__");
    const eventsFile = JSON.parse(readFileSync(resolve(fixturesDir, "events.json"), "utf8"));
    const expectedFile = JSON.parse(readFileSync(resolve(fixturesDir, "expected.json"), "utf8")) as FixtureExpected;

    const opts: EngineOpts<WildfireReading, WildfireDefaults> = {
      ruleSet: ruleSets["25"],
      requestedRuleSetId: "25",
      factorVariables,
      simProps,
      temporalVariables,
      translate,
      runStartTriggers: ["SimulationStarted"],
      ...(eventsFile.initialTemporalValues !== undefined
        ? { initialTemporalValues: eventsFile.initialTemporalValues }
        : {}),
    };
    const engine = new Engine<WildfireReading, WildfireDefaults>(opts);
    const matchedCategoryHistory: (number | null)[] = [];
    for (const event of eventsFile.events) {
      engine.consume(event);
      matchedCategoryHistory.push(computeMatchedCategoryForEngine(engine));
    }

    // Pre-round-trip the engine output before comparing. Symmetric with the
    // fixture's JSON.parse(...) path. The generator script's assertJsonSafe
    // walker catches Map/Set/Date/NaN/class instances at fixture-regen time;
    // roundTrip here catches the residual undefined-stripping hole only.
    const roundTrip = <T>(v: T): T => JSON.parse(JSON.stringify(v));

    expect(roundTrip(engine.readings.map(stripSessionId)))
      .toEqual(expectedFile.readings.map(stripSessionId as unknown as (r: WildfireReading) => Omit<WildfireReading, "sessionId">));
    expect(roundTrip(engine.observed)).toEqual(expectedFile.observed);
    expect(roundTrip(engine.temporalValues)).toEqual(expectedFile.temporalValues);
    expect(matchedCategoryHistory).toEqual(expectedFile.matchedCategoryHistory);

    // R1 JSON-safe canary — `undefined` survives toEqual against itself but is
    // stripped by JSON.stringify symmetrically. Catch any reducer producing
    // `undefined` as a clear "received undefined" failure naming the property,
    // rather than silent semantic drift over time.
    for (const value of Object.values(engine.temporalValues)) {
      expect(value).toBeDefined();
    }
    for (const observed of Object.values(engine.observed)) {
      expect(observed).toBeDefined();
    }
  });
});
