/**
 * A value computed from other values, stored as the graph rather than as text.
 *
 * [0016 page 4](../../docs/issues/0016/04-expressions.md) asks for expressions
 * "in a way that physm understands the overall AST-like structure / graph
 * relationship", which rules out storing a string and evaluating or parsing it.
 * What is stored here *is* the expression, and evaluating it is a fold over
 * that graph rather than a parse.
 *
 * **A constructor returns a node rather than a result.** `mul(a, b)` does not
 * multiply; it returns an operation with `a` and `b` as its operands, the way
 * `createElement` returns an element rather than rendering one. That is what
 * lets one form serve a hand-written component, the module the editor emits,
 * and the document's own storage -- and it is why evaluation *builds* the graph
 * instead of destroying it.
 *
 * **A graph, not a tree.** An operand is whatever object was handed to the
 * constructor, so binding a subexpression once and using it three times stores
 * one node with three edges to it. That is what lets a viewer draw the sharing,
 * and what lets the emitter write the binding rather than three copies.
 */

/** Every operation, with how many operands it takes and what it does. */
const OPERATIONS = {
  add: (a: unknown, b: unknown) => pointwise(a, b, (x, y) => x + y),
  sub: (a: unknown, b: unknown) => pointwise(a, b, (x, y) => x - y),
  mul: (a: unknown, b: unknown) => scalar(a) * scalar(b),
  div: (a: unknown, b: unknown) => scalar(a) / scalar(b),
  neg: (a: unknown) =>
    typeof a === 'number' ? -scalar(a) : point(a).map((each) => -each),
  sqrt: (a: unknown) => Math.sqrt(scalar(a)),
  vec: (x: unknown, y: unknown) => [scalar(x), scalar(y)] as const,
  scale: (v: unknown, k: unknown) => point(v).map((n) => n * scalar(k)),
  dot: (a: unknown, b: unknown) =>
    point(a).reduce((sum, n, at) => sum + n * point(b)[at]!, 0),
  xOf: (v: unknown) => point(v)[0]!,
  yOf: (v: unknown) => point(v)[1]!,
} satisfies Record<string, (...operands: never[]) => unknown>;

/** What an operation is called, which is also what the emitter writes. */
export type Operation = keyof typeof OPERATIONS;

/** A value an operation computes from its operands. */
export interface ExpressionNode {
  readonly kind: 'operation';
  readonly op: Operation;

  /**
   * What it is computed from: a node, or a value stated outright.
   *
   * Plain values stay plain -- a leaf is already a valid operand, so `mul(x, 2)`
   * holds the number rather than wrapping it. Page 4 says the same of a prop:
   * "literals stay literals".
   */
  readonly operands: readonly unknown[];
}

/** Whether `value` is an operation node rather than something to compute with. */
export function isOperation(value: unknown): value is ExpressionNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'operation'
  );
}

/** A number an operation was given, or a throw naming what it got instead. */
function scalar(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Expected a number, and found ${JSON.stringify(value)}.`);
  }

  return value;
}

/** A point an operation was given, or a throw naming what it got instead. */
function point(value: unknown): readonly number[] {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every((each) => typeof each === 'number' && Number.isFinite(each))
  ) {
    throw new Error(`Expected a point, and found ${JSON.stringify(value)}.`);
  }

  return value as readonly number[];
}

/**
 * `by` over two scalars, or over two points component by component.
 *
 * One operation for both because a person adding two lengths and a person
 * adding two offsets are doing the same thing, and requiring `addPoint` beside
 * `add` would make the graph carry a distinction its operands already make.
 */
function pointwise(
  a: unknown,
  b: unknown,
  by: (x: number, y: number) => number,
): number | readonly number[] {
  return typeof a === 'number'
    ? by(scalar(a), scalar(b))
    : point(a).map((each, at) => by(each, point(b)[at]!));
}

/**
 * The value `node` computes, or itself when it is not an operation.
 *
 * `visiting` is the operations above this one, so a graph that reaches itself
 * is named rather than recursed into. The editor cannot build one -- every edit
 * writes a fresh node over an existing graph -- but a hand-written component
 * can, and the failure without this is a stack overflow naming nothing.
 */
export function evaluate(
  node: unknown,
  visiting: Set<unknown> = new Set(),
): unknown {
  if (!isOperation(node)) {
    return node;
  }

  if (visiting.has(node)) {
    throw new Error(
      `An expression reaches itself: ${node.op} is one of its own operands.`,
    );
  }

  const operation = OPERATIONS[node.op] as
    ((...operands: unknown[]) => unknown) | undefined;
  if (!operation) {
    throw new Error(`'${node.op}' is not an operation.`);
  }

  // Checked here as well as by the constructors, because a document can hold a
  // node nobody's constructor made -- and JavaScript would otherwise drop an
  // extra operand or compute with `undefined` for a missing one.
  if (node.operands.length !== operation.length) {
    throw new Error(
      `${node.op} takes ${operation.length} operands, and was given ` +
        `${node.operands.length}.`,
    );
  }

  const within = new Set(visiting).add(node);

  return operation(
    ...node.operands.map((operand) => evaluate(operand, within)),
  );
}

/**
 * A component's props, where any of them may instead be computed.
 *
 * What a building block *is* stays declared on the plain type -- its `meta`,
 * its defaults, what its `build` receives -- and this is the wider thing an
 * element may be given. So a default the prop would not accept still fails to
 * compile, where widening the declared type would have let one through.
 */
export type Computable<T> = {
  readonly [K in keyof T]: K extends 'children' | 'ref'
    ? T[K]
    : T[K] | ExpressionNode;
};

/** Every prop value in `props`, with any expression among them computed. */
export function computed<T extends object>(props: Computable<T>): T {
  return Object.fromEntries(
    Object.entries(props).map(([name, value]) => [name, evaluate(value)]),
  ) as T;
}

/**
 * As many operands as an operation takes, each of any type.
 *
 * The count comes from the implementation's own parameters, so a constructor
 * cannot drift from what it builds a node for.
 */
type Operands<K extends Operation> = Parameters<(typeof OPERATIONS)[K]>;

/** An operation node, for each operation in turn. */
function constructorFor<K extends Operation>(
  op: K,
): (...operands: Operands<K>) => ExpressionNode {
  return (...operands) => ({ kind: 'operation', op, operands });
}

export const add = constructorFor('add');
export const sub = constructorFor('sub');
export const mul = constructorFor('mul');
export const div = constructorFor('div');
export const neg = constructorFor('neg');
export const sqrt = constructorFor('sqrt');
export const vec = constructorFor('vec');
export const scale = constructorFor('scale');
export const dot = constructorFor('dot');
export const xOf = constructorFor('xOf');
export const yOf = constructorFor('yOf');
