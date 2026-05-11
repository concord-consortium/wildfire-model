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
        default: {
          const _exhaustive: never = e;
          throw new Error(`Unrendered load-failure reason: ${String((_exhaustive as { reason: string }).reason)}`);
        }
      }
    case "parse-error":
      return {
        severity: "error",
        message: `Parse error in category ${e.categoryId}: ${e.detail} (offending: \`${e.offendingToken}\`)`,
      };
    case "ambient-validation":
      return {
        severity: "error",
        message: `Missing ambient state for ${e.trigger}: ${e.implName} reads ${e.missingKey}`,
      };
    case "orphan-modifier":
      switch (e.reason) {
        case "no-prior-trigger":
          return {
            severity: "error",
            message: `Modifier ${e.source} dropped: no trigger has fired yet`,
          };
        case "prior-trigger-failed":
          return {
            severity: "error",
            message: `Modifier ${e.source} dropped: prior trigger failed validation`,
          };
        case "between-runs":
          return {
            severity: "error",
            message: `Modifier ${e.source} dropped: no run currently in progress`,
          };
        default: {
          const _exhaustive: never = e;
          throw new Error(`Unrendered orphan-modifier reason: ${String((_exhaustive as { reason: string }).reason)}`);
        }
      }
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
    default: {
      const _exhaustive: never = e;
      throw new Error(`Unrendered error kind: ${(_exhaustive as { kind: string }).kind}`);
    }
  }
}
