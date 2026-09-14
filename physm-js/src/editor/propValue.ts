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
 * second member lands, the compiler names every one of them.
 */
export type PropValue = {
  readonly kind: 'literal';

  /** Plain data, of whatever shape the prop's component declares. */
  readonly value: unknown;
};

/** A node's props, as the document holds them. */
export type Props = Readonly<Record<string, PropValue>>;

/** A plain value, held as a prop. */
export function literalOf(value: unknown): PropValue {
  return { kind: 'literal', value };
}

/**
 * Props read from somewhere that states plain values: JSX, or a building
 * block's declared `initial`s.
 */
export function literalProps(plain: Readonly<Record<string, unknown>>): Props {
  return Object.fromEntries(
    Object.entries(plain).map(([name, value]) => [name, literalOf(value)]),
  );
}

/**
 * The plain values, for a caller that hands props to React or writes them as
 * source.
 *
 * This is the seam an expression has to be resolved at: both callers need a
 * value, and neither can get one from a graph without a scope to evaluate it
 * in.
 */
export function plainProps(props: Props): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(props).map(([name, prop]) => [name, prop.value]),
  );
}
