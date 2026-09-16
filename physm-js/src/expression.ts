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

/**
 * Every operation, with how many operands it takes and what it does.
 *
 * **Each declares its operands as plain parameters**, because `Function.length`
 * is the arity for both the check in `evaluate` and the `Operands<K>` a
 * constructor is typed by. A default or a rest would stop counting there, and
 * the two would loosen together -- the runtime check passing nodes it should
 * refuse, and the constructor stopping constraining them -- so neither would
 * catch the other.
 */
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

/** Whether `value` carries the tag an operation node does. */
function isTagged(value: unknown): value is { kind: 'operation' } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'operation'
  );
}

/**
 * Whether `value` is an operation node rather than something to compute with.
 *
 * The whole shape, not the tag alone: every caller below reads `op` and walks
 * `operands`, and a node carrying the tag without them would otherwise reach
 * those reads and fail with a message naming neither the node nor the prop.
 * `operands: 'ab'` is the case that shows why the shape has to be checked
 * before the arity is -- a string has a length, so it passes that check and
 * dies at the walk.
 */
export function isOperation(value: unknown): value is ExpressionNode {
  return (
    isTagged(value) &&
    typeof (value as { op?: unknown }).op === 'string' &&
    Array.isArray((value as { operands?: unknown }).operands)
  );
}

/**
 * A value as a refusal should name it.
 *
 * Not `JSON.stringify` alone, which is wrong on exactly the values a refusal
 * is most likely to be holding: it renders `Infinity` and `NaN` as `null`,
 * sending a reader after a null they never wrote; a `symbol` or a function as
 * `undefined`, which is what an absent operand looks like; and it throws
 * outright on a `bigint`, so the refusal dies inside its own message.
 */
export function describe(value: unknown): string {
  if (typeof value === 'number') {
    return String(value);
  }

  // Through an array too, or a point that overflowed in one component reads
  // back as `[null, 1]` -- the same lie one level out.
  if (Array.isArray(value)) {
    return `[${value.map(describe).join(', ')}]`;
  }

  return typeof value === 'symbol' ||
    typeof value === 'function' ||
    typeof value === 'bigint'
    ? String(value)
    : JSON.stringify(value);
}

/** A number an operation was given, or a throw naming what it got instead. */
function scalar(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Expected a number, and found ${describe(value)}.`);
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
    throw new Error(`Expected a point, and found ${describe(value)}.`);
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
/**
 * A result an operation produced, or a throw naming the operation that did.
 *
 * Operands are checked and results have to be too, or `div(1, 0)` puts
 * `Infinity` into a mass and `sqrt(neg(4))` draws a circle of radius `NaN`,
 * neither saying anything. Caught one node up rather than at the next
 * operation, so the message names what produced the value instead of
 * complaining about what it was handed.
 */
function produced(op: Operation, result: unknown): unknown {
  const bad =
    typeof result === 'number'
      ? !Number.isFinite(result)
      : Array.isArray(result) &&
        result.some(
          (each) => typeof each === 'number' && !Number.isFinite(each),
        );

  if (bad) {
    throw new Error(`${op} produced ${describe(result)}.`);
  }

  return result;
}

/** How far a fold has got: the path it is on, and what it has already worked out. */
interface Fold {
  /** The operations above this one, so a graph reaching itself is named. */
  readonly path: readonly ExpressionNode[];

  /**
   * What each node evaluated to, so a node with two edges is evaluated once.
   *
   * A graph is not a tree, and folding it as one costs a doubling per level of
   * shared structure -- on the very shape sharing is *for*, "compute the rod
   * length once and use it in four places". Safe because evaluation is pure,
   * and because every non-terminating graph is refused before the fold starts.
   */
  readonly done: Map<unknown, unknown>;
}

export function evaluate(
  node: unknown,
  fold: Fold = { path: [], done: new Map() },
): unknown {
  if (isTagged(node) && !isOperation(node)) {
    throw new Error(
      `An operation needs a name and its operands, and found ${describe(node)}.`,
    );
  }

  if (!isOperation(node)) {
    return node;
  }

  if (fold.path.includes(node)) {
    // The path, not the kind: `add is one of its own operands` says nothing in
    // a rig holding a dozen of them, where `mul -> add -> neg -> add` says
    // where to look. Page 4 asks for the participants to be named.
    const cycle = [...fold.path, node].map(({ op }) => op).join(' -> ');

    throw new Error(`An expression reaches itself: ${cycle}.`);
  }

  if (fold.done.has(node)) {
    return fold.done.get(node);
  }

  // Own properties only. A bracket lookup on an object literal reaches
  // `Object.prototype`, so `op: 'constructor'` would find a function, pass the
  // refusal below, and hand back a boxed operand as a prop value.
  const operation = (
    Object.hasOwn(OPERATIONS, node.op) ? OPERATIONS[node.op] : undefined
  ) as ((...operands: unknown[]) => unknown) | undefined;
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

  const within = { path: [...fold.path, node], done: fold.done };
  const result = produced(
    node.op,
    operation(...node.operands.map((operand) => evaluate(operand, within))),
  );
  fold.done.set(node, result);

  return result;
}

/** What evaluating an expression can yield: a scalar, or a point. */
type Computed = number | readonly number[];

/**
 * A component's props, where any of them may instead be computed.
 *
 * What a building block *is* stays declared on the plain type -- its `meta`,
 * its defaults, what its `build` receives -- and this is the wider thing an
 * element may be given. So a default the prop would not accept still fails to
 * compile, where widening the declared type would have let one through.
 *
 * **Only the props an expression could produce a value for.** The operations
 * yield a scalar or a point and nothing else, so a colour, a frame id, a
 * constraint end and a flag are left exactly as they were -- widening those
 * would trade a compile error for a silent coercion, and `color={mul(3, 2)}`
 * setting a stroke to `6` is not an improvement on it not compiling.
 *
 * `children` and `ref` are excluded by name as well, because `ReactNode`
 * includes `number` and so would pass the test above: an expression there has
 * a consumer that would take it as a child.
 */
export type Computable<T> = {
  readonly [K in keyof T]: K extends 'children' | 'ref'
    ? T[K]
    : [Extract<T[K], Computed>] extends [never]
      ? T[K]
      : T[K] | ExpressionNode;
};

/** Every prop value in `props`, with any expression among them computed. */
export function computed<T extends object>(props: Computable<T>): T {
  return Object.fromEntries(
    Object.entries(props).map(([name, value]) => {
      try {
        return [name, evaluate(value)];
      } catch (error) {
        // Every refusal in this module reaches a person through a prop, and
        // none of them can name one from inside the graph. This is the only
        // place that knows, so it is where they all get it.
        throw new Error(
          `${name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
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
