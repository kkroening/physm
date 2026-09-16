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
 *
 * **Two kinds, and one of them needs a moment.** Most operations are functions
 * of their operands and nothing else, so a build can answer them. A few read
 * where the scene has *got to*, which nothing knows until it is posed --
 * [0016 page 2](../../docs/issues/0016/02-values.md) calls those **signals**,
 * and its whole rule is that "a structural expression may not read state".
 * Here that is one `Tick` parameter: an evaluation given one may use either
 * kind, and an evaluation given none refuses a signal by name.
 *
 * **The kind is a property of a value at run time, and deliberately not of its
 * type.** A brand on what `worldPoint` returns would be the tighter guarantee
 * where it held, and it would not hold: every operation takes `unknown`
 * operands and refuses at run time naming what it got, because a document can
 * hold a node nobody's constructor made. So a brand would propagate through
 * hand-written TSX and lapse silently for the same scene read back out of a
 * document -- and the two routes building the same scene is the property this
 * binding exists to have.
 *
 * The run-time gate also has to exist either way: a `SceneDocument` holds prop
 * values as `unknown`, and nothing on that path has a type to check. A
 * type-level kind would therefore be a second and *partial* statement of a
 * rule this one states totally, which is two rules to keep in step rather than
 * one. `DecalView`'s union is the contrast rather than the parallel: there the
 * run time has no way to notice a missing branch, so the type system is the
 * only place that rule can live.
 */

import type Scene from './Scene';
import type { PoseMap, PositionLike } from './Scene';
import type { StateMap } from './Frame';

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

/**
 * What a signal reads: where the scene has got to.
 *
 * Both halves, and they belong together. The scene is what a frame id means,
 * and the poses are where its frames are -- a pose map made from *another*
 * scene answers a colliding id with a number from the wrong rig, silently and
 * finitely, which neither the missing-frame refusal nor the result check can
 * catch. `tickOf` is how one is made, so the two arrive paired.
 */
export interface Tick {
  readonly scene: Scene;
  readonly poses: PoseMap;
}

/**
 * The tick a scene is at, for a state it is in.
 *
 * The pose walk happens once here rather than once per signal: every
 * `worldPoint` in a drawing reads the same map, which is the whole reason a
 * world-space value is not a new mechanism -- it is one more consumer of the
 * layout pass [0016 page 2](../../docs/issues/0016/02-values.md) says physm
 * already owns.
 */
export function tickOf(scene: Scene, stateMap: StateMap | null = null): Tick {
  return { scene, poses: scene.getPosMatrixMap(stateMap) };
}

/**
 * Every operation that reads the tick rather than only its operands.
 *
 * A second table rather than a flag on the first, so `OPERATIONS` stays a set
 * of pure functions of their operands: a caller holding only that table cannot
 * reach a signal by accident, and the two cannot be told apart by reading an
 * implementation.
 *
 * **The tick is a parameter and not an operand.** It is the fold that supplies
 * it, so what an author writes is one shorter than what is declared here --
 * which is the `- 1` in the arity below, and the only place the two shapes
 * differ.
 */
const SIGNALS = {
  /**
   * Where a point on a frame has got to, in world coordinates.
   *
   * The two halves of "a point on a body": which frame, and where on it.
   * Both are structural -- an author writes the id, and the local point does
   * not move -- and it is the pose between them that makes the answer a
   * signal. This is the leaf every drawing signal is built from, and it is one
   * more consumer of the map `getPosMatrixMap` already makes rather than a
   * second walk of its own.
   *
   * The local point is a point and not a `PositionLike`: a prop takes a bare
   * number as an offset along the frame's own axis, and admitting that here
   * would make this the one place in the language where a scalar and a point
   * are the same thing.
   *
   * **`Scene.getWorldPosition` is the arithmetic**, rather than this repeating
   * it. That method already takes a caller's pose map for exactly this reason,
   * and already refuses a frame the scene does not contain -- so the one thing
   * this adds is the refusal naming what it was handed instead of a frame's
   * id, which an operand can be and a method's argument cannot.
   */
  worldPoint: (tick: Tick, frame: unknown, local: unknown) =>
    tick.scene.getWorldPosition(label(frame), point(local) as PositionLike, {
      posMatMap: tick.poses,
    }),
} satisfies Record<string, (tick: Tick, ...operands: never[]) => unknown>;

/** What an operation is called, which is also what the emitter writes. */
export type Operation = keyof typeof OPERATIONS | keyof typeof SIGNALS;

/** One operation, in the single shape the fold applies. */
interface Applied {
  /** Whether it reads the tick, and so may not stand in a structural position. */
  readonly signal: boolean;

  /** How many operands it takes, which for a signal does not count the tick. */
  readonly arity: number;

  readonly apply: (tick: Tick | null, operands: readonly unknown[]) => unknown;
}

/**
 * Both tables as one, which is what every lookup below reads.
 *
 * A `Map` rather than either object, so a name is looked up among the ones
 * *declared*: `op: 'constructor'` finds nothing here, where the same lookup on
 * an object literal reached `Object.prototype`, found a function, and computed
 * with it.
 */
const EVERY: ReadonlyMap<string, Applied> = (() => {
  const table = new Map<string, Applied>();

  for (const [op, run] of Object.entries(OPERATIONS)) {
    const call = run as (...operands: unknown[]) => unknown;

    table.set(op, {
      signal: false,
      arity: call.length,
      apply: (_tick, operands) => call(...operands),
    });
  }

  for (const [op, run] of Object.entries(SIGNALS)) {
    const call = run as (tick: Tick, ...operands: unknown[]) => unknown;

    table.set(op, {
      signal: true,
      arity: call.length - 1,
      apply: (tick, operands) => {
        // The refusal lives with the thing that needs the tick, so there is
        // one place that decides what a missing one means. A caller one level
        // up -- `computed` -- is what names the prop it happened in.
        if (!tick) {
          throw new Error(
            `${op} is a signal: it reads where the scene has got to, which ` +
              'is not known where this is worked out.',
          );
        }

        return call(tick, ...operands);
      },
    });
  }

  return table;
})();

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

/** A frame's id an operation was given, or a throw naming what it got instead. */
function label(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error(`Expected a frame's id, and found ${describe(value)}.`);
  }

  return value;
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
  /**
   * Where the scene has got to, or `null` where nothing has posed it yet.
   *
   * One value for the whole fold rather than a parameter threaded through it,
   * because it is the *occasion* that has a tick or has not -- a build, or a
   * frame being drawn -- and no operand of an operation can change which
   * occasion it is being evaluated on.
   */
  readonly tick: Tick | null;

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

/**
 * The value `node` computes, or itself when it is not an operation.
 *
 * `tick` is what makes a signal answerable. Passing none is the *structural*
 * evaluation -- a build -- and is why `computed` can gate a prop by simply
 * not having one: a signal reaching a position that is worked out before the
 * scene is posed refuses there, naming the operation and the prop, rather than
 * silently yielding a number from a pose that is not the one it meant.
 */
export function evaluate(node: unknown, tick: Tick | null = null): unknown {
  return folded(node, { path: [], done: new Map(), tick });
}

/**
 * One step of the fold, carrying how far it has got.
 *
 * Separate from `evaluate` so that the path and the memo are the recursion's
 * own business: a caller states the occasion -- a tick, or none -- and cannot
 * hand in a half-finished fold, which would let a node be answered from a
 * memo made under a different pose.
 */
function folded(node: unknown, fold: Fold): unknown {
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

  const operation = EVERY.get(node.op);
  if (!operation) {
    throw new Error(`'${node.op}' is not an operation.`);
  }

  // Checked here as well as by the constructors, because a document can hold a
  // node nobody's constructor made -- and JavaScript would otherwise drop an
  // extra operand or compute with `undefined` for a missing one.
  if (node.operands.length !== operation.arity) {
    throw new Error(
      `${node.op} takes ${operation.arity} operands, and was given ` +
        `${node.operands.length}.`,
    );
  }

  const within = { ...fold, path: [...fold.path, node] };
  const result = produced(
    node.op,
    operation.apply(
      fold.tick,
      node.operands.map((operand) => folded(operand, within)),
    ),
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

/**
 * Every prop value in `props`, with any expression among them computed.
 *
 * With no `tick` this is the structural fold, and a signal among the props
 * refuses rather than producing a number: the prop is named, the operation is
 * named, and it happens where the value was handed over rather than wherever
 * it would have been drawn.
 */
export function computed<T extends object>(
  props: Computable<T>,
  tick: Tick | null = null,
): T {
  return Object.fromEntries(
    Object.entries(props).map(([name, value]) => {
      try {
        return [name, evaluate(value, tick)];
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
type Operands<K extends Operation> = K extends keyof typeof OPERATIONS
  ? Parameters<(typeof OPERATIONS)[K]>
  : K extends keyof typeof SIGNALS
    ? WithoutTick<Parameters<(typeof SIGNALS)[K]>>
    : never;

/**
 * A signal's parameters as the operands an author writes.
 *
 * The tick is the fold's to supply, so it is dropped here -- and dropped by
 * matching its type rather than by counting, so a signal declared without one
 * fails to have a constructor instead of quietly losing its first operand.
 */
type WithoutTick<P extends readonly unknown[]> = P extends readonly [
  Tick,
  ...infer Rest,
]
  ? Rest
  : never;

/** What a caller holding an operation's *name* can ask about it. */
export interface OperationInfo {
  /** Whether it reads the tick, and so may only stand where a signal may. */
  readonly signal: boolean;

  /** How many operands it takes, which for a signal does not count the tick. */
  readonly arity: number;
}

/**
 * What `name` names among the operations, or `null` for no such name.
 *
 * For a caller building a node from text rather than from a constructor -- a
 * parser, or a document being read back. Both answers come from the
 * implementations themselves, so a caller checking against them cannot drift
 * from what `evaluate` will refuse *about the name and the count*. Neither
 * says anything about the operands: a parser that accepted a non-finite number
 * would still be handing over what `scalar` refuses.
 */
export function operationNamed(name: string): OperationInfo | null {
  const found = EVERY.get(name);

  // Projected rather than handed back, because the table's own entry carries
  // `apply` -- which runs the operation while skipping the arity check and the
  // result check that every call inside the fold is wrapped in. A return type
  // hides that field from a caller; it does not keep one from reaching it.
  return found ? { signal: found.signal, arity: found.arity } : null;
}

/**
 * Every operation there is, by name.
 *
 * For a caller that has to *enumerate* them rather than ask about one. Today
 * that is the check holding the binding's re-exports to this table: an emitted
 * module imports operations by the names a document happens to use, and
 * nothing else keeps those two lists from drifting apart
 * (`docs/issues/0026.md`).
 */
export function operationNames(): readonly Operation[] {
  return [...EVERY.keys()] as Operation[];
}

/**
 * An operation node built from a name checked at runtime.
 *
 * The constructors below are the spelling for code, where the name is known as
 * it is written. This is for a caller that has the name as a string -- a
 * parser, or a document being read back -- and has already checked it.
 */
export function operationOf(
  op: Operation,
  operands: readonly unknown[],
): ExpressionNode {
  return { kind: 'operation', op, operands };
}

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
export const worldPoint = constructorFor('worldPoint');
