import { expressionGraph } from './expressionGraph';
import { shownValueOf } from './propValue';
import type { GraphNode } from './expressionGraph';
import type { PropValue } from './propValue';
import type { ReactElement } from 'react';

/** How far apart the columns and rows sit, in pixels -- see the `width` below. */
const COLUMN = 76;
const ROW = 26;

/** A node's box, which the edges stop at rather than running under. */
const WIDTH = 60;
const HEIGHT = 18;

/** How far below the last row an edge that spans columns is routed. */
const CHANNEL = 8;

/** As many characters as fit in a box, past which a label is cut. */
const FITS = 11;

/**
 * A prop's expression, drawn as the nodes and edges it is stored as.
 *
 * Read-only, and deliberately so: [0018](../../../docs/issues/0018.md) wants
 * the drawing as a *check* on the representation before it wants it as a tool,
 * and a viewer that cannot edit still catches an unfaithful representation on
 * the day it is written.
 *
 * **The nodes and edges are a function of the graph; the routing is layout.**
 * That distinction is what the check rests on, and it is worth stating exactly
 * because the weaker claim -- that the drawing decides nothing at all -- is not
 * true and never was: `COLUMN`, `ROW` and the channel below are this file's
 * choices. What must invent nothing is *what* is drawn. Every stored edge is
 * one visible segment, no two edges share one, and no segment crosses a box
 * that is not its own end -- so the picture cannot merge two nodes into one or
 * suggest an edge the graph does not hold.
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
  const at = ({ column, row }: GraphNode): { x: number; y: number } => ({
    x: column * COLUMN,
    y: row * ROW,
  });

  /**
   * Where an edge attaches on its target's left edge.
   *
   * Fanned by operand slot, so a node feeding another twice draws two segments
   * rather than one drawn over itself -- and so `div(3, x)` and `div(x, 3)`
   * are different pictures, which for four of the operations they have to be.
   */
  const into = (edge: { to: number; slot: number }): number => {
    const slots = edges.filter(({ to }) => to === edge.to).length;

    return at(nodes[edge.to]!).y + (HEIGHT * (edge.slot + 1)) / (slots + 1);
  };

  // An edge spanning more than one column would otherwise run straight through
  // the boxes between, at the height their own edges attach -- one stored edge
  // drawn as two that do not exist, with the real one hidden inside a box. The
  // channel is below every row, so nothing is in the way.
  const spanning = edges.filter(
    ({ from, to }) => nodes[to]!.column - nodes[from]!.column > 1,
  );
  const floor = (rows - 1) * ROW + HEIGHT;
  const lane = (edge: { from: number; to: number }): number =>
    floor + CHANNEL * (spanning.indexOf(edge as (typeof spanning)[number]) + 1);
  const depth = floor + CHANNEL * spanning.length + CHANNEL;

  return (
    <svg
      className="editor__graph"
      role="img"
      aria-label={`${label} as a graph`}
      width={(columns - 1) * COLUMN + WIDTH + 8}
      height={depth + 8}
      viewBox={`-4 -4 ${(columns - 1) * COLUMN + WIDTH + 8} ${depth + 8}`}
    >
      <desc>{shownValueOf(prop)}</desc>
      {edges.map((edge) => {
        const { from, to, slot } = edge;
        const start = {
          x: at(nodes[from]!).x + WIDTH,
          y: at(nodes[from]!).y + HEIGHT / 2,
        };
        const end = { x: at(nodes[to]!).x, y: into(edge) };
        const key = `${from}-${to}-${slot}`;

        return spanning.includes(edge) ? (
          <polyline
            key={key}
            points={[
              `${start.x},${start.y}`,
              `${start.x},${lane(edge)}`,
              `${end.x},${lane(edge)}`,
              `${end.x},${end.y}`,
            ].join(' ')}
          />
        ) : (
          <line key={key} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
        );
      })}
      {nodes.map((node) => (
        <g
          key={node.id}
          data-kind={node.kind}
          transform={`translate(${at(node).x}, ${at(node).y})`}
        >
          <rect width={WIDTH} height={HEIGHT} rx={3} />
          <text x={WIDTH / 2} y={HEIGHT / 2} dominantBaseline="central">
            {node.label.length > FITS
              ? `${node.label.slice(0, FITS - 1)}…`
              : node.label}
          </text>
          {node.label.length > FITS ? <title>{node.label}</title> : null}
        </g>
      ))}
    </svg>
  );
}
