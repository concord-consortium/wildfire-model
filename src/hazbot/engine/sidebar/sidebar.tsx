import * as React from "react";
import { useAnalysisEngine } from "../react";
import { renderError } from "../error-rendering";
import { ENGINE_VERSION } from "../version";
import { ExpressionRenderer } from "./expression-renderer";
import { BaseReading, EngineError } from "../types";
import "./sidebar.css";

export interface SidebarProps {
  // Required: the host app's name for this analysis engine instance. The substrate
  // is generic across host apps (wildfire passes "Hazbot"; a future host might pass
  // its own name) — making this required forces every consumer to label the sidebar
  // explicitly rather than inheriting an opinionated default.
  title: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ title }) => {
  const { engine, appRulesVersion, factorVariableValues, matchedCategory, perCategoryTruth } = useAnalysisEngine();
  const ruleSetId = engine.ruleSet?.id ?? engine.requestedRuleSetId ?? "(none)";
  const loadError = engine.errors.find((e) => e.kind === "load-failure" || e.kind === "parse-error");

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

      {loadError && (
        <div className="hazbot-sidebar-section">
          <div className="hazbot-sidebar-section-title">Load error</div>
          <div className="hazbot-sidebar-error">
            {renderError(loadError, { readingsLength: engine.readings.length }).message}
          </div>
        </div>
      )}

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

      <ReadingsPanel readings={engine.readings} />
      <FactorVariablesPanel
        values={factorVariableValues}
        ruleSetUndefined={engine.ruleSet === undefined}
      />
      <ErrorsPanel errors={engine.errors} readingsLength={engine.readings.length} />
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
        const truthIcon = isActive
          ? (truth?.truth ? "✓" : "✗")
          : "·"; // suppressed when inactive
        return (
          <CategoryRow
            key={cat.id}
            cat={cat}
            truth={truth}
            ast={parsedExpressions.get(cat.id)}
            matched={matched}
            truthIcon={truthIcon}
            isActive={isActive}
          />
        );
      })}
    </div>
  );
};

// The category row shows status icon + cat number + studentAction + the truth-colored
// expression by default. Click the row's header to expand: feedback (student-facing
// message) + visualFeedback (visual cue description) + the parsed AST.
const CategoryRow: React.FC<{
  cat: { id: number; studentAction: string; feedback: string; visualFeedback: string; expression: string };
  truth: Parameters<typeof ExpressionRenderer>[0]["tree"] | undefined;
  ast: unknown;
  matched: boolean;
  truthIcon: string;
  isActive: boolean;
}> = ({ cat, truth, ast, matched, truthIcon, isActive }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <div className={`hazbot-sidebar-entry ${matched ? "hazbot-sidebar-category-matched" : ""}`}>
      <button
        type="button"
        className="hazbot-sidebar-button"
        onClick={() => setOpen((x) => !x)}
        aria-expanded={open}
      >
        <strong>{open ? "▾" : "▸"} {truthIcon} {cat.id}:</strong>
        {cat.studentAction && <span> {cat.studentAction}</span>}
      </button>
      <div className="hazbot-sidebar-category-expression">
        {isActive && truth
          ? <ExpressionRenderer tree={truth} />
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

const ReadingsPanel: React.FC<{ readings: BaseReading[] }> = ({ readings }) => {
  return (
    <div className="hazbot-sidebar-section">
      <div className="hazbot-sidebar-section-title">Readings ({readings.length})</div>
      {readings.map((r, i) => (
        <ReadingRow key={`${r.at}-${r.triggeredBy}-${i}`} reading={r} />
      ))}
    </div>
  );
};

const ReadingRow: React.FC<{ reading: BaseReading }> = ({ reading }) => {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <div className="hazbot-sidebar-entry">
      <button
        type="button"
        className="hazbot-sidebar-button"
        onClick={() => setExpanded((x) => !x)}
        aria-expanded={expanded}
      >
        <strong>{expanded ? "▾" : "▸"}</strong> {reading.triggeredBy} · {reading.updates.length} update(s)
      </button>
      {expanded && (
        <pre className="hazbot-sidebar-pre">{JSON.stringify(reading, null, 2)}</pre>
      )}
    </div>
  );
};

const FactorVariablesPanel: React.FC<{
  values: Record<string, unknown>;
  ruleSetUndefined: boolean;
}> = ({ values, ruleSetUndefined }) => {
  return (
    <div className="hazbot-sidebar-section">
      <div className="hazbot-sidebar-section-title">Factor Variables</div>
      {ruleSetUndefined && (
        <div className="hazbot-sidebar-warning">Engine inactive — values shown are impl defaults</div>
      )}
      {Object.entries(values).map(([name, value]) => (
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

const ErrorsPanel: React.FC<{ errors: EngineError[]; readingsLength: number }> = ({ errors, readingsLength }) => {
  if (errors.length === 0) return null;
  return (
    <div className="hazbot-sidebar-section">
      <div className="hazbot-sidebar-section-title">Errors / Warnings ({errors.length})</div>
      {errors.map((e, i) => {
        const rendered = renderError(e, { readingsLength });
        const cls = rendered.severity === "warning" ? "hazbot-sidebar-warning" : "hazbot-sidebar-error";
        return <div key={`${e.kind}-${e.at}-${i}`} className={cls}>{rendered.message}</div>;
      })}
    </div>
  );
};
