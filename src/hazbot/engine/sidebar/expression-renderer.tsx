import * as React from "react";
import { LeafTruth } from "../evaluator";
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
const WithNode: React.FC<{ node: Extract<LeafTruth, { kind: "with" }>; expanded: boolean }> = ({ node, expanded }) => {
  return (
    <>
      <span><span className={leafClass(node.truth)}>{node.varName}</span> <strong>WITH</strong> {renderExpression(node.propExpr)}</span>
      {expanded && (
        <div className="hazbot-sidebar-pre">
          {node.boundReading
            ? `bound: ${formatReading(node.boundReading)}`
            : `no candidate matched (${node.candidateEvaluations?.length ?? 0} examined)`}
        </div>
      )}
    </>
  );
};

// Render an unevaluated Expression AST inline (no truth coloring — sub-expressions inside
// a WITH clause aren't pre-evaluated into the LeafTruth tree). Used to show the body of a
// WITH leaf alongside the collapsed binding-detail toggle.
function renderExpression(expr: Expression): React.ReactNode {
  switch (expr.kind) {
    case "boolean-leaf":
    case "sim-prop-leaf":
      return expr.name;
    case "accessor":
      return `${expr.name}${expr.accessor}`;
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

function formatReading(r: BaseReading): string {
  return JSON.stringify({ triggeredBy: r.triggeredBy, at: r.at, updates: r.updates }, null, 2);
}
