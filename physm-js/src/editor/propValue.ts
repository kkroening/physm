/**
 * What a prop in a document holds.
 *
 * One variant today, and the indirection is the whole point of the module.
 * [0016](../../../docs/issues/0016.md) has a prop hold an *expression* -- a
 * length computed from a parameter, an endpoint read from a pose -- and a
 * tagged value is what lets that arrive as a second member of this union
 * rather than as a change to every prop site in the editor.
 *
 * The tag is doing that work already, before the variant exists: a caller that
 * reaches for `.value` is a caller that can only handle a literal, so the day a
 * second member lands the compiler names it. Adding one as an experiment turns
 * up 34 such sites across the four files that consume a prop.
 *
 * It names only those, though, which is worth knowing before relying on it. A
 * caller that never reaches for `.value` -- one that passes a whole prop to
 * `JSON.stringify`, or to a parameter typed `unknown` -- goes on compiling and
 * silently shows or writes the wrapper. Those sites are the readonly displays,
 * the tree row's summary and find, and they are covered by tests instead.
 */
export type PropValue = LiteralValue | ParameterValue;

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

/** A plain value, held as a prop. */
export function literalOf(value: unknown): PropValue {
  return { kind: 'literal', value };
}

/**
 * Props read from somewhere that states plain values: JSX, or a building
 * block's declared `initial`s.
 */
export function literalProps(
  plain: Readonly<Record<string, unknown>>,
): DocProps {
  return Object.fromEntries(
    Object.entries(plain).map(([name, value]) => [name, literalOf(value)]),
  );
}

/** A reference to a parameter of the enclosing definition. */
export function parameterOf(name: string): PropValue {
  return { kind: 'parameter', name };
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
 */
export function resolvedProps(
  props: DocProps,
  scope: Scope,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(props).map(([name, prop]) => [
      name,
      prop.kind === 'parameter' ? scope[prop.name] : prop.value,
    ]),
  );
}

/**
 * The value, when a caller can only act on a literal one.
 *
 * `undefined` for a reference, which is the same answer as for an absent prop
 * -- and the right one for every caller here. A gizmo handle places a point the
 * document states; a point that depends on what an instance was given has no
 * fixed place to put a handle, so offering none is correct rather than a
 * fallback.
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

  return prop.kind === 'parameter'
    ? prop.name
    : prop.value === undefined
      ? null
      : JSON.stringify(prop.value);
}
