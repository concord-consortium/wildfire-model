import { EngineError } from "./types";

export interface RenderedError {
  severity: "error" | "warning";
  message: string;
}

export interface RenderErrorContext {
  readingsLength?: number;
}

export function renderError(e: EngineError, ctx?: RenderErrorContext): RenderedError {
  switch (e.kind) {
    case "load-failure":
      switch (e.reason) {
        case "missing-rule-set":
          return {
            severity: "error",
            message: `Rule set not found: ${e.ruleSetId ?? "(no ?hazbotRules param)"}`,
          };
        case "missing-defaults":
          return {
            severity: "error",
            message: `Missing defaults: ${e.ruleSetId} · ${e.detail}`,
          };
        case "missing-impl":
          return {
            severity: "error",
            message: `Missing impl: ${e.ruleSetId} · ${e.detail}`,
          };
        default:
          throw new Error(`Unrendered load-failure reason: ${String((e as { reason: string }).reason)}`);
      }
    case "parse-error":
      return {
        severity: "error",
        message: `Parse error in category ${e.categoryId}: ${e.detail} (offending: \`${e.offendingToken}\`)`,
      };
    case "impl-eval-throw":
      if (e.implKind === "sim-prop") {
        return {
          severity: "error",
          message: `Sim-prop ${e.implName} threw at reading ${e.readingIndex}: ${String(e.thrown)}`,
        };
      } else {
        const countText = ctx?.readingsLength === undefined ? "" : ` over ${ctx.readingsLength} readings`;
        return {
          severity: "error",
          message: `Factor variable ${e.implName} threw during computation${countText}: ${String(e.thrown)}`,
        };
      }
    case "stub-warning":
      return {
        severity: "warning",
        message: `Stub not yet implemented: ${e.stubName}`,
      };
    case "temporal-validation": {
      const implLabel = e.implType === "factorVariable" ? "factor variable" : "sim-prop";
      return {
        severity: "error",
        message: `Temporal-variable read invalid: ${implLabel} ${e.implName} declares temporalReads `
          + `"${e.missingVariableName}" but no such temporal variable is declared (ruleset ${e.ruleSetId})`,
      };
    }
    case "temporal-reducer-error":
      return {
        severity: "error",
        message: `Temporal-variable reducer threw: ${e.variableName} on event ${e.event.name}: ${String(e.thrown)}`,
      };
    case "trigger-state-change-overlap":
      return {
        severity: "error",
        message: `Temporal-variable ${e.variableName} declares acceptedEvents "${e.eventName}" which is also a `
          + `trigger event for factor variable ${e.factorVariableName} (ruleset ${e.ruleSetId})`,
      };
    case "temporal-initial-values-mismatch": {
      const parts: string[] = [];
      if (e.missing.length > 0) parts.push(`missing: ${e.missing.join(", ")}`);
      if (e.unknown.length > 0) parts.push(`unknown: ${e.unknown.join(", ")}`);
      if (e.typeMismatches.length > 0) {
        parts.push(`type mismatches: ${e.typeMismatches.map((t) => `${t.name} expected ${t.expectedType}, got ${t.actualType}`).join("; ")}`);
      }
      return {
        severity: "error",
        message: `initialTemporalValues mismatch (ruleset ${e.ruleSetId}) — ${parts.join(" · ")}`,
      };
    }
    default: {
      const _exhaustive: never = e;
      throw new Error(`Unrendered error kind: ${(_exhaustive as { kind: string }).kind}`);
    }
  }
}
