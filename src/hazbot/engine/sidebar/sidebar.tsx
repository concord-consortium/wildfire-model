import * as React from "react";
import { useAnalysisEngine } from "../react";
import { renderError } from "../error-rendering";
import { ENGINE_VERSION } from "../version";
import { ExpressionRenderer } from "./expression-renderer";
import { BaseReading, EngineError } from "../types";
import "./sidebar.css";

export const Sidebar: React.FC = () => {
  const { engine, appRulesVersion, factorVariableValues, matchedCategory, perCategoryTruth } = useAnalysisEngine();
  const ruleSetId = engine.ruleSet?.id ?? engine.requestedRuleSetId ?? "(none)";
  const loadError = engine.errors.find((e) => e.kind === "load-failure" || e.kind === "parse-error");

  return (
    <div className="hazbot-sidebar">
      <header className="hazbot-sidebar-header">
        <strong>Hazbot</strong>
        <span className="hazbot-sidebar-muted">
          ruleset {ruleSetId} · session {engine.sessionId} · engine {ENGINE_VERSION} · rules {appRulesVersion}
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
          categories={engine.ruleSet.categories}
          matchedCategory={matchedCategory}
          perCategoryTruth={perCategoryTruth}
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
  categories: { id: number; feedback: string; expression: string }[];
  matchedCategory: number | null;
  perCategoryTruth: Record<number, Parameters<typeof ExpressionRenderer>[0]["tree"]>;
  isActive: boolean;
}> = ({ categories, matchedCategory, perCategoryTruth, isActive }) => {
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
          <div
            key={cat.id}
            className={`hazbot-sidebar-entry ${matched ? "hazbot-sidebar-category-matched" : ""}`}
          >
            <div>
              <strong>{truthIcon} Cat {cat.id}</strong>: {cat.feedback}
            </div>
            <div>
              {isActive && truth
                ? <ExpressionRenderer tree={truth} />
                : <span>{cat.expression}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

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
        {reading.triggeredBy} @ {reading.at} · {reading.updates.length} update(s)
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
