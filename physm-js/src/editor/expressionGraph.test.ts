import { add, div, mul, sub, vec } from './../expression';
import { expressionGraph } from './expressionGraph';
import { literalOf, parameterOf } from './propValue';

describe('a prop drawn as a graph', () => {
  test('a prop holding no expression has no graph', () => {
    expect(expressionGraph(literalOf(4))).toBeNull();
    expect(expressionGraph(parameterOf('half'))).toBeNull();
    expect(expressionGraph(undefined)).toBeNull();
  });

  test('an operation and its operands, with the edges between them', () => {
    const { nodes, edges } = expressionGraph(mul(parameterOf('half'), 2))!;

    expect(nodes).toEqual([
      { id: 0, label: 'mul', kind: 'operation', column: 1, row: 0 },
      { id: 1, label: 'half', kind: 'reference', column: 0, row: 0 },
      { id: 2, label: '2', kind: 'literal', column: 0, row: 1 },
    ]);
    expect(edges).toEqual([
      { from: 1, to: 0 },
      { from: 2, to: 0 },
    ]);
  });

  test('one node per stored object, drawn once with an edge each way in', () => {
    // The whole reason this is written early: a viewer that merged equal
    // subtrees would draw a plausible picture of a representation that had
    // thrown its sharing away, and agree with whatever it was given.
    const half = div(8, 2);
    const { nodes, edges } = expressionGraph(vec(half, half))!;

    const into = edges.filter(({ to }) => to === 0);

    expect(nodes.filter(({ label }) => label === 'div')).toHaveLength(1);
    expect(into).toHaveLength(2);
    expect(into[0]!.from).toBe(into[1]!.from);
  });

  test('two equal values written separately are two nodes', () => {
    // Which is the same rule from the other side: the document did not say
    // these are one value, so the drawing must not either.
    const { nodes } = expressionGraph(vec(div(8, 2), div(8, 2)))!;

    expect(nodes.filter(({ label }) => label === 'div')).toHaveLength(2);
    expect(nodes.filter(({ label }) => label === '8')).toHaveLength(2);
  });

  test('every edge runs from a lower column to a higher one', () => {
    // A shared node reached again from deeper than it first was would
    // otherwise leave an edge running backwards, and the drawing would cross
    // itself for a reason the graph does not have.
    const half = div(8, 2);
    const { nodes, edges } = expressionGraph(add(half, mul(add(half, 1), 2)))!;
    const columnOf = new Map(nodes.map(({ id, column }) => [id, column]));

    for (const { from, to } of edges) {
      expect(columnOf.get(from)!).toBeLessThan(columnOf.get(to)!);
    }
  });

  test('nodes of one column take their own rows, in the order reached', () => {
    const { nodes } = expressionGraph(sub(mul(2, 3), 4))!;
    const places = nodes.map(({ column, row }) => `${column}.${row}`);

    // No two nodes in one place, and the leaves in the order the walk met
    // them: `mul`'s two operands, then `sub`'s second.
    expect(new Set(places).size).toBe(places.length);
    expect(
      nodes
        .filter(({ column }) => column === 0)
        .sort((a, b) => a.row - b.row)
        .map(({ label }) => label),
    ).toEqual(['2', '3', '4']);
  });

  test('a literal node and a bare value read the same', () => {
    // A prop's operands are plain values, and the document's own leaves are
    // tagged -- both are leaves, and neither is worth showing as a wrapper.
    const { nodes } = expressionGraph(mul(literalOf(2), 2))!;

    expect(nodes.filter(({ label }) => label === '2')).toHaveLength(2);
    expect(nodes.filter(({ kind }) => kind === 'literal')).toHaveLength(2);
  });
});
