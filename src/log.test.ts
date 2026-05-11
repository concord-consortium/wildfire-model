// Tests for the log() wrapper's AnalysisEngineActivated emission contract (Req 20):
//   - fires exactly once per page load (the `analysisEngineActivatedEmitted` guard)
//   - fires only when engine.isActive && engine.ruleSet defined
//   - does NOT fire when engine is inactive or absent
//   - payload comes from buildAnalysisEngineActivatedPayload (omits sessionId per R9-7)
//
// `log` carries module-level state (`analysisEngineActivatedEmitted`), so each test
// uses `jest.isolateModules` to load a fresh module instance with its own mocks.

const ACTIVATED_PAYLOAD = { engineVersion: "0.0.1", appRulesVersion: 1, ruleSetId: "23" };

function loadLogWithMocks(opts: {
  engine: { isActive: boolean; ruleSet?: { id: string }; consume?: jest.Mock } | undefined;
  logMonitor?: boolean;
}): { log: typeof import("./log").log; laraLog: jest.Mock } {
  let captured: { log: typeof import("./log").log; laraLog: jest.Mock } | null = null;
  jest.isolateModules(() => {
    const laraLog = jest.fn();
    jest.doMock("@concord-consortium/lara-interactive-api", () => ({ log: laraLog }));
    jest.doMock("@concord-consortium/log-monitor", () => ({
      createLogWrapper: (fn: unknown) => fn,
    }));
    jest.doMock("./config", () => ({
      getUrlConfig: () => ({ logMonitor: opts.logMonitor ?? false }),
    }));
    jest.doMock("./hazbot/wildfire", () => ({
      getAnalysisEngine: () => opts.engine,
      buildAnalysisEngineActivatedPayload: (ruleSetId: string) => ({
        engineVersion: "0.0.1",
        appRulesVersion: 1,
        ruleSetId,
      }),
    }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const { log } = jest.requireActual<typeof import("./log")>("./log");
    captured = { log, laraLog };
  });
  if (!captured) throw new Error("isolateModules did not run");
  return captured;
}

describe("log() — AnalysisEngineActivated emission (Req 20)", () => {
  it("emits AnalysisEngineActivated exactly once on the first log() call when engine is active", () => {
    const consume = jest.fn();
    const { log, laraLog } = loadLogWithMocks({
      engine: { isActive: true, ruleSet: { id: "23" }, consume },
    });
    log("FirstEvent", { foo: 1 });
    log("SecondEvent", { bar: 2 });
    const activatedCalls = laraLog.mock.calls.filter((c) => c[0] === "AnalysisEngineActivated");
    expect(activatedCalls).toHaveLength(1);
    expect(activatedCalls[0][1]).toEqual(ACTIVATED_PAYLOAD);
    // No sessionId in payload (R9-7).
    expect(activatedCalls[0][1]).not.toHaveProperty("sessionId");
  });

  it("does NOT emit AnalysisEngineActivated when engine is inactive", () => {
    const consume = jest.fn();
    const { log, laraLog } = loadLogWithMocks({
      engine: { isActive: false, ruleSet: { id: "23" }, consume },
    });
    log("SimulationStarted", { x: 1 });
    const activated = laraLog.mock.calls.find((c) => c[0] === "AnalysisEngineActivated");
    expect(activated).toBeUndefined();
  });

  it("does NOT emit AnalysisEngineActivated when no engine was constructed (URL flags unset)", () => {
    const { log, laraLog } = loadLogWithMocks({ engine: undefined });
    log("SimulationStarted", { x: 1 });
    const activated = laraLog.mock.calls.find((c) => c[0] === "AnalysisEngineActivated");
    expect(activated).toBeUndefined();
  });

  it("forwards ambientState only to the engine, never to LARA (neither as 3rd arg nor smuggled into data)", () => {
    const consume = jest.fn();
    const { log, laraLog } = loadLogWithMocks({
      engine: { isActive: true, ruleSet: { id: "23" }, consume },
    });
    log("SimulationStarted", { run: 1 }, { chartTabOpenAtStart: true });
    // LARA call has only two args (name + data); ambientState absent.
    const simStartedCall = laraLog.mock.calls.find((c) => c[0] === "SimulationStarted");
    expect(simStartedCall).toBeDefined();
    expect(simStartedCall![1]).toEqual({ run: 1 });
    expect(simStartedCall![2]).toBeUndefined();
    // Defense against a future refactor that copies ambientState into the data payload.
    expect(simStartedCall![1]).not.toHaveProperty("chartTabOpenAtStart");
    expect(simStartedCall![1]).not.toHaveProperty("ambientState");
    // Engine receives the full ambientState on consume().
    expect(consume).toHaveBeenCalledWith(expect.objectContaining({
      name: "SimulationStarted",
      data: { run: 1 },
      ambientState: { chartTabOpenAtStart: true },
    }));
  });
});
