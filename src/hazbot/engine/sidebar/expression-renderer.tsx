import * as React from "react";
import { LeafTruth } from "../evaluator";
import { BaseReading } from "../types";

// Render a LeafTruth tree as JSX with double-encoded leaves (color + underline/strikethrough)
// per Req 17 (accessibility — colorblind dev still gets shape-redundant cues).
// Operators and parens stay neutral so the structure remains readable.

export const ExpressionRenderer: React.FC<{ tree: LeafTruth }> = ({ tree }) => {
  return <span>{renderNode(tree)}</span>;
};

function leafClass(truth: boolean): string {
  return truth ? "hazbot-sidebar-leaf-true" : "hazbot-sidebar-leaf-false";
}

function renderNode(node: LeafTruth): React.ReactNode {
  switch (node.kind) {
    case "boolean-leaf":
      return <span className={leafClass(node.truth)}>{node.name}</span>;
    case "comparison": {
      const lhs = node.lhs.kind === "literal" ? String(node.lhs.value) : `${node.lhs.name}${node.lhs.accessor}`;
      const rhs = node.rhs.kind === "literal" ? String(node.rhs.value) : `${node.rhs.name}${node.rhs.accessor}`;
      return <span className={leafClass(node.truth)}>{lhs} {node.op} {rhs}</span>;
    }
    case "with":
      return <WithNode node={node} />;
    case "and":
      return <span>({renderNode(node.left)} <strong>AND</strong> {renderNode(node.right)})</span>;
    case "or":
      return <span>({renderNode(node.left)} <strong>OR</strong> {renderNode(node.right)})</span>;
    case "not":
      return <span><strong>NOT</strong> {renderNode(node.child)}</span>;
    default: {
      const _exhaustive: never = node;
      throw new Error(`Unrendered node kind: ${(_exhaustive as { kind: string }).kind}`);
    }
  }
}

const WithNode: React.FC<{ node: Extract<LeafTruth, { kind: "with" }> }> = ({ node }) => {
  const [expanded, setExpanded] = React.useState(false);
  // Click expands; CSS :hover provides an alternative trigger via the same content
  // (per EXT-11 — the click path is the keyboard-accessible primary).
  return (
    <span>
      <button
        type="button"
        className="hazbot-sidebar-button"
        onClick={() => setExpanded((x) => !x)}
        aria-expanded={expanded}
      >
        <span className={leafClass(node.truth)}>{node.varName}</span> <strong>WITH</strong> ⟨…⟩
      </button>
      {expanded && (
        <pre className="hazbot-sidebar-pre">
          {node.boundReading
            ? `bound: ${formatReading(node.boundReading)}`
            : `no candidate matched (${node.candidateEvaluations?.length ?? 0} examined)`}
        </pre>
      )}
    </span>
  );
};

function formatReading(r: BaseReading): string {
  return JSON.stringify({ triggeredBy: r.triggeredBy, at: r.at, updates: r.updates }, null, 2);
}
