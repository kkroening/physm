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
    expect(() => evaluate(xOf([1, 2, 3]))).toThrow(/Expected a point/);
    expect(() => evaluate(add([NaN, 1], [1, 2]))).toThrow(/Expected a point/);
  });

  test('a node nobody built is refused rather than half-computed', () => {
    // A document can hold one. JavaScript would otherwise drop the extra
    // operand, or compute with `undefined` for a missing one.
    expect(() =>
      evaluate({ kind: 'operation', op: 'mul', operands: [2] }),
    ).toThrow(/mul takes 2 operands, and was given 1/);
    expect(() =>
      evaluate({ kind: 'operation', op: 'mul', operands: [2, 3, 4] }),
    ).toThrow(/mul takes 2 operands, and was given 3/);
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
      /An expression reaches itself: neg -> neg/,
    );

    // The path rather than the kind: `add is one of its own operands` says
    // nothing in a graph holding several, where the route to it says where to
    // look. Page 4 asks for the participants to be named.
    const inner = { kind: 'operation', op: 'add', operands: [1] } as {
      kind: 'operation';
      op: 'add';
      operands: unknown[];
    };
    inner.operands.push(mul(2, inner));

    expect(() => evaluate(inner as unknown as ExpressionNode)).toThrow(
      /An expression reaches itself: add -> mul -> add/,
    );
  });

  test('a shared node is evaluated once, not mistaken for a cycle', () => {
    // Twice in one graph is sharing; twice on one path is a loop. Only the
    // path is carried down, so the first stays legal -- and the fold is over
    // the nodes rather than the edges, or a graph would cost a doubling per
    // level of sharing on exactly the shape sharing is for.
    const half = div(8, 2);

    expect(evaluate(add(half, half))).toBe(8);

    let deep: unknown = 1;
    for (let level = 0; level < 28; level += 1) {
      deep = add(deep, deep);
    }

    // Twenty-eight nodes, and 2^28 evaluations if the fold walks edges rather
    // than nodes -- which is minutes rather than the millisecond it takes.
    expect(evaluate(deep)).toBe(2 ** 28);
  });

  test('a result the operation cannot have meant is refused', () => {
    // Operands are checked, so results have to be: otherwise `Infinity` goes
    // into a mass and `NaN` into a radius, with nothing said. Named where it
    // was produced, rather than complained about one node further up.
    expect(() => evaluate(div(1, 0))).toThrow(/div produced Infinity/);
    expect(() => evaluate(sqrt(neg(25)))).toThrow(/sqrt produced NaN/);
    expect(() => evaluate(vec(div(1, 0), 0))).toThrow(/div produced Infinity/);

    // One component of a point, which finite operands can still reach by
    // overflowing -- so the check is over the components, not over the whole.
    expect(() => evaluate(scale([1e308, 1], 10))).toThrow(
      /scale produced \[Infinity, 10\]/,
    );
  });

  test('a value a refusal names is the value it was given', () => {
    // `JSON.stringify` is wrong on exactly the values a refusal holds: it
    // renders the non-finite numbers as `null`, a symbol or a function as
    // `undefined`, and throws outright on a bigint -- so the refusal would
    // die inside its own message.
    expect(() => evaluate(mul(Infinity, 2))).toThrow(
      /Expected a number, and found Infinity/,
    );
    expect(() => evaluate(mul(NaN, 2))).toThrow(
      /Expected a number, and found NaN/,
    );
    expect(() => evaluate(mul(1n, 2))).toThrow(
      /Expected a number, and found 1/,
    );
    expect(() => evaluate(mul(Symbol('x'), 2))).toThrow(
      /Expected a number, and found Symbol\(x\)/,
    );
  });

  test('an operation is looked up among its own, not up a prototype', () => {
    // A bracket lookup on an object literal reaches `Object.prototype`, where
    // every name is a function: the refusal below would never fire, and a
    // boxed operand would be handed back as a prop value.
    for (const op of ['toString', 'constructor', 'valueOf', 'hasOwnProperty']) {
      expect(() => evaluate({ kind: 'operation', op, operands: [] })).toThrow(
        new RegExp(`'${op}' is not an operation`),
      );
    }
  });

  test('a node carrying the tag without the rest is refused', () => {
    // Every read below assumes the whole shape. `operands: 'ab'` is the one
    // that shows why the shape is checked before the arity: a string has a
    // length, so it would pass that check and die at the walk.
    for (const node of [
      { kind: 'operation' },
      { kind: 'operation', op: 'mul' },
      { kind: 'operation', op: 'mul', operands: 'ab' },
      { kind: 'operation', op: 'mul', operands: null },
      { kind: 'operation', op: 2, operands: [] },
    ]) {
      expect(() => evaluate(node)).toThrow(/An operation needs a name and its/);
    }
  });

  test('computed leaves plain props alone and folds the rest', () => {
    expect(computed({ mass: 3, position: vec(1, mul(2, 2)) })).toEqual({
      mass: 3,
      position: [1, 4],
    });
  });

  test('every refusal reaches a person on the prop that carries it', () => {
    // None of them can name a prop from inside the graph, and this is the only
    // place that knows which one it was.
    expect(() => computed({ mass: xOf(3) })).toThrow(/^mass: Expected a point/);
    expect(() => computed({ radius: sqrt(neg(4)) })).toThrow(
      /^radius: sqrt produced NaN/,
    );
  });
});
