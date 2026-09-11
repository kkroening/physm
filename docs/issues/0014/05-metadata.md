# 5 · Component metadata

<sub>[← Prev: 4 · The tree view](./04-tree.md) · [↑ Index](../0014.md) · [Next: 6 · Code generation →](./06-codegen.md)</sub>

## Reflection is closed, and not narrowly

The hope is that the editor could look at

```tsx
function RopeChain({
  anchor,
  mirror = false,
  index = 0,
  children,
}: RopeChainProps);
```

and learn that it takes an `anchor` of two numbers, an optional `mirror`, and
children. It cannot, and the reasons stack:

- **Types are erased.** `RopeChainProps` does not exist at runtime. There is
  nothing to ask.
- **Destructuring is opaque.** `RopeChain.length` is `1` — one parameter, an
  object. The parameter's shape is not reachable.
- **`Function.prototype.toString` is a parser in disguise.** It returns source
  text; extracting a prop list from it means parsing JavaScript, which is the
  work [page 1](./01-overview.md#one-way-on-purpose) exists to avoid, on the
  input where it is *least* reliable — a minified or transpiled build gives you
  `function(e)`.

So: metadata is declared. That is settled by the language, not by a preference.

## It is the better answer anyway

This matters more than the concession does, because it changes the design rather
than compensating for a gap. **Even a perfect reflector would produce a worse
editor**, and the demo has the example ready-made:

```tsx
function RopeChain({ anchor, mirror = false, index = 0, children }) {
  // `>=`, not `===`: the counter is an internal accumulator, but it is a
  // declared prop, so an `index` past the end would otherwise recurse without
  // bound rather than terminating.
  if (index >= SEGMENT_COUNT) return children;
```

`index` is a recursion accumulator. `mirror` is a real authoring choice. **They
are indistinguishable from the outside** — same syntax, same defaulting, same
types. A reflecting editor puts an `index` spinner in the properties pane, and
the first person to touch it silently truncates the rope.

Reflection can only report what the function *accepts*. What an editor needs is
what a person may *set* — a smaller, curated set, with ranges, units and
defaults that live nowhere in the signature.

## Declare once, derive the type

The cost of explicit metadata is duplication: a props interface and a metadata
block that must agree, drifting the first time someone edits one. Avoid it by
making the **schema the source of truth** and deriving the TypeScript type from
it:

```tsx
export const RopeChain = defineComponent({
  name: 'RopeChain',
  category: 'rope',
  props: {
    anchor: point({ label: 'Anchor', summary: true }),
    mirror: flag({ default: false }),
    segmentCount: int({ min: 1, max: 64, default: 5 }),
  },
  slot: 'frame',
  children: { accepts: 'frame', at: 'tip' },
  render: ({ anchor, mirror, segmentCount, children }) => /* … */,
});
```

`summary: true` marks a prop worth showing in the tree row's dimmed suffix. It
is a display hint and nothing more — identity is the key path
([page 4](./04-tree.md#identity-and-what-a-row-is-called)), never a prop value.

`props` is one declaration serving three consumers: the editor reads it for the
properties pane and the library, `render`'s parameter type is **inferred** from
it, and codegen reads the defaults to know which props to omit. Nothing is
stated twice, so nothing can drift. The technique is the ordinary
schema-to-type inference that validation libraries use, and it needs no build
step.

`index` simply is not in `props`. But that raises a question the schema has to
answer rather than dodge, because `render`'s parameter type is inferred from
`props`: **how does a declared component recurse, if its accumulator cannot be a
prop?**

**Through a plain component.** `render` delegates to a private `RopeLink` with no
`defineComponent` around it, which takes `index` and `segmentCount` as ordinary
props and nests itself:

```tsx
function RopeLink({ index, segmentCount, children }: RopeLinkProps): ReactNode {
  if (index >= segmentCount) return children;
  return (
    <RotationalFrame …>
      <RopeLink index={index + 1} segmentCount={segmentCount}>{children}</RopeLink>
    </RotationalFrame>
  );
}
```

That needs no new mechanism: it is exactly the *plain component* case below —
visible when expanded, props shown read-only, never offered in the library. The
accumulator rides on something the editor already knows not to let anyone edit.

⚠️ **The naive fix does not work, and it is worth seeing why.** Passing `index`
through `RopeChain` itself would put it in the *element's* props — and
[page 2](./02-document.md#jsx-is-a-data-literal-not-a-call)'s premise is that the
editor reads props verbatim off the element. So the editor would meet `index` on
the first expansion, which is the spinner this whole section exists to prevent.
Leaving it out of the schema is not enough; it has to leave the declared
component's props entirely.

## What the prop types have to cover

Scalars are the easy half. The scene vocabulary needs more:

| Kind                    | Example                  | Editor widget                       |
| ----------------------- | ------------------------ | ----------------------------------- |
| `number`, `int`, `flag` | `mass`, `segmentCount`   | field, spinner, checkbox            |
| `point`                 | `position`, `endPos`     | paired fields, later a scene handle |
| `angle`                 | `initialState[0]`        | field in degrees, stored in radians |
| `length`                | `radius`, `lineWidth`    | field, non-negative                 |
| `enum`                  | a joint kind             | select                              |
| `anchorRef`             | `Coincidence`'s two ends | **pick a node** — see below         |
| `children`              | structural               | not a field at all                  |

Two of these carry most of the design weight. **`children` is structural, not a
value**: metadata must distinguish "this component takes children" from "this
component has a prop that happens to be named children", because the first is a
tree edge and the second is a field. And `anchorRef` is the one that reaches
outside the node being edited.

## References have to become names

The demo wires its loop closure imperatively:

```tsx
const rightTip = useRef(null);
…
<Anchor ref={rightTip} />
…
<Coincidence frame1={leftTip} frame2={rightTip} />
```

A `ref` is a mutable cell created by a hook and filled at mount. **It cannot
appear in a document**: it is not data, it does not survive serialization, and
[page 2](./02-document.md#the-obstacle-the-current-binding-cannot-use-it) has
already given up mounting.

The editor needs the declarative form — spelled `id`, which is what the demo
already uses for a frame it names (`<TrackFrame id={CART_FRAME_ID}>`) and what
[page 6](./06-codegen.md#two-kinds-of-name-and-they-are-not-the-same-kind)
enumerates:

```tsx
<Anchor id="right-tip" />
<Coincidence frame1="left-tip" frame2="right-tip" />
```

which is the same problem [0011](../0011.md) raises from the other side — the
demo's controls need to name the cart's frame from outside the scene, and today
the rig "has to break its own story exactly once". One naming mechanism answers
both.

**Names introduce a referential-integrity job the tree does not have.** Deleting
`<Anchor id="right-tip" />` leaves `<Coincidence>` pointing at nothing. The
editor should refuse the delete, or delete both, or leave the constraint visibly
broken — but it must *notice*, which means the document needs an index from name
to node and codegen needs to keep names stable. This is the first place the model
is more than a tree, and [page 9](./09-horizon.md) is about what happens when
that stops being the exception.

## Editor-created components declare it too

A component the editor extracted needs metadata like any other, and it is
**generated rather than written**: a zero-prop prefab starts with an empty
`props`, and each *promote to prop*
([page 3](./03-focus.md#what-an-extracted-component-takes-for-props)) adds an
entry with the promoted value as its default.

The kind comes from the value being promoted — a `[number, number]` promotes to
`point`, a bare number to `number` — with the user able to narrow it afterwards
to `int` or `angle` or a range. Guessing the kind and letting it be corrected is
better than asking first, because the guess is right most of the time and the
question interrupts the operation people actually came to do.

## Plain components still work

A component with no metadata is not an error. It:

- **can** appear in the document, in the tree, and in the expansion;
- **can** be selected, and its props shown read-only;
- **cannot** appear in the library, and cannot have its props edited.

That matters for adoption: an existing scene module keeps compiling and running
unchanged, and gains editor support one component at a time. A migration that
requires rewriting everything before anything works is a migration that does not
happen.

⚠️ **"Unchanged" has one exception, and the demo hits it.** A component that
calls a hook cannot be expanded at all — it throws
([page 2](./02-document.md#what-expanded-costs)) — so `CartAndRope` needs its two
`useRef`s replaced before the editor can read it. Metadata is optional; purity is
not.

---
<sub>[← Prev: 4 · The tree view](./04-tree.md) · [↑ Index](../0014.md) · [Next: 6 · Code generation →](./06-codegen.md)</sub>
