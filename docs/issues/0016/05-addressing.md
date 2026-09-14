# 5 — Addressing

**Parent:** <a href="../0016.md" title="0016 — Make the document a program rather than a drawing">0016</a>
· **Previous:** [Expressions](04-expressions.md)
· **Next:** [Structure that computes](06-structure.md)

This is the only genuinely invasive change in the RFC, it is invisible to a user,
and it is the one thing I would most want done before anything that depends on
it. **Do it once.**

## What a path is today

A `NodePath` is an index path: `[1, 2]` is the third child of the second node of
a definition's body. It is the editor's universal handle — selection, insertion,
drag and drop, prop edits, undo steps, the code pane's mark, and the map from a
scene hit back to the node that authored it all travel as paths.

Two features on the wish list each break it, and they break it differently.

**Named slots** mean a node's children are no longer one list. `[1, 2]` becomes
ambiguous the moment a `DualAntennaCart` has a left and a right, so a path needs
to say which: `[1, 'left', 0]`.

**Repetition** means one authored node can produce many built ones. Addressing
*the authored template* is unchanged, but addressing *the third pendulum* — to
drag it, to select it, to mark it in the code — needs an iteration index that no
authored path contains.

## Why once

Everything in the list above has to be taught the new shape, and the work is
mechanical but wide: `insertion.ts`'s holder and insertion-point logic, `moveNode`
and `movedPath`, the tree pane's row keys and drag targets, `dragTargetAt` and
the pick cycling, `emitScene`'s range keys, and every history step.

**The two halves are not the same size, and only one of them is this migration.**
Everything in the list above addresses an *authored* node, so it is the slot
component that touches all of it. The iteration index reaches selection, picking
and the drag path, and nothing else — because, as above, addressing the authored
template is unchanged by repetition.

So the ordering argument is about slots rather than about both:

- **The slot component is invasive whenever it lands.** Every site that walks a
  path has to learn that a node's children are no longer one list, and each one
  built before it lands is one more site to migrate. That is the case for doing
  it once, and early, while the number of such sites is as small as it will ever
  be.
- **The instantiation trail is additive**, and can land with the only feature
  that produces more than one copy to address. Designing it now is worth doing —
  the shapes have to fit together — but landing it early buys nothing.

## What already exists to build on

More than the blank-page feeling suggests.

**`buildScene` has a `Trail`** — the chain of composites that produced an
element. That is the natural place for an iteration index to live, because it is
already the record of *how* a built thing came to be rather than *where* it sits
in a body.

**The one-to-many map already works.** A defined component's instance already
produces many frames from one authored node, and the editor already handles it:
`authoredPathOf` maps a hit to the node in this body that stands for it,
`expandedOf` maps it to the node that actually built it in whatever body wrote
that, and Shift-click walks between them. Repetition is the same shape with a
counter attached. This is the part most likely to be feared and least likely to
be hard.

**Unique frame ids are already enforced.** The core `Scene` refuses a frame the
tree reaches twice and two frames sharing an id, which is exactly the guard
repetition needs — generated ids must differ per iteration, and the existing
check will say so loudly if they do not.

## The shape

Not settled here, but the constraints are:

- A path must remain comparable and prefix-testable, since selection, insertion
  refusals and `movedPath` all lean on that.
- It must distinguish *authored* position from *instantiated* position, because
  an edit applies to the template and a selection may refer to one expansion.
  These are two different things and collapsing them is how the tree view ends
  up editing the wrong pendulum.
- A slot component must be optional in representation but not in meaning: a node
  with one unnamed slot should not pay for slots it does not have, or every
  existing path in the tests changes shape for nothing.

The obvious answer is a segment of *index plus optional slot name* —
`[1, 'left', 0]` — and everything above was written toward it. **I think it is
the wrong one**, and the third constraint is the tell: a representation that has
to be excused for what it costs the cases not using it is usually the wrong
shape.

## Proposed: the slot belongs on the child, not in the path

Put the slot on the child node. A node's children stay **one ordered list**, and
a child carries an optional `slot` naming which of its holder's slots it sits in
— absent meaning the only one:

```ts
export interface DocNode {
  readonly type: ComponentRef;
  readonly props: DocProps;
  readonly key?: string;

  /** Which of the holder's slots this sits in; absent means the only one. */
  readonly slot?: string;

  readonly children: readonly DocNode[];
}
```

**`NodePath` then never changes.** `[1, 2]` is the third child of the second
node, before slots and after them, because there is still exactly one list to
index. Every existing path keeps its shape, every prefix test keeps working, and
the migration this page opens by calling *"the only genuinely invasive change in
the RFC"* does not happen.

The premise that forces a path change is that a node's children become several
lists. That is a consequence of the representation, not of the feature: `[1, 2]`
is ambiguous only if there are several lists for the `2` to index into.

### `movedPath` is the case that decides it

```ts
export function movedPath(from: NodePath, parent: NodePath, index: number): NodePath {
  return [...afterRemoval(parent, from), index];
}
```

Index arithmetic over one list. Under a slotted path it has to know *which* list
shifted when a node left, and `afterRemoval` becomes slot-aware along with every
caller. Under a labelled child it is untouched — moving a node between slots is
an edit to a field, and the indices behave exactly as they do now.

### What it costs, stated plainly

- **An invalid state becomes representable**: a child labelled `left` under a
  holder whose type declares no such slot. That wants validation — but an unknown
  key in a per-slot map is the same hole, so it is a place to remember rather
  than a regression.
- **"The children of slot `left`" is a filter, not a lookup.** At the sizes a
  scene tree reaches, not a cost worth pricing.
- **Order *between* slots is representable and meaningless.** Harmless: the tree
  view groups by slot when it draws, so nobody sees it.
- **Appending to a slot becomes arithmetic.** `insertionPoint` appends at
  `node.children.length` today; appending to a named slot means *after the last
  child carrying that label*. That is the one piece of genuinely new logic, and
  it is local to `insertion.ts`.
- **The emitter still groups children by slot** to write them as element-valued
  props — the same work under either shape.

### What it would do to the plan

[Page 10](10-staging.md) puts addressing at step 2, ahead of everything a person
can see, because its cost grows with every site built before it. **That argument
is about the path migration, and on this proposal there is no path migration.**
The `slot` field arrives with named slots, in the step that introduces them, and
costs what an optional field costs.

The iteration half was never a path change either — it lives in an instantiation
trail beside the path rather than inside it, which is what "two answers rather
than one interleaved sequence" was reaching for above. So on this proposal
`NodePath` is, as far as this RFC can see, finished.

**Not adopted here.** This is a proposal against a section that says it is not
settled, and it retires the RFC's most invasive scheduled step — which is worth
a second opinion before the staging is rewritten around it.
