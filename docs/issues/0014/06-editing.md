# 6 · Scene view and properties

<sub>[← Prev: 5 · Code generation](./05-codegen.md) · [↑ Index](../0014.md) · [Next: 7 · Play →](./07-play.md)</sub>

## The empty-frame problem

Clicking things in the scene is the natural interaction and it has a real
obstacle: **a frame need not draw anything.** `RopeSegment` draws a line and a
circle, but a frame that only positions its children has no pixels, and there is
nothing to hit-test.

The fix is not clever, it is just a decision: **in editor mode, every frame draws
an origin gizmo** — a small cross or dot at its own origin, plus a faint line to
its parent's. Gizmos are not part of the scene, are not emitted, and vanish on
export. They give every node a hit target and, incidentally, make the frame tree
legible in a way the rendered rig is not.

With that, picking is ordinary:

- **Decals** hit-test against their own geometry, which is already boxes, circles
  and line segments. No new maths.
- **Frames** hit-test against their gizmo.
- **Overlapping hits** resolve to the topmost, with repeated clicks cycling
  deeper — the standard behaviour, and the one that makes a stack of coincident
  frames workable.

A click selects the **nearest authored ancestor** of whatever was hit, because
that is the node the user can act on. Clicking a rope segment selects
`RopeChain`; a modifier key selects the expanded node itself for inspection.
This is the same walk [page 3](./03-tree.md#selection) describes from the tree
side, and it is what keeps picking useful on a rig built mostly from composites.

**The tree remains the failsafe.** Everything selectable in the scene is
selectable in the tree, so picking can ship late, or ship imperfect, without
blocking anything.

## Dragging in the scene

The direct-manipulation version of the properties pane, and it earns its place
because position is the one prop that is genuinely spatial — typing `[8, 0]` into
a field to place a ball is a bad substitute for putting it where it goes.

The mechanics fall out of the model: dragging a node's gizmo writes its
`position` prop, in the **parent's** coordinate frame, which is what the prop
means. Snapping — to the grid, to another frame's origin, to a decal endpoint —
matters more here than it does in a drawing tool, because a rig whose frames are
*nearly* coincident is exactly [0002](../0002.md)'s pinned-scene failure waiting
to happen.

**Only authored nodes drag**, for the same reason only they are editable: there
is nowhere to write the result otherwise. Dragging a rope segment should either
do nothing or move the whole `RopeChain`, and doing nothing with a clear cursor
is the honest option.

## The properties pane

Reads the metadata for the selected node's component and renders one widget per
declared prop, in declaration order, grouped by whatever the metadata says.

Four behaviours that are easy to get wrong and cheap to get right:

- **Defaults show as placeholders, not values.** A field showing a greyed `false`
  that becomes a real `false` on first focus is how `mirror={false}` ends up in
  the emitted source for no reason.
- **Edits commit on blur or Enter, and coalesce for undo.** Typing `1`, `.`, `4`
  in a field is one edit, not three.
- **Invalid input is refused, not clamped.** A `segmentCount` of `0` should show
  as an error and leave the document alone. Silently clamping to `1` means the
  document says something the user did not.
- **Units are the metadata's business.** Angles display in degrees and store in
  radians, because nobody wants to type `-1.5708`, and both facts belong in the
  prop declaration rather than in the widget.

For an **expanded** node the pane is read-only, and carries the
"select what produced this" action — which is the bridge from _I can see the
problem_ to *here is the knob*, and the single most valuable thing the pane can
offer on a composite-heavy rig.

## The component library

The bottom strip lists every component with metadata, grouped by category.
Adding one means picking the insertion point, and the rule that makes this
predictable is the one already in the tree: **the metadata's slot kind decides
where a component may go.**

So the library greys out what cannot be inserted at the current selection, rather
than allowing it and producing a scene that fails to build. Dropping a `<Weight>`
with a `<Line>` selected should be visibly impossible, not a runtime error two
steps later.

Insertion goes **inside the selection** if it accepts children, otherwise
**after** it as a sibling — the behaviour every tree editor has, and worth
matching rather than inventing.

---

<sub>[← Prev: 5 · Code generation](./05-codegen.md) · [↑ Index](../0014.md) · [Next: 7 · Play →](./07-play.md)</sub>
