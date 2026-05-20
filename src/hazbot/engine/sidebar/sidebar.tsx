import * as React from "react";
import { useAnalysisEngine } from "../react";
import { renderError } from "../error-rendering";
import { ENGINE_VERSION } from "../version";
import { ExpressionRenderer } from "./expression-renderer";
import { BaseReading, EngineError, SimPropImpl } from "../types";
import "./sidebar.css";

function formatTimestamp(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

export interface SidebarProps {
  // Required: the host app's name for this analysis engine instance. The substrate
  // is generic across host apps (wildfire passes "Hazbot"; a future host might pass
  // its own name) — making this required forces every consumer to label the sidebar
  // explicitly rather than inheriting an opinionated default.
  title: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ title }) => {
  const { engine, appRulesVersion, factorVariableValues, simPropValues, matchedCategory, perCategoryTruth } = useAnalysisEngine();
  const ruleSetId = engine.ruleSet?.id ?? engine.requestedRuleSetId ?? "(none)";

  return (
    <div className="hazbot-sidebar">
      <header className="hazbot-sidebar-header">
        <strong>{title}</strong>
        <span
          className="hazbot-sidebar-muted"
          title={`engine ${ENGINE_VERSION} / app rules version ${appRulesVersion}`}
        >
          ruleset {ruleSetId} · {ENGINE_VERSION} / {appRulesVersion}
        </span>
      </header>

      <ErrorsPanel errors={engine.errors} readings={engine.readings} />

      {engine.ruleSet && (
        <CategoriesPanel
          categories={engine.ruleSet.categories as Array<{
            id: number; studentAction: string; feedback: string; visualFeedback: string; expression: string;
          }>}
          matchedCategory={matchedCategory}
          perCategoryTruth={perCategoryTruth}
          parsedExpressions={engine.parsedExpressions}
          isActive={engine.isActive}
        />
      )}

      {/* Req 17 case (b): when ruleSet is undefined (missing-rule-set), the sidebar
          shows only the errors panel (at top) and the rule-set-id fallback (in the
          header). Readings + factor variables would be either empty (no consume
          happens — engine is inactive) or impl-default fallbacks that mislead the
          developer. */}
      {engine.ruleSet && (
        <FactorVariablesPanel
          values={factorVariableValues}
          showFallbackNote={!engine.isActive}
        />
      )}
      {engine.ruleSet && (
        <TemporalVariablesPanel
          temporalVariableNames={engine.temporalVariableNames}
          values={engine.temporalValues}
          observed={engine.observed}
        />
      )}
      {engine.ruleSet && (
        <SimPropsPanel values={simPropValues} simProps={engine.simProps} />
      )}
      {engine.ruleSet && (
        <ReadingsPanel
          readings={engine.readings}
          temporalVariableNames={engine.temporalVariableNames}
        />
      )}
    </div>
  );
};

const TemporalVariablesPanel: React.FC<{
  temporalVariableNames: string[];
  values: Record<string, unknown>;
  observed: Record<string, boolean>;
}> = ({ temporalVariableNames, values, observed }) => {
  if (temporalVariableNames.length === 0) return null;
  return (
    <div className="hazbot-sidebar-section">
      <div className="hazbot-sidebar-section-title">Temporal Variables</div>
      {temporalVariableNames.map((name) => (
        <div key={name} className="hazbot-sidebar-entry">
          <strong>{name}</strong>:{" "}
          <span className={observed[name] ? "" : "hazbot-sidebar-temporal-unobserved"}>
            {formatValue(values[name])}
          </span>
        </div>
      ))}
    </div>
  );
};

const CategoriesPanel: React.FC<{
  categories: { id: number; studentAction: string; feedback: string; visualFeedback: string; expression: string }[];
  matchedCategory: number | null;
  perCategoryTruth: Record<number, Parameters<typeof ExpressionRenderer>[0]["tree"]>;
  parsedExpressions: Map<number, unknown>;
  isActive: boolean;
}> = ({ categories, matchedCategory, perCategoryTruth, parsedExpressions, isActive }) => {
  return (
    <div className="hazbot-sidebar-section">
      <div className="hazbot-sidebar-section-title">Categories</div>
      {categories.map((cat) => {
        const truth = perCategoryTruth[cat.id];
        const matched = cat.id === matchedCategory;
        return (
          <CategoryRow
            key={cat.id}
            cat={cat}
            truth={truth}
            ast={parsedExpressions.get(cat.id)}
            matched={matched}
            isActive={isActive}
          />
        );
      })}
    </div>
  );
};

// The category row shows status icon + cat number + studentAction + the truth-colored
// expression by default. Click anywhere on the card to expand: feedback (student-facing
// message) + visualFeedback (visual cue description) + the parsed AST + WITH witness
// detail (single open state covers all of these).
const CategoryRow: React.FC<{
  cat: { id: number; studentAction: string; feedback: string; visualFeedback: string; expression: string };
  truth: Parameters<typeof ExpressionRenderer>[0]["tree"] | undefined;
  ast: unknown;
  matched: boolean;
  isActive: boolean;
}> = ({ cat, truth, ast, matched, isActive }) => {
  const [open, setOpen] = React.useState(false);
  // Icon + class are computed from the row's truth state (or suppressed when
  // inactive). The class drives green/red coloring per CSS — same palette as
  // the per-leaf truth coloring so the row reads consistently top-to-bottom.
  const truthIcon = isActive ? (truth?.truth ? "✓" : "✗") : "·";
  const truthIconClass = isActive
    ? (truth?.truth ? "hazbot-sidebar-icon-true" : "hazbot-sidebar-icon-false")
    : "hazbot-sidebar-muted";
  const toggle = () => setOpen((x) => !x);
  // Whole card is clickable: role=button + Enter/Space activation for keyboard parity.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };
  return (
    <div
      className={`hazbot-sidebar-entry hazbot-sidebar-category-row ${matched ? "hazbot-sidebar-category-matched" : ""}`}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={toggle}
      onKeyDown={onKeyDown}
      title={open ? "Hide category details" : "Show category details"}
    >
      <div className="hazbot-sidebar-category-header">
        <strong>{open ? "▾" : "▸"} <span className={truthIconClass}>{truthIcon}</span> {cat.id}:</strong>
        {cat.studentAction && <span> {cat.studentAction}</span>}
      </div>
      <div className="hazbot-sidebar-category-expression">
        {isActive && truth
          ? <ExpressionRenderer tree={truth} expanded={open} />
          : <span>{cat.expression}</span>}
      </div>
      {open && (
        <div className="hazbot-sidebar-category-detail">
          <div><strong>Feedback:</strong> <span style={{ whiteSpace: "pre-wrap" }}>{cat.feedback}</span></div>
          <div>
            <strong>Visual feedback:</strong>{" "}
            {cat.visualFeedback
              ? <span style={{ whiteSpace: "pre-wrap" }}>{cat.visualFeedback}</span>
              : <strong>None</strong>}
          </div>
          <div><strong>Parsed expression:</strong></div>
          <pre className="hazbot-sidebar-pre">{formatAst(ast)}</pre>
        </div>
      )}
    </div>
  );
};

function formatAst(ast: unknown): string {
  if (ast === undefined) return "(no AST — category not parsed)";
  if (typeof ast === "symbol") return "(parse-error sentinel — see Errors panel)";
  return JSON.stringify(ast, null, 2);
}

// Stringify a reading for the Readings panel's expanded payload — drops sessionId
// (internal-only; not useful for rule-set debugging) but keeps everything else.
function formatReadingForDisplay(reading: BaseReading): string {
  const { sessionId: _ignored, ...rest } = reading as BaseReading & { sessionId?: string };
  return JSON.stringify(rest, null, 2);
}

const ReadingsPanel: React.FC<{ readings: BaseReading[]; temporalVariableNames: string[] }> = ({
  readings,
  temporalVariableNames,
}) => {
  // Render newest-first for scan-ergonomics — the substrate keeps engine.readings
  // chronological (append-only invariant); the reversal is a presentation-only
  // concern. slice() prevents mutating the engine's array. The displayed index is
  // 1-based and chronological (oldest = 1), so a WithNode's "bound to readings[N]"
  // line points at the same row regardless of newest-first ordering.
  const newestFirst = readings.slice().reverse();
  return (
    <div className="hazbot-sidebar-section">
      <div className="hazbot-sidebar-section-title">
        Readings ({readings.length}) <span className="hazbot-sidebar-muted">· newest first</span>
      </div>
      {newestFirst.map((r, i) => {
        const chronologicalIndex = readings.length - i; // 1-based
        return (
          <ReadingRow
            key={`${r.at}-${r.triggeredBy}-${i}`}
            reading={r}
            displayIndex={chronologicalIndex}
            temporalVariableNames={temporalVariableNames}
          />
        );
      })}
    </div>
  );
};

// Single-pass per-name update counter: counts entries in the append slice
// (everything after the seed block of length N). Equivalent to
// reading.temporalHistory.slice(N).filter(c => c.name === name).length but
// allocation-free — sidebar re-renders on every engine tick.
function formatTemporalSummary(reading: BaseReading, variableNames: string[]): string {
  const n = variableNames.length;
  return variableNames.map((name) => {
    let updateCount = 0;
    let lastValue: unknown = undefined;
    for (let i = 0; i < reading.temporalHistory.length; i++) {
      const c = reading.temporalHistory[i];
      if (c.name !== name) continue;
      lastValue = c.value;
      if (i >= n) updateCount++;
    }
    return `${name}: ${formatValue(lastValue)} (${updateCount} updates)`;
  }).join(", ");
}

const ReadingRow: React.FC<{
  reading: BaseReading;
  displayIndex: number;
  temporalVariableNames: string[];
}> = ({ reading, displayIndex, temporalVariableNames }) => {
  const [expanded, setExpanded] = React.useState(false);
  const temporalSummary = temporalVariableNames.length > 0
    ? formatTemporalSummary(reading, temporalVariableNames)
    : "";
  return (
    <div className="hazbot-sidebar-entry">
      <button
        type="button"
        className="hazbot-sidebar-button"
        onClick={() => setExpanded((x) => !x)}
        aria-expanded={expanded}
        title={expanded ? "Hide reading payload" : "Show reading payload"}
      >
        <strong>{expanded ? "▾" : "▸"} {displayIndex}:</strong> {reading.triggeredBy}
        {temporalSummary && <> · {temporalSummary}</>}
        {" "}· {reading.updates.length} update(s)
      </button>
      {expanded && (
        <>
          <pre className="hazbot-sidebar-pre">{formatReadingForDisplay(reading)}</pre>
          {reading.temporalHistory.length > 0 && (
            <div className="hazbot-sidebar-temporal-trail">
              <div className="hazbot-sidebar-section-title">Temporal trail</div>
              {reading.temporalHistory.map((c, i) => (
                <div key={i} className="hazbot-sidebar-entry">
                  <TimestampInline at={c.at} /> · {c.name}: {formatValue(c.value)} · from {c.eventName}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const FactorVariablesPanel: React.FC<{
  values: Record<string, unknown>;
  showFallbackNote: boolean;
}> = ({ values, showFallbackNote }) => {
  return (
    <div className="hazbot-sidebar-section">
      <div className="hazbot-sidebar-section-title">Factor Variables</div>
      {showFallbackNote && (
        <div className="hazbot-sidebar-warning">Engine inactive — values may be impl defaults</div>
      )}
      {Object.entries(values).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => (
        <div key={name} className="hazbot-sidebar-entry">
          <strong>{name}</strong>: {formatValue(value)}
        </div>
      ))}
    </div>
  );
};

function formatValue(v: unknown): string {
  if (typeof v === "boolean") return String(v);
  if (v instanceof Set) return `{${Array.from(v).map(String).join(", ")}}`;
  if (Array.isArray(v)) return `[${v.length}]`;
  return JSON.stringify(v);
}

// Sim-props evaluate per-reading; the panel surfaces each one's value at the
// latest run-start reading. null means no run-start reading has been recorded yet,
// so the value is undefined rather than impl-default.
const SimPropsPanel: React.FC<{
  values: Record<string, boolean | null>;
  simProps: Record<string, SimPropImpl<BaseReading, unknown>>;
}> = ({ values, simProps }) => {
  const entries = Object.entries(values).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return null;
  return (
    <div className="hazbot-sidebar-section">
      <div className="hazbot-sidebar-section-title">Sim Props</div>
      {entries.map(([name, value]) => {
        const reads = simProps[name]?.temporalReads;
        return (
          <div key={name} className="hazbot-sidebar-entry">
            <strong>{name}</strong>: {value === null
              ? (
                <span
                  className="hazbot-sidebar-muted"
                  title="Sim-props evaluate per-reading; no run-start reading has been recorded yet, so this value is undefined."
                >
                  n/a
                </span>
              )
              : String(value)}
            {reads && reads.length > 0 && (
              <span className="hazbot-sidebar-muted"> · reads: {reads.join(", ")}</span>
            )}
          </div>
        );
      })}
    </div>
  );
};

const ErrorsPanel: React.FC<{ errors: EngineError[]; readings: BaseReading[] }> = ({ errors, readings }) => {
  if (errors.length === 0) return null;
  return (
    <div className="hazbot-sidebar-section">
      <div className="hazbot-sidebar-section-title">Errors / Warnings ({errors.length})</div>
      {errors.map((e, i) => (
        <ErrorRow key={`${e.kind}-${e.at}-${i}`} error={e} readings={readings} />
      ))}
    </div>
  );
};

// Renders one error entry: timestamp + canonical message + a contextual hint pulled
// from the variant's discriminating fields. Per Req 17's errors-panel bullet — message,
// severity, timestamp, and triggering context when applicable.
const ErrorRow: React.FC<{ error: EngineError; readings: BaseReading[] }> = ({ error, readings }) => {
  const rendered = renderError(error, { readingsLength: readings.length });
  const cls = rendered.severity === "warning" ? "hazbot-sidebar-warning" : "hazbot-sidebar-error";
  const context = describeErrorContext(error, readings);
  return (
    <div className={`hazbot-sidebar-entry ${cls}`}>
      <div>
        <time
          className="hazbot-sidebar-muted"
          dateTime={new Date(error.at).toISOString()}
        >
          [{formatTimestamp(error.at)}]
        </time>{" "}
        {rendered.message}
      </div>
      {context && <div className="hazbot-sidebar-muted">{context}</div>}
    </div>
  );
};

// Pulls per-variant context: the triggering event for ambient/orphan, the hydrated
// reading for sim-prop throws (via readingIndex). Factor-variable throws have no
// extra context line — their readings count is already substituted into the message
// by renderError (per EXT-19, the substrate can't attribute a compute() throw to a
// single reading).
//
// Returns a ReactNode so embedded timestamps wrap in <time dateTime=...> elements
// (parity with ErrorRow's primary timestamp — screen readers get a semantic anchor).
function describeErrorContext(e: EngineError, readings: BaseReading[]): React.ReactNode {
  switch (e.kind) {
    case "ambient-validation":
      return <>event: {e.event.name} @ <TimestampInline at={e.event.at} /></>;
    case "orphan-modifier":
      return <>event: {e.event.name} @ <TimestampInline at={e.event.at} /></>;
    case "impl-eval-throw": {
      if (e.implKind === "sim-prop" && e.readingIndex !== undefined) {
        const r = readings[e.readingIndex];
        if (r) return <>at reading[{e.readingIndex}]: {r.triggeredBy} @ <TimestampInline at={r.at} /></>;
      }
      return null;
    }
    case "parse-error":
      return <>category {e.categoryId} · token span {e.tokenSpan.start}-{e.tokenSpan.end}</>;
    case "load-failure":
    case "stub-warning":
      return null;
    case "temporal-validation":
      return <>{e.implType === "factorVariable" ? "factor variable" : "sim-prop"} {e.implName} · missing temporal variable {e.missingVariableName}</>;
    case "temporal-reducer-error":
      return <>variable {e.variableName} · event: {e.event.name} @ <TimestampInline at={e.event.at} /></>;
    case "trigger-state-change-overlap":
      return <>variable {e.variableName} · event {e.eventName} · factor variable {e.factorVariableName}</>;
    case "temporal-initial-values-mismatch": {
      const parts: React.ReactNode[] = [];
      if (e.missing.length > 0) parts.push(<>missing: {e.missing.join(", ")}</>);
      if (e.unknown.length > 0) parts.push(<>unknown: {e.unknown.join(", ")}</>);
      if (e.typeMismatches.length > 0) {
        parts.push(<>type mismatches: {e.typeMismatches.map((t) => `${t.name} (${t.expectedType} → ${t.actualType})`).join("; ")}</>);
      }
      return <>{parts.map((p, i) => <React.Fragment key={i}>{i > 0 && " · "}{p}</React.Fragment>)}</>;
    }
    default: {
      // TS-compile-time exhaustiveness check: adding a new EngineError variant fails
      // the cast and forces the author to add a context-derivation branch here.
      const _exhaustive: never = e;
      void _exhaustive;
      return null;
    }
  }
}

// Inline timestamp rendered as a semantic <time> element for screen readers.
const TimestampInline: React.FC<{ at: number }> = ({ at }) => (
  <time dateTime={new Date(at).toISOString()}>{formatTimestamp(at)}</time>
);
