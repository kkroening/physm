# 2 · The document is an element tree

<sub>[← Prev: 1 · Overview](./01-overview.md) · [↑ Index](../0014.md) · [Next: 3 · Components and focus →](./03-focus.md)</sub>

## JSX is a data literal, not a call

This is the load-bearing fact, and it is easy to miss because JSX *looks* like
invocation:

```tsx
const document = (
  <TrackFrame id="cart">
    <RopeChain anchor={[-5.4, 1]} />
  </TrackFrame>
);
```

Evaluating that calls **neither** `TrackFrame` **nor** `RopeChain`. It builds two
plain objects:

```js
{ type: TrackFrame, props: { id: 'cart', children: { type: RopeChain, props: { anchor: [-5.4, 1] } } } }
```

`type` is the component function itself — identity, so it can be looked up in a
registry. `props` is exactly what was written. Children are in `props.children`.
Nothing has run, nothing has mounted, and no DOM was involved.

**So the round-trip is already there.** A scene module exporting
`export function SomeScene() { return <TrackFrame …>…</TrackFrame>; }` can be
imported by the editor, and calling it once yields a tree the editor can walk,
display, mutate and print. The compiler and the ordinary `import` do all the
work; there is no parser to write and no AST library to depend on.

This page is about one such tree. A real document holds
[several of them — one per component definition](./03-focus.md), and that is
what the editor actually edits; everything below applies within any one of them.

That is what makes the whole project tractable, and it is worth being explicit
that this is a property of React rather than something being built here.

## The obstacle: the current binding cannot use it

`physm-js` today does not read the element tree. It **mounts** the description
and collects scene nodes from `useEffect` — components register themselves as
they mount, and `<Scene>` assembles from the registrations.

That has three consequences, and each is already an open issue:

|               | Consequence                                                                         | Issue              |
| ------------- | ----------------------------------------------------------------------------------- | ------------------ |
| Sibling order | Registration order, not JSX order, and they differ the moment a sibling mounts late | [0005](../0005.md) |
| Assembly      | Needs a DOM renderer, an `<svg>` ancestor, two renders and a callback               | [0006](../0006.md) |
| Naming        | A generated frame is reachable only through a `ref` handed out at mount             | [0011](../0011.md) |

**Reading the element tree directly closes all three.** Order is JSX order,
because the tree *is* the JSX. Assembly is a tree walk, so it runs in Node, in a
worker, in a test. And a name can be a prop rather than a ref, because there is
no mount to hand a ref out at.

That is the strongest structural argument in this RFC: the editor's prerequisite
is not editor-specific work. It is three fixes the tracker already wanted, and
the editor is what makes them worth doing together.

## Authored versus expanded

There are two trees, and conflating them is where the design gets confusing.

**The authored tree** is what the document literally contains — the elements the
author wrote. For the demo:

```
CartAndRope
```

One node. That is the whole document, if the document is `<CartAndRope />`.

**The expanded tree** is what you get by evaluating components until only core
nodes remain:

```
TrackFrame#cart
├─ Box, Line, Line, Circle, Circle          (the cart and its poles)
├─ RotationalFrame  ← RopeSegment 0
│  └─ RotationalFrame  ← RopeSegment 1
│     └─ … 3 more …
│        └─ RotationalFrame  ← Pendulum
└─ RotationalFrame  ← RopeSegment 0 (mirrored)
   └─ … 4 more …
Coincidence
```

**Only the authored tree is editable *here*.** This is the ownership rule, and it
is not a limitation so much as an observation: there is nowhere to *write* an
edit to an expanded node. `RopeSegment 3`'s angle is `TURN`, computed inside
`RopeChain` from props. Changing it would mean editing `RopeChain`'s body, and a
body is not something a document can reach into.

⚠️ **What it is not is a permanent verdict on `RopeChain`.** If the editor
*defined* `RopeChain`, its body is document data too — a second tree, edited in
its own right. [Page 3](./03-focus.md#two-ownership-classes-and-only-one-of-them-is-new)
draws that line properly; within a single definition, the rule above holds
exactly as stated.

So:

- **Authored nodes** — editable, draggable, deletable, emitted by codegen.
- **Expanded nodes** — visible, selectable *for inspection*, and read-only.

The tree view distinguishes them visually. Everything on
[page 4](./04-tree.md) is an application of this one rule.

## What "expanded" costs

Expansion means calling component functions, which means components must be
**pure functions of their props**: no hooks, no module-level mutable state, no
`Math.random`, no `Date.now`. Given the same props, the same tree.

This is not an onerous rule — every component in `CartAndRope.tsx` already
satisfies it — but it is a rule, and a component that breaks it produces an
editor view that disagrees with what the simulation does. Worth enforcing
loudly rather than documenting quietly: a development-mode expansion that runs
twice and compares would catch the whole class.

## Where the two trees meet

The confusing case is real and appears in the demo. `RopeChain` passes its
`children` down the recursion to the **tip**:

```tsx
<RopeChain anchor={POLE_TIPS[0]}>
  <Pendulum />
</RopeChain>
```

`<Pendulum />` is **authored** — the author wrote it, the editor owns it, codegen
emits it — but in the expanded tree it lands five levels down, inside
`RopeChain`'s read-only internals.

Two ways to present that, and the choice matters:

1. **Faithful nesting.** Show `Pendulum` where it actually ends up, deep inside
   the expansion. Accurate, and it buries an editable node under five read-only
   ones.
2. **Slots.** Show authored children as **direct children of the authored node**,
   and put the expansion behind its own disclosure.

**Take slots.** The editing model is about the authored tree, and the common
operation — "put something on the end of this rope" — should not require
expanding five levels of machinery to reach the place where it goes. The
faithful view remains available under the expansion disclosure, where it is
answering the question it is good at: *where did this actually end up?*

---
<sub>[← Prev: 1 · Overview](./01-overview.md) · [↑ Index](../0014.md) · [Next: 3 · Components and focus →](./03-focus.md)</sub>
