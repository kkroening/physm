import { expressionGraph } from './expressionGraph';
import type { PropValue } from './propValue';
import type { ReactElement } from 'react';

/** How far apart the columns and rows of the drawing sit, in pixels. */
const COLUMN = 76;
const ROW = 26;

/** A node's box, which the edges stop at rather than running under. */
const WIDTH = 60;
const HEIGHT = 18;

/**
 * A prop's expression, drawn as the nodes and edges it is stored as.
 *
 * Read-only, and deliberately so: [0018](../../../docs/issues/0018.md) wants
 * the drawing as a *check* on the representation before it wants it as a tool,
 * and a viewer that cannot edit still catches an unfaithful representation on
 * the day it is written.
 *
 * It draws what `expressionGraph` builds and decides nothing of its own, which
 * is what keeps the check honest: the placement is a fact about the graph, so
 * a picture that comes out wrong is a graph that was stored wrong.
 */
export default function ExpressionView({
  prop,
  label,
}: {
  prop: PropValue | undefined;
  label: string;
}): ReactElement | null {
  const graph = expressionGraph(prop);
  if (!graph) {
    return null;
  }

  const { nodes, edges } = graph;
  const columns = Math.max(...nodes.map(({ column }) => column)) + 1;
  const rows = Math.max(...nodes.map(({ row }) => row)) + 1;
  const at = (id: number): { x: number; y: number } => {
    const { column, row } = nodes[id]!;

    // Left to right, leaves first: every edge runs the same way, which is what
    // `column` is computed to guarantee.
    return { x: column * COLUMN, y: row * ROW };
  };

  return (
    <svg
      className="editor__graph"
      role="img"
      aria-label={`${label} as a graph`}
      viewBox={`-4 -4 ${(columns - 1) * COLUMN + WIDTH + 8} ${(rows - 1) * ROW + HEIGHT + 8}`}
    >
      {edges.map(({ from, to }) => (
        <line
          key={`${from}-${to}`}
          x1={at(from).x + WIDTH}
          y1={at(from).y + HEIGHT / 2}
          x2={at(to).x}
          y2={at(to).y + HEIGHT / 2}
        />
      ))}
      {nodes.map(({ id, label: shown, kind }) => (
        <g
          key={id}
          data-kind={kind}
          transform={`translate(${at(id).x}, ${at(id).y})`}
        >
          <rect width={WIDTH} height={HEIGHT} rx={3} />
          <text x={WIDTH / 2} y={HEIGHT / 2} dominantBaseline="central">
            {shown}
          </text>
        </g>
      ))}
    </svg>
  );
}
