import { isOperation } from './../expression';
import type { ExpressionNode } from './../expression';
/**
 * What a prop in a document holds: a value written into it, or the name of a
 * parameter the definition it sits in takes.
 *
 * The tag is the point of the module. A prop is read in a dozen places -- the
 * scene pane's handles, the properties pane, the tree row, the emitter -- and
 * most of them can only act on a value that is actually *there*, so what they
 * need from the type is to be stopped at the ones that are not. Reaching for
 * `.value` is how a caller says so, and the compiler names every such caller
 * whenever the union grows. [0016](../../../docs/issues/0016.md) has a third
 * member arriving: a prop holding an *expression*, a length computed from a
 * parameter or an endpoint read from a pose.
 *
 * It names only those, though, which is worth knowing before relying on it. A
 * caller that never reaches for `.value` -- one that passes a whole prop to
 * `JSON.stringify`, or to a parameter typed `unknown` -- goes on compiling and
 * silently shows or writes the wrapper. Those sites are the readonly displays
 * and the tree row's summary and find; what checks them is `Editor.test.tsx`,
 * which renders a node whose prop holds a reference and reads what each shows.
 */
export type PropValue = LiteralValue | ParameterValue | ExpressionNode;

/**
 * A prop value the module can hold by name.
 *
 * Only a literal: a reference is already a name, and there is nothing to
 * hoist. Named here rather than narrowed at each use, so the emitter's
 * constants map carries the fact in its type.
 */
export type SharedValue = LiteralValue;

/** A plain value, written where it is used. */
type LiteralValue = {
  readonly kind: 'literal';

  /**
   * Plain data, of whatever shape the prop's component declares.
   *
   * `unknown` because that shape is the component's business -- at the cost
   * that a prop holding nothing and a prop that is *absent* look alike to the
   * type system. So "is it there" and "does it have a value" are two questions
   * the compiler cannot keep apart, and a caller that cares has to say which
   * it means: `setProp` takes `undefined` to mean *remove*, never *store
   * nothing*, and a summary row reads the value rather than the prop.
   */
  readonly value: unknown;
};

/**
 * A reference to a parameter of the definition this node sits in.
 *
 * It has no value of its own: what it resolves to depends on what the
 * *instance* was given, which is why resolving one needs a scope and why
 * `documentFrom` cannot recover one -- by the time an element tree exists, the
 * host has already substituted the argument.
 */
type ParameterValue = {
  readonly kind: 'parameter';

  /** Names a parameter the enclosing definition declares. */
  readonly name: string;
};

/**
 * A node's props, as the document holds them.
 *
 * Not a React component's `props`: those are plain, and `sceneDocument`'s
 * reader converts between the two a line apart.
 */
export type DocProps = Readonly<Record<string, PropValue>>;

/**
 * Which literal node each value object has already been given.
 *
 * Reading one authored element tree, so that two props given *the same* array
 * end up holding one node rather than two equal ones. That is a fact the
 * source states and the document would otherwise lose -- and losing it is what
 * made the emitter guess sharing back from equality, which it can get wrong in
 * both directions.
 *
 * One of these per read, never shared between them: a building block's
 * declared `initial` is one object across every instance of it, and two
 * separately inserted boxes are not two views of one value.
 */
export type Sharing = WeakMap<object, PropValue>;

/**
 * A plain value, held as a prop.
 *
 * With a `sharing`, a value *object* seen again gives back the node it was
 * given before. A primitive never shares: two props holding `4` are two props
 * holding four, not one value seen twice, and nothing about the source says
 * otherwise.
 */
export function literalOf(value: unknown, sharing?: Sharing): PropValue {
  if (!sharing || value === null || typeof value !== 'object') {
    return { kind: 'literal', value };
  }

  const held = sharing.get(value) ?? { kind: 'literal' as const, value };
  sharing.set(value, held);

  return held;
}

/**
 * Props read from somewhere that states plain values: JSX, or a building
 * block's declared `initial`s.
 */
export function literalProps(
  plain: Readonly<Record<string, unknown>>,
  sharing?: Sharing,
): DocProps {
  return Object.fromEntries(
    Object.entries(plain).map(([name, value]) => [
      name,
      literalOf(value, sharing),
    ]),
  );
}

/** A reference to a parameter of the enclosing definition. */
export function parameterOf(name: string): PropValue {
  return { kind: 'parameter', name };
}

/**
 * `prop` with every reference in it replaced by what `scope` holds.
 *
 * Into the graph, not just at the top: `mul(halfLength, 2)` holds the reference
 * as an *operand*, and a resolution that stopped at the prop would hand the
 * node itself to an operation expecting a number.
 *
 * `seen` keeps one resolved node per original, so a graph shared before
 * resolution is shared after it -- which is what keeps evaluation over nodes
 * rather than edges, and what a viewer of a resolved graph would need to draw.
 */
function resolved(
  prop: unknown,
  scope: Scope,
  seen: Map<unknown, unknown>,
): unknown {
  if (isOperation(prop)) {
    const already = seen.get(prop);
    if (already !== undefined) {
      return already;
    }

    const node: ExpressionNode = {
      kind: 'operation',
      op: prop.op,
      operands: prop.operands.map((operand) => resolved(operand, scope, seen)),
    };
    seen.set(prop, node);

    return node;
  }

  if (prop === null || typeof prop !== 'object') {
    return prop;
  }

  const held = prop as PropValue;

  return held.kind === 'parameter'
    ? scope[held.name]
    : held.kind === 'literal'
      ? held.value
      : prop;
}

/**
 * What a definition was given, keyed by parameter name -- the scope a
 * `parameter` prop resolves against.
 */
export type Scope = Readonly<Record<string, unknown>>;

/**
 * Props with every reference resolved against `scope`, for a caller that hands
 * them to React.
 *
 * This is one half of a seam [0016 page 4](../../../docs/issues/0016/04-expressions.md)
 * predicted would split, and it has: React needs a value, so a reference is
 * resolved here — while the emitter needs the *reference*, and prints the name.
 * An emitter that resolved first would substitute every argument on the way
 * out, and the parameter would be gone from the only place the document is
 * shown as source.
 *
 * A name the scope does not hold resolves to `undefined`, which is the same as
 * an absent prop: a definition instantiated without one of its parameters
 * builds as though that prop had never been set, and the component's own
 * default applies.
 *
 * What comes out is a plain value or an *expression over plain values*: the
 * references are gone, and the operations are left standing for whoever
 * consumes them to fold. A building block's is folded where the build route
 * hands props over, and a composite's by the composite being a function that
 * receives what a person would have written -- which is why a parameter has to
 * arrive as a value rather than a node.
 */
export function resolvedProps(
  props: DocProps,
  scope: Scope,
): Record<string, unknown> {
  const seen = new Map<unknown, unknown>();

  return Object.fromEntries(
    Object.entries(props).map(([name, prop]) => [
      name,
      resolved(prop, scope, seen),
    ]),
  );
}

/**
 * How an expression reads as source: `mul(bob, 2)`.
 *
 * Constructor form, which is what the emitter writes and therefore what a
 * person shown the same expression anywhere else should read. How a reference
 * and a plain value are written is the caller's, because the emitter has to
 * refuse a name the module does not bind and a value it cannot write, where a
 * display has only to show something.
 */
export function expressionSource(
  node: ExpressionNode,
  write: {
    reference: (name: string) => string;
    value: (held: unknown) => string;
  },
): string {
  const operand = (held: unknown): string => {
    if (isOperation(held)) {
      return expressionSource(held, write);
    }

    return held !== null &&
      typeof held === 'object' &&
      (held as PropValue).kind === 'parameter'
      ? write.reference((held as { name: string }).name)
      : write.value(held);
  };

  return `${node.op}(${node.operands.map(operand).join(', ')})`;
}

/**
 * The value, when a caller can only act on a literal one.
 *
 * `undefined` for a reference, which is the same answer as for an absent prop.
 * That is a narrowing rather than a policy, and the difference matters: what a
 * reference *means* to a caller is the caller's to decide, and a `?? default`
 * written over this would place a handle at a value the document never states.
 * So the callers that must withhold something withhold it themselves -- the
 * scene pane drops a referenced point before it reaches here -- and this is
 * what lets them read a literal without a cast.
 */
export function literalIn(prop: PropValue | undefined): unknown {
  return prop?.kind === 'literal' ? prop.value : undefined;
}

/**
 * How a prop reads in a tree row or a search, or `null` when it says nothing.
 *
 * A reference shows the *name* rather than a value, unquoted, so that
 * `id=halfLength` and `id="halfLength"` are distinguishable at a glance: the
 * first is a parameter and the second a string that happens to look like one.
 */
export function shownValueOf(prop: PropValue | undefined): string | null {
  if (!prop) {
    return null;
  }

  if (isOperation(prop)) {
    return expressionSource(prop, {
      reference: (name) => name,
      value: (held) => JSON.stringify(held) ?? String(held),
    });
  }

  return prop.kind === 'parameter'
    ? prop.name
    : prop.value === undefined
      ? null
      : JSON.stringify(prop.value);
}
