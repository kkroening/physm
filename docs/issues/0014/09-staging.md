# 9 · Staging

<sub>[← Prev: 8 · The constraint-first horizon](./08-horizon.md) · [↑ Index](../0014.md) · [Next: 10 · Risks →](./10-risks.md)</sub>

## The prerequisites are already filed

Before any editor pane exists, the binding has to hand over an element tree
rather than a mount. Three open issues, none of which was raised with an editor
in mind:

| Issue                                            | What it gives the editor                                                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| [0006](../0006.md) — assemble without a renderer | The document model itself, and a `Scene` the editor can build while showing the document in its own React tree         |
| [0005](../0005.md) — siblings in tree order      | Correct paint order and correct `sortedFrames`; an editor that cannot express "move this before that" is not an editor |
| [0011](../0011.md) — name a frame from outside   | Named references in place of `ref` handles, without which constraints cannot be authored or emitted                    |

**Doing these three is most of the risk of the whole project**, and they are
worth doing whether or not the editor follows: 0006 is the one that restores the
"no renderer needed" property the JSX binding cost, and 0005 is a live
correctness bug.

## An order that produces something usable early

Each step should leave something you would actually run.

**1 · Read the tree instead of mounting it.** `buildScene(element)` — walk the
element tree, evaluate composites, produce a `Scene`. Closes 0006 and 0005. Test
it against `CartAndRope` and require an identical `Scene` to the mounted route,
which is a strong differential oracle available for free.

**2 · Metadata, on the core vocabulary only.** `defineComponent` with the prop
types from [page 4](./04-metadata.md), applied to `TrackFrame`,
`RotationalFrame`, `Weight`, `Line`, `Circle`, `Box`, `Anchor`. Nine components,
no composites. Nothing visible yet, and the types must be derived from the schema
from the first day — retrofitting that later means touching every declaration.

**3 · Codegen, headless.** `emit(document) → string`, plus a test that emits a
document, compiles it, evaluates it, and compares the resulting `Scene` to the
original. **That test is the spine of the project**: it is the round-trip
property stated as an assertion, and it can exist before any UI does.

**4 · Tree view and properties, read-only.** Load `<CartAndRope />`, show the
authored tree with expansion, show props. No editing. This is the first step that
looks like the thing, and it will teach more about the expansion presentation
than any amount of further design.

**5 · Editing.** Property edits, then insert-from-library, then delete, then
drag-reorder. Undo from the start — retrofitting undo onto a mutable document is
the classic rewrite, and a document that is replaced rather than mutated makes it
nearly free.

**6 · Scene view: gizmos, then picking, then dragging.** In that order. Gizmos
alone make the tree comprehensible; picking without gizmos does not work at all
([page 6](./06-editing.md#the-empty-frame-problem)).

**7 · Play.** Reuse the demo's loop. State-carrying across edits comes after it
runs at all.

**8 · Code pane.** Last, because it is the pane you can most easily do without —
"Export" writing a file is 90% of its value, and the highlighting needs source
ranges the emitter should already be recording from step 3.

## What the MVP is

Steps 1–5, plus gizmos from step 6. Concretely: **load a scene, see its tree,
select a node, change its props, add and delete and reorder nodes, and export
TSX that rebuilds to the same scene.**

No picking, no dragging, no play, no code pane. That is a tool someone would
use — laying a rig out through the tree and the properties pane is slower than
direct manipulation but entirely workable, and it is the version whose every
piece is required by the versions after it.

## Deliberately deferred

- **Round-tripping hand-edited source.** Never, by
  [page 1](./01-overview.md#one-way-on-purpose).
- **Editing inside a composite's expansion.** Never — there is nowhere to write
  it ([page 2](./02-document.md#authored-versus-expanded)).
- **Multi-select, copy/paste, prefabs.** After the single-selection model is
  proven.
- **Anything from [page 8](./08-horizon.md).**

## What would make me stop

Worth writing down in advance, while it is cheap to be honest:

- **If step 1 turns out not to reproduce the mounted `Scene`**, the element-tree
  premise is wrong and everything above it is unsupported. That test is first for
  exactly this reason.
- **If step 3's round-trip test cannot be made to pass** on the demo rig, the
  emitted source is not equivalent to the document, and the editor's one promise
  is broken.

Both are checkable within the first two steps, before any UI exists. That is the
best property this plan has.

---

<sub>[← Prev: 8 · The constraint-first horizon](./08-horizon.md) · [↑ Index](../0014.md) · [Next: 10 · Risks →](./10-risks.md)</sub>
