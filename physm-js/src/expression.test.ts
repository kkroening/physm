import {
  add,
  computed,
  div,
  dot,
  evaluate,
  isOperation,
  mul,
  neg,
  scale,
  sqrt,
  sub,
  vec,
  xOf,
  yOf,
} from './expression';
import type { ExpressionNode } from './expression';

describe('an expression node', () => {
  test('a constructor builds a node rather than a result', () => {
    // The whole point: `mul(3, 2)` is not 6 until something evaluates it, so
    // the same call serves a hand-written component, the emitted module and
    // the document's storage.
    expect(mul(3, 2)).toEqual({
      kind: 'operation',
      op: 'mul',
      operands: [3, 2],
    });
    expect(isOperation(mul(3, 2))).toBe(true);
    expect(isOperation([3, 2])).toBe(false);
    expect(isOperation({ kind: 'literal', value: 3 })).toBe(false);
  });

  test('a plain value is its own operand, and its own result', () => {
    // A leaf is already a valid operand, so nothing wraps a number on the way
    // in and nothing unwraps it on the way out.
    expect(mul(3, 2).operands).toEqual([3, 2]);
    expect(evaluate(3)).toBe(3);
    expect(evaluate([1, 2])).toEqual([1, 2]);
  });

  test('operands are evaluated before the operation is', () => {
    expect(evaluate(mul(add(1, 2), sub(10, 4)))).toBe(18);
    expect(evaluate(div(sqrt(144), neg(-3)))).toBe(4);
  });

  test.each([
    ['add over scalars', add(1, 2), 3],
    ['add over points', add([1, 2], [10, 20]), [11, 22]],
    ['sub over points', sub([10, 20], [1, 2]), [9, 18]],
    ['neg over a scalar', neg(3), -3],
    ['neg over a point', neg([3, -4]), [-3, 4]],
    ['vec from two scalars', vec(3, 4), [3, 4]],
    ['scale a point', scale([3, 4], 2), [6, 8]],
    ['dot of two points', dot([3, 4], [2, 1]), 10],
    ['x of a point', xOf([3, 4]), 3],
    ['y of a point', yOf([3, 4]), 4],
  ])('%s', (_name, node, expected) => {
    expect(evaluate(node)).toEqual(expected);
  });

  test('a graph is one node shared, not a tree of copies', () => {
    // Which is the representation this is for: a viewer can draw the sharing,
    // and the emitter can write the binding, because the operand *is* the node
    // rather than a second one that happens to match.
    const half = div(8, 2);
    const both = vec(half, half);

    expect(both.operands[0]).toBe(both.operands[1]);
    expect(evaluate(both)).toEqual([4, 4]);
  });

  test('an operand that is not the right shape says which it was given', () => {
    expect(() => evaluate(mul('two', 3))).toThrow(
      /Expected a number, and found "two"/,
    );
    expect(() => evaluate(xOf(3))).toThrow(/Expected a point, and found 3/);
    expect(() => evaluate(add([1, 2], 3))).toThrow(/Expected a point/);
  });

  test('a node nobody built is refused rather than half-computed', () => {
    // A document can hold one. JavaScript would otherwise drop the extra
    // operand, or compute with `undefined` for a missing one.
    expect(() =>
      evaluate({ kind: 'operation', op: 'mul', operands: [2] }),
    ).toThrow(/mul takes 2 operands, and was given 1/);
    expect(() =>
      evaluate({ kind: 'operation', op: 'lerp', operands: [1, 2] } as unknown),
    ).toThrow(/'lerp' is not an operation/);
  });

  test('a graph that reaches itself is named, not recursed into', () => {
    const loop = { kind: 'operation', op: 'neg', operands: [] } as {
      kind: 'operation';
      op: 'neg';
      operands: unknown[];
    };
    loop.operands.push(loop);

    expect(() => evaluate(loop as ExpressionNode)).toThrow(
      /An expression reaches itself: neg is one of its own operands/,
    );
  });

  test('a shared node is not mistaken for a cycle', () => {
    // Twice in one graph is sharing; twice on one path is a loop. Only the
    // path is carried down, so the first stays legal.
    const half = div(8, 2);

    expect(evaluate(add(half, half))).toBe(8);
  });

  test('computed leaves plain props alone and folds the rest', () => {
    expect(computed({ mass: 3, position: vec(1, mul(2, 2)) })).toEqual({
      mass: 3,
      position: [1, 4],
    });
  });
});
