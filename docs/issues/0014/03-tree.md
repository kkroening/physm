# 3 · The tree view

<sub>[← Prev: 2 · The document is an element tree](./02-document.md) · [↑ Index](../0014.md) · [Next: 4 · Component metadata →](./04-metadata.md)</sub>

## Two axes, not one

It is tempting to sort nodes into "components" and "primitives". The useful split
is two independent axes:

|              | **Core** (`TrackFrame`, `Weight`, `Line`…) | **Composite** (`RopeChain`, `Pendulum`…) |
| ------------ | ------------------------------------------ | ---------------------------------------- |
| **Authored** | editable; children editable                | editable; **expansion** read-only        |
| **Expanded** | read-only                                  | read-only, expandable further            |

A `RotationalFrame` is editable when you dragged it in and read-only when
`RopeSegment` produced it. Nothing about the *kind* of node decides; only where
it came from does.

## What `+` does

One affordance, two meanings, and the ownership colouring is what tells them
apart — no mode switch, no second control:

- **On a node with authored children**, `+` reveals those children. Editable.
  This is the common case and the one that should feel like a file tree.
- **On an authored composite**, `+` additionally offers a distinct
  `⟨expansion⟩` row. Under it is what the component produced: read-only, greyed,
  and expandable further.

So `RopeChain` in the demo shows:

```
▾ RopeChain            anchor=[-5.4, 1]
  ▸ ⟨expansion⟩                              ← read-only, 5 frames deep
  ▾ Pendulum                                 ← authored, editable
```

The `Pendulum` sits directly under `RopeChain` because it is `RopeChain`'s
authored child, even though the expansion puts it five levels down — the slot
presentation from [page 2](./02-document.md#where-the-two-trees-meet).

## Recursion is not a problem

`RopeChain` recurses. The instinct is to forbid it and require a flat
`RopeChainSegment` list instead. **Don't** — under the ownership rule the
recursion has nowhere to cause trouble:

- It happens entirely inside the expansion, which is read-only.
- It terminates, because `index >= SEGMENT_COUNT` returns `children`.
- The editor sees exactly one node, `RopeChain`, with one prop.

The tree view expands the recursion lazily and it looks like any other five-deep
chain. **The one thing the expansion needs is a depth cap** — not because
`RopeChain` is unbounded, but because a component with a genuine bug would
otherwise hang the editor rather than reporting itself. A cap of a few hundred,
with the row marked as truncated, turns an infinite loop into a diagnostic.

Recursion does surface one real wart, and it belongs to
[page 4](./04-metadata.md) rather than here: `RopeChain`'s `index` prop is an
internal accumulator that happens to be declared like a public one.

## Naming rows

A node needs a label, and the honest one is the component's name plus enough
props to disambiguate siblings. `RopeChain` twice over is useless;
`RopeChain anchor=[-5.4, 1]` and `RopeChain anchor=[5.4, 1] mirror` are not.

Metadata should name which props are **identifying** — the ones worth putting in
the row. Falling back to "the first two scalar props" would be guessing, and
guessing produces exactly the row that is unhelpful in the case you care about.

For expanded nodes, the label should say what produced them:
`RotationalFrame ← RopeSegment`. The frame is what the physics sees; the
component is what you would change to affect it.

## Selection

One selection, shared by all four panes, and it is a **path** rather than a node
identity — `[0, 'children', 1]` — because an authored node has no id until
[page 5](./05-codegen.md) gives it one, and because the same component appearing
twice must be selectable separately.

Selecting an **expanded** node is allowed and useful: it is how you answer "which
frame is that, and what made it?". The properties pane shows its props read-only,
and offers **"select the node that produced this"** — which walks up to the
nearest authored ancestor. That is the bridge from "I clicked a thing in the
scene" to "here is what I can actually change", and it is the piece that makes
scene-view picking worth having ([page 6](./06-editing.md)).

## Reordering and re-parenting

Drag within the tree, with two constraints that fall out of the model:

- **Only authored nodes drag.** An expanded node has no position in the document
  to move.
- **A drop target must accept the node.** `<Weight>` inside `<Line>` is not a
  scene; the metadata's slot kind ([page 4](./04-metadata.md)) says what may
  contain what, and the drop indicator refuses rather than allowing an edit that
  produces a broken scene.

**Order is not cosmetic**, which is exactly [0005](../0005.md)'s point: for
decals it is SVG paint order, and for frames it is `sortedFrames` order, which
indexes the mass matrix. So a reorder is a real edit with a physical
consequence, and the tree view is the only place a person can express it
directly.

---

<sub>[← Prev: 2 · The document is an element tree](./02-document.md) · [↑ Index](../0014.md) · [Next: 4 · Component metadata →](./04-metadata.md)</sub>
