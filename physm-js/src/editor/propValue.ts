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
export type PropValue = {
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

/**
 * The plain values, for a caller that hands props to React or writes them as
 * source.
 *
 * **One seam only while there is one variant**, because the two callers want
 * different things from an expression. `elementOf` is handing React something
 * to render, so it will want one *evaluated in a scope*. The emitter will not:
 * [0016 page 4](../../../docs/issues/0016/04-expressions.md) gives codegen its
 * own bullet -- an expression is shown "as emitted code, one-way" -- so it will
 * want one *written as source*. An emitter that resolved first would
 * constant-fold every expression on the way out, and the parameter would be
 * gone from the only place the document is shown as source.
 *
 * Splitting them now would be the same function written twice, which is why
 * this is a note rather than two helpers: the shared seam is early, not
 * settled.
 */
export function plainProps(props: DocProps): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(props).map(([name, prop]) => [name, prop.value]),
  );
}
