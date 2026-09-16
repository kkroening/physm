import { isOperation } from './../expression';
import type { PropValue } from './propValue';

/**
 * A prop's expression as nodes and edges, for something to draw.
 *
 * [0018](../../../docs/issues/0018.md) asks for this early and says why: a
 * graph that cannot be drawn is a graph that has been stored wrongly, so the
 * drawing is a check on the representation rather than a reward for finishing
 * it. That check only works if this reads what is stored and invents nothing --
 * in particular, **one node per stored object identity**. A viewer that merged
 * equal subtrees would draw a plausible picture of a representation that had
 * thrown its sharing away, and agree with whatever it was given.
 *
 * So two props holding one node draw one node with two edges *because they are
 * the same object*, and two equal literals written separately draw two nodes,
 * because that is what the document says. A primitive is not stored as an
 * object and cannot be shared, which is the same rule seen from the other side.
 */

/** One node of the drawing: what it is, what it reads as, and where it sits. */
export interface GraphNode {
  readonly id: number;

  /** What it reads as: an operation's name, a parameter's, or a value. */
  readonly label: string;

  readonly kind: 'operation' | 'reference' | 'literal';

  /**
   * How far from a leaf, which is the column it is drawn in.
   *
   * The longest path rather than the shortest, so every edge runs from a lower
   * column to a higher one and the drawing flows one way. A shared node sits
   * to the left of everything that reads it, however many of them there are.
   *
   * It comes out of the walk rather than a pass of its own: operands are
   * visited before the operation that reads them, so a node's column is final
   * before anything asks for it -- including the second time a shared one is
   * reached, when its column was settled by the first.
   */
  readonly column: number;

  /** Its place among the nodes of its column, in the order first reached. */
  readonly row: number;
}

/** One edge: an operand read by an operation. */
export interface GraphEdge {
  readonly from: number;
  readonly to: number;
}

/** What a leaf reads as. */
function labelOf(held: unknown): { label: string; kind: GraphNode['kind'] } {
  if (
    held !== null &&
    typeof held === 'object' &&
    (held as { kind?: unknown }).kind === 'parameter'
  ) {
    return { label: (held as { name: string }).name, kind: 'reference' };
  }

  const value =
    held !== null &&
    typeof held === 'object' &&
    (held as { kind?: unknown }).kind === 'literal'
      ? (held as { value: unknown }).value
      : held;

  return { label: JSON.stringify(value) ?? String(value), kind: 'literal' };
}

/** The graph `prop` holds, or `null` when it holds no expression at all. */
export function expressionGraph(
  prop: PropValue | undefined,
): { nodes: GraphNode[]; edges: GraphEdge[] } | null {
  if (!isOperation(prop)) {
    return null;
  }

  // By identity, and only for what is stored as an object: two operands that
  // are the same node are one node here, and two equal numbers are two.
  const ids = new Map<object, number>();
  const heights: number[] = [];
  const labels: { label: string; kind: GraphNode['kind'] }[] = [];
  const edges: GraphEdge[] = [];

  const visit = (held: unknown): number => {
    const shared = typeof held === 'object' && held !== null ? held : null;
    const already = shared === null ? undefined : ids.get(shared);
    if (already !== undefined) {
      return already;
    }

    const id = labels.length;
    labels.push(
      isOperation(held) ? { label: held.op, kind: 'operation' } : labelOf(held),
    );
    heights.push(0);
    if (shared !== null) {
      ids.set(shared, id);
    }

    if (isOperation(held)) {
      for (const operand of held.operands) {
        const from = visit(operand);
        edges.push({ from, to: id });
        heights[id] = Math.max(heights[id]!, heights[from]! + 1);
      }
    }

    return id;
  };

  visit(prop);

  const rows = new Map<number, number>();

  return {
    nodes: labels.map(({ label, kind }, id) => {
      const column = heights[id]!;
      const row = rows.get(column) ?? 0;
      rows.set(column, row + 1);

      return { id, label, kind, column, row };
    }),
    edges,
  };
}
