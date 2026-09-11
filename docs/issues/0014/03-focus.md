# 3 · Components and focus

<sub>[← Prev: 2 · The document is an element tree](./02-document.md) · [↑ Index](../0014.md) · [Next: 4 · The tree view →](./04-tree.md)</sub>

## A scene is a file, not a tree

[Page 2](./02-document.md) said the document is an element tree. That is true one
level down; the document proper is a **module** — a set of named component
definitions, one of them designated the scene root:

```tsx
function Pendulum() { return <RotationalFrame …>…</RotationalFrame>; }
function RopeChain() { return <RotationalFrame …>…</RotationalFrame>; }

export function SomeScene() {
  return (
    <TrackFrame id="cart">
      <RopeChain />
      <RopeChain />
    </TrackFrame>
  );
}
```

Each definition's body is an element tree. The module is what codegen emits, and
it is emitted whole — one file, definitions in dependency order, scene root last.

## Extract to component

The operation that makes the module worth having. Select a node in the tree,
**Extract to component**, and:

1. its subtree moves out of the enclosing definition into a new one;
2. an instance replaces it in place;
3. the new definition appears in the code pane, above its user;
4. it joins the component library, so it can be instantiated again;
5. the editor focuses it, in its own tab.

Zoom back out and the subtree is now `<Pendulum />`. Change the definition and
**every instance changes**, which is the whole point and also the thing to warn
about before the first edit: the second instance you created is not a copy.

**Extraction is closed**, which is why it can be a pure document operation. The
subtree contains literals and instances, never a reference to an enclosing
scope — there is no enclosing scope in a document — so nothing has to be
captured, threaded through as a prop, or left dangling.

**It is recursive.** Inside a subcomponent you can extract again; the new
definition is a sibling in the same file, not a nested one. Depth in the file is
flat no matter how deep the composition goes.

## Two ownership classes, and only one of them is new

[Page 2](./02-document.md#authored-versus-expanded) drew the boundary between
what the author wrote and what a component produced. Extraction moves that line,
because a definition the editor created *is* a component body the editor owns:

| | Body | Editable how |
| --- | --- | --- |
| **Editor-owned** — defined in the generated module | held as document data | **focus it** and edit its tree |
| **Imported** — `physm`'s core vocabulary, prefab libraries, hand-written modules | an opaque function | props only |

**The editor can never own an imported body, and the reason is worth stating
because it looks like a limitation that could be lifted.** A component is a
function. Calling it yields the tree it produced *for those props* — not its
body, not its conditionals, not its recursion. There is no evaluation that
returns the source, and reading the source means parsing, which
[page 1](./01-overview.md#one-way-on-purpose) rules out.

So the split is not "core versus composite" and never was. It is **did this
module define it, or did it import it** — and extraction is how something crosses
from the second column to the first.

That is what settles the altitude question [page 11](./11-risks.md) raises. A
scene the editor generated is editable all the way down, because every composite
in it is one the editor defined. `CartAndRope.tsx` as written by hand is not,
because its components are imported functions — but the same rig laid out in the
editor would be.

## Expansion is for looking; focus is for editing

Two gestures, two questions, and keeping them apart is what makes the tree view
tractable:

- **Expand** (`▸` in the tree) — *what did this produce, here?* Read-only, in
  place, and available on anything, imported or not.
- **Focus** (double-click) — *let me change what this is.* Opens the definition
  in a tab, rooted at that component. Available only on editor-owned components,
  because only they have a body to open.

Expansion alone would force every composite to be a black box, and would make
"which altitude is this editor for" a question with no good answer. Both gestures
existing is what lets the editor serve
[the high-level tree and the fully materialized one at once](./01-overview.md):
you look at whichever level you want, and you edit at the level that owns the
thing you want to change.

## Focus is tabs, not a stack

A stack is the obvious model — zoom in, push; zoom out, pop — and it is wrong,
for a reason that shows up as soon as the component library exists. **You can
open a component that is not below you.** Double-clicking `Pendulum` in the
library, while focused on `RopeChain`, is not a zoom; there is nothing to pop
back to.

**Tabs**, then, along the top bar: `SomeScene` · `RopeChain` · `Pendulum`. Each
tab is a focus. Opening one from the tree happens to be a zoom; opening one from
the library is not, and the model does not have to care which.

Two things a stack would have given, and what replaces them:

- **"Go up one level"** — replaced by switching tabs. There is no canonical
  parent anyway: a component instantiated in three places has three of them,
  which is the same fact that sinks the stack.
- **A breadcrumb** — replaced by the tab bar itself, which shows what is open
  rather than pretending to show where you are.

## What is global and what belongs to a tab

The distinction is sharper than it looks and it decides the layout:

| Global — the whole module | Per-tab — one focused component |
| --- | --- |
| Code pane | Tree view |
| Tab bar | Scene view |
| Component library | Property editor |

The **code pane transcends focus**: it always shows the complete module,
zoomed in or out, because the file is one file. What focus changes is the
**highlight** — the focused component's definition is marked, and a focus change
scrolls to it once.

*Once*, and then never again: the pane must not re-scroll while you read. A
viewer that keeps yanking you back to the "current" thing is worse than one that
never scrolls at all.

Same for the **library**: global, because a component is available to instantiate
wherever you are, and a component extracted inside a subcomponent is
instantiable from the scene root too.

## Three operations that need rules

Editor-owned components are referenced by name from other definitions, which is
the referential integrity problem of
[page 5](./05-metadata.md#references-have-to-become-names) arriving at module
scope. Three cases, and the third is the one with teeth:

- **Rename** — update every instantiation site. Mechanical, because the document
  holds instances by identity rather than by name.
- **Delete a component with instances** — refuse, and say how many there are.
  Offering "inline it back into its callers" is the nicer answer and can come
  later.
- **Cycles** — **refuse them.** Instantiating a component inside itself, directly
  or through a chain, is unbounded: nothing decrements, nothing terminates.
  Hand-written `RopeChain` recurses safely because its `index` prop terminates
  it, and that is exactly the kind of body the editor cannot write. The library
  must grey out any component that is an ancestor of the focused one — refused
  at the gesture, not diagnosed after the fact.

## What an extracted component takes for props

At extraction, **nothing**: it is a zero-prop prefab, and all its instances are
identical. That is the honest MVP, and it is also useless for the second
instance, which usually wants to differ.

So the operation that matters almost immediately is **promote to prop**: select a
value in the property editor of a focused component, promote it, and it becomes a
declared prop with the current value as its default. Instances gain a field;
existing ones keep the old value because it is the default.

This is where an editor-created component acquires the metadata
[page 5](./05-metadata.md) describes for library ones — generated rather than
hand-written, from decisions the user made by promoting things.

---
<sub>[← Prev: 2 · The document is an element tree](./02-document.md) · [↑ Index](../0014.md) · [Next: 4 · The tree view →](./04-tree.md)</sub>
