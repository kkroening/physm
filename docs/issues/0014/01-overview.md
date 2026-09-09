# 1 · Overview

<sub>[↑ Index](../0014.md) · [Next: 2 · The document is an element tree →](./02-document.md)</sub>

## The shape

```
┌───────────────────────────────────────────────────────────────────────┐
│  SomeScene · RopeChain · ▸Pendulum                                    │
├──────────────┬──────────────────┬─────────────────────┬───────────────┤
│              │                  │                     │               │
│  code (ro)   │       tree       │        scene        │   properties  │
│              │                  │                     │               │
│              ├──────────────────┴─────────────────────┤               │
│              │  library: Weight · Line · RopeChain …  │               │
└──────────────┴────────────────────────────────────────┴───────────────┘
```

**The split is not four panes; it is two scopes.** The tab bar, the code pane and
the component library are **global** — they show the whole module, whatever you
are looking at. The tree, the scene and the properties pane form the
**component editor**, and they move together to whichever component the active
tab focuses.

[Page 3](./03-focus.md) is about that second axis, which is the one that does not
follow from anything else in this design.

Selection is shared within a tab: a node picked in the tree is the node the
properties pane edits, the node the scene pane outlines, and the node the code
pane highlights.

## One way, on purpose

**The editor writes `.tsx`. Nothing reads it back.** You build a rig, copy the
generated source into the repo, and rebuild; from then on the source is the
source and the editor's copy is a past state.

That asymmetry is the single decision that keeps this project finite. Round-trip
editing — parse the user's source, apply an edit, print it back preserving
comments, formatting and hand-written structure — is a different and much larger
project, and it is the one that eats tools like this. Emitting is a tree walk.
Parsing is a compiler.

**What it costs is real and worth naming: a hand-edited scene file cannot be
loaded back into the editor.** Once you edit the emitted source, the editor no
longer knows about your edit, and re-emitting will overwrite it. The workflow is
"lay it out here, refine it in the repo", not "round-trip freely".

**What buys most of it back** is that a scene module can be *imported* — see
[page 2](./02-document.md). Not parsed: imported, compiled by the ordinary
toolchain, and read as data. So a scene that stays within the rules the editor
emits can come back in, and one that has grown a loop or a computed prop cannot.
That is a narrower loss than "no round trip at all", and it is a loss that
degrades gracefully rather than failing.

## What this is not

- **Not a general React editor.** It edits *scene* components — a closed
  vocabulary of frames, decals, weights and constraints, plus composites built
  from them. A component that renders a `<div>` is out of scope.
- **Not a physics authoring tool for constraints-first modelling.** That
  direction is real and [page 9](./09-horizon.md) takes it seriously, but the
  editor being built is hierarchical.
- **Not a replacement for writing scenes by hand.** The demo rig is 280 lines of
  deliberate, commented TSX with named constants and a recursive chain. No
  editor is going to produce that, and it should not try. The editor is for
  laying out a rig quickly and for the parts that are genuinely spatial.

## Both levels, not a choice between them

An editor that only showed `<CartAndRope />` — one node, one prop — would have
nothing to click. One that only showed the materialized frame tree would make
every rig a flat pile of sixty frames.

**It should be neither, and the mechanism is on [page 3](./03-focus.md):** you
expand as far down as you want to *look*, and you focus a component to *edit* it.
Those are separate gestures answering separate questions, and having both is what
lets one editor serve a rig described in two composites and a rig assembled from
primitives.

## The principles the rest of this hangs on

1. **The document is a React element tree**, read as data rather than rendered.
   Everything in [page 2](./02-document.md) follows from this.
2. **The editor owns what the author wrote; components own what they produce.**
   Authored nodes are editable, produced nodes are inspectable. One rule, and it
   resolves the recursion question, the expansion question and most of the
   selection question at once.
3. **Metadata is declared, not discovered.** Not a compromise —
   [page 5](./05-metadata.md).
4. **The generated source is what a person would have written.** Not a
   serialization format that happens to be valid TSX.
5. **Looking and editing are different gestures.** Expansion shows what a
   component produced; focus opens what it *is*. Conflating them is what forces
   an editor to pick a single altitude.

---
<sub>[↑ Index](../0014.md) · [Next: 2 · The document is an element tree →](./02-document.md)</sub>
