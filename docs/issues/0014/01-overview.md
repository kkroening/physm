# 1 · Overview

<sub>[↑ Index](../0014.md) · [Next: 2 · The document is an element tree →](./02-document.md)</sub>

## The shape

Five regions. Left to right along the middle: **hierarchy**, **code**, **scene**,
**properties**; the **component library** runs along the bottom.

```
┌──────────┬──────────────┬─────────────────────┬──────────────┐
│          │              │                     │              │
│   tree   │  code (ro)   │        scene        │  properties  │
│          │              │                     │              │
├──────────┴──────────────┴─────────────────────┴──────────────┤
│  library:  Weight · Line · Circle · Box · Anchor · Pendulum   │
└──────────────────────────────────────────────────────────────┘
```

Four of the five are views onto one thing — the **document** — and the fifth is a
palette of what can be added to it. Selection is shared: a node picked in the
tree is the node the properties pane edits, the node the code pane highlights,
and the node the scene pane outlines.

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
  direction is real and [page 8](./08-horizon.md) takes it seriously, but the
  editor being built is hierarchical.
- **Not a replacement for writing scenes by hand.** The demo rig is 280 lines of
  deliberate, commented TSX with named constants and a recursive chain. No
  editor is going to produce that, and it should not try. The editor is for
  laying out a rig quickly and for the parts that are genuinely spatial.

## The principles the rest of this hangs on

1. **The document is a React element tree**, read as data rather than rendered.
   Everything in [page 2](./02-document.md) follows from this.
2. **The editor owns what the author wrote; components own what they produce.**
   Authored nodes are editable, produced nodes are inspectable. One rule, and it
   resolves the recursion question, the expansion question and most of the
   selection question at once.
3. **Metadata is declared, not discovered.** Not a compromise —
   [page 4](./04-metadata.md).
4. **The generated source is what a person would have written.** Not a
   serialization format that happens to be valid TSX.

---

<sub>[↑ Index](../0014.md) · [Next: 2 · The document is an element tree →](./02-document.md)</sub>
