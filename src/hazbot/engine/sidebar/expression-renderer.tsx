import * as React from "react";
import { LeafTruth, PropLeafTruth } from "../evaluator";
import { Expression } from "../parser/ast";
import { BaseReading } from "../types";

// Render a LeafTruth tree as JSX with double-encoded leaves (color + underline/strikethrough)
// per Req 17 (accessibility — colorblind dev still gets shape-redundant cues).
// Operators and parens stay neutral so the structure remains readable.

export const ExpressionRenderer: React.FC<{ tree: LeafTruth; expanded?: boolean }> = ({ tree, expanded = false }) => {
  // Outer wrapper is a div (not span) because some leaf nodes — e.g., WithNode's
  // witness-reading detail when expanded — render block-level children. Inline
  // phrasing inside would be invalid HTML5.
  return <div className="hazbot-sidebar-expression">{renderNode(tree, expanded)}</div>;
};

function leafClass(truth: boolean): string {
  return truth ? "hazbot-sidebar-leaf-true" : "hazbot-sidebar-leaf-false";
}

function renderNode(node: LeafTruth, expanded: boolean): React.ReactNode {
  switch (node.kind) {
    case "boolean-leaf":
      return <span className={leafClass(node.truth)}>{node.name}</span>;
    case "comparison": {
      const lhs = node.lhs.kind === "literal" ? String(node.lhs.value) : `${node.lhs.name}${node.lhs.accessor}`;
      const rhs = node.rhs.kind === "literal" ? String(node.rhs.value) : `${node.rhs.name}${node.rhs.accessor}`;
      return <span className={leafClass(node.truth)}>{lhs} {node.op} {rhs}</span>;
    }
    case "with":
      return <WithNode node={node} expanded={expanded} />;
    case "and":
      return <span>({renderNode(node.left, expanded)} <strong>AND</strong> {renderNode(node.right, expanded)})</span>;
    case "or":
      return <span>({renderNode(node.left, expanded)} <strong>OR</strong> {renderNode(node.right, expanded)})</span>;
    case "not":
      return <span><strong>NOT</strong> {renderNode(node.child, expanded)}</span>;
    default: {
      const _exhaustive: never = node;
      throw new Error(`Unrendered node kind: ${(_exhaustive as { kind: string }).kind}`);
    }
  }
}

// The WITH node's witness-reading detail follows the enclosing CategoryRow's open state —
// one click on the row header toggles both the row's Feedback / Visual feedback / AST detail
// and every nested WITH's witness reading, so there's a single source of "expanded."
//
// Inner propExpr renders with per-leaf truth coloring when propTruth is available (i.e.,
// the engine has at least one candidate reading to evaluate against). Falls back to
// plain text rendering of the raw AST when there are no candidates yet.
const WithNode: React.FC<{ node: Extract<LeafTruth, { kind: "with" }>; expanded: boolean }> = ({ node, expanded }) => {
  return (
    <>
      <span>
        <span className={leafClass(node.truth)}>{node.varName}</span>{" "}
        <strong>WITH</strong>{" "}
        {node.propTruth ? renderPropLeaf(node.propTruth) : renderExpression(node.propExpr)}
      </span>
      {expanded && (
        <div className="hazbot-sidebar-pre">
          {node.boundReading
            ? `Matched on reading #${node.boundReadingIndex !== undefined ? node.boundReadingIndex + 1 : "?"}: ${formatReading(node.boundReading)}`
            : formatUnboundMessage(node.candidateEvaluations?.length ?? 0)}
        </div>
      )}
    </>
  );
};

// Render a PropLeafTruth tree (inner WITH expression) with per-leaf truth coloring.
// Mirrors renderNode's structure but operates on the narrower PropLeafTruth shape
// (sim-prop leaves only, plus boolean combinators).
function renderPropLeaf(node: PropLeafTruth): React.ReactNode {
  switch (node.kind) {
    case "sim-prop-leaf":
      return <span className={leafClass(node.truth)}>{node.name}</span>;
    case "and":
      return <span>({renderPropLeaf(node.left)} <strong>AND</strong> {renderPropLeaf(node.right)})</span>;
    case "or":
      return <span>({renderPropLeaf(node.left)} <strong>OR</strong> {renderPropLeaf(node.right)})</span>;
    case "not":
      return <span><strong>NOT</strong> {renderPropLeaf(node.child)}</span>;
    default: {
      const _exhaustive: never = node;
      throw new Error(`renderPropLeaf: unhandled ${(_exhaustive as { kind: string }).kind}`);
    }
  }
}

// Render an unevaluated Expression AST inline. Used as a fallback inside a WITH leaf
// when no witness reading exists yet — sim-prop / boolean leaves are rendered with the
// "no-value" class (muted gray + dashed underline) to signal "this hasn't been
// evaluated yet" rather than confidently-true or confidently-false.
function renderExpression(expr: Expression): React.ReactNode {
  switch (expr.kind) {
    case "boolean-leaf":
    case "sim-prop-leaf":
      return <span className="hazbot-sidebar-leaf-no-value">{expr.name}</span>;
    case "accessor":
      return <span className="hazbot-sidebar-leaf-no-value">{`${expr.name}${expr.accessor}`}</span>;
    case "literal":
      return String(expr.value);
    case "comparison": {
      const lhs = expr.lhs.kind === "literal" ? String(expr.lhs.value) : `${expr.lhs.name}${expr.lhs.accessor}`;
      const rhs = expr.rhs.kind === "literal" ? String(expr.rhs.value) : `${expr.rhs.name}${expr.rhs.accessor}`;
      return `${lhs} ${expr.op} ${rhs}`;
    }
    case "and":
      return <>({renderExpression(expr.left)} <strong>AND</strong> {renderExpression(expr.right)})</>;
    case "or":
      return <>({renderExpression(expr.left)} <strong>OR</strong> {renderExpression(expr.right)})</>;
    case "not":
      return <><strong>NOT</strong> {renderExpression(expr.child)}</>;
    case "with":
      return <>{expr.varName} <strong>WITH</strong> {renderExpression(expr.propExpr)}</>;
    default: {
      const _exhaustive: never = expr;
      throw new Error(`Unrendered expression kind: ${(_exhaustive as { kind: string }).kind}`);
    }
  }
}

// Message shown when a WITH clause has no bound reading. Distinguishes "factor
// variable produced no candidates" from "candidates exist but none satisfied
// the inner clause." "Readings" here is a slight oversimplification — strictly
// it's candidate readings (those the factor variable returned as witnesses),
// not engine.readings as a whole — but the two coincide in the wildfire host
// since every reading is a SimulationStarted that all factor variables key on.
function formatUnboundMessage(candidateCount: number): string {
  if (candidateCount === 0) return "No readings yet";
  return `${candidateCount} reading${candidateCount === 1 ? "" : "s"} checked, no match`;
}

function formatReading(r: BaseReading): string {
  // Full reading payload — includes app-specific fields (zones, sparks, wind, etc.
  // for the wildfire host) alongside the BaseReading metadata. Verbose but answers
  // "what conditions did this WITH bind to?" without round-tripping through the
  // Readings panel. Drops sessionId (internal-only).
  const { sessionId: _ignored, ...rest } = r as BaseReading & { sessionId?: string };
  return JSON.stringify(rest, null, 2);
}
