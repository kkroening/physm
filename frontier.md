# Frontier

The working plan for the scene editor ([0014](docs/issues/0014.md)): what is in
view now, what comes next, and what is further out. Revised freely as the work
teaches things — see [`CLAUDE.md`](CLAUDE.md#the-frontier) for how it is used.

## In view

**The selection in the code.** Codegen records where each node's source sits
in the module, so the code pane can highlight the selected node's lines, and
scroll them into view once -- on a new selection or a change of tab -- rather
than on every keystroke of an edit, which would pull the view away from what
is being read.

## Next — the MVP

Roughly one PR each.

1. ~~**De-ref the demo**~~ — done
2. ~~**Tree-walk builder**~~ — done
3. ~~**Core metadata**~~ — done
4. ~~**Document model**~~ — done
5. ~~**Codegen**~~ — done
6. ~~**Editor shell**~~ — done
7. ~~**Selection and prop editing**~~ — done
8. ~~**Insert, delete, reorder**~~ — done
9. ~~**Extract to component, and tabs**~~ — done
10. ~~**Play**~~ — done
11. ~~**Gizmos**~~ — done
12. ~~**Undo**~~ — done

[0014 page 10](docs/issues/0014/10-staging.md#what-the-mvp-is) draws the MVP
at its steps 1-6 plus gizmos, and one piece of those steps is left: promote to
prop, from step 6, which waits on Karl's call below. Everything else is done:
load a scene, see its tree, edit props, add, delete and reorder nodes, extract
a component and reuse it -- one that names no id, for now -- export TSX that
rebuilds to the same scene, see every frame in the scene pane, and undo any of
it. Play came forward because the shell made it cheap, and picking because it
was built while gizmos were in review.

## Further out

- Find a node by its id or its props. Type-ahead spells a row's tag, as the
  ARIA tree pattern asks, so in a rig of many `TrackFrame`s the id one would
  look for is out of its reach: a search of its own.
- Draw a pose that does not build. Retyping a position under a stated length
  fails at nearly every keystroke, so the kept scene shows the pose from
  before the edit, not what the edit is doing. Drawing the failing pose, with
  the violation marked rather than refused, would lean on
  `allowInitialViolation` -- Karl's call.
- Watch the running scene from a component's tab. Page 8 wants a `Pendulum`
  tab to show that pendulum's frames moving as part of the rig; which instance
  a tab shows, when the scene has several, is open. Until then Play runs from
  the scene's own tab, and a component's tab draws it as authored -- so undoing
  an edit made in a component's tab, which returns there, pauses the run.
  Whether undo should stay on the scene's tab while it runs is Karl's call.
- One walk from state to pose. `FrameView`, the gizmos and
  `Scene.getPosMatrixMap` each compose a frame's pose from the state map, and
  agree because tests hold them to it. Reading the core's map everywhere,
  composed with the view, would make the agreement structural.
- While a drag is under way, show the parent's axes at the grabbed node. A
  drag writes `position` along them, but the grabbed gizmo shows the node's
  own +x, which for a rotational node is turned by its angle.
- Snapping to a grid. The pane draws no grid yet, so there is nothing to see a
  snap against: draw one first, then let a drag snap to it.
- Snapping to a box's corners and centre, and to the world's origin. Neither
  is a target yet, though the origin is where a top-level frame most often
  goes back to. Karl's call.
- What a drag does while the scene plays. The frame drifts from the pointer,
  since its own coordinate and its parents' keep moving: pause while a drag is
  held, refuse one during play, or keep the live nudge. Karl's call.
- Take an imported component's tag from the module lookup
  [0014 page 6](docs/issues/0014/06-codegen.md) describes, not from
  `Function.name`, which a production build minifies. Dev builds and the tests
  keep real names, so nothing shows it yet.
- Types first or schema first, for components the editor declares? The core
  nine are types-first, forced by their core option classes, while
  [0014 page 5](docs/issues/0014/05-metadata.md) argues schema-first. Declared
  components take no props until promote-to-prop, so it stays open -- Karl's
  call.
- Promote to prop, or scope ids per instance: either makes a component that
  names an id reusable. Which comes first is Karl's call. A promoted prop that
  sets a count -- page 8's `segmentCount` -- changes the structure but arrives
  as a prop edit, which carries the run over; whether it resets instead, and
  how the editor tells, is part of the same call.
- A modifier on a click in the scene, to select the expanded node itself
  rather than its nearest authored ancestor -- page 7's way to inspect one. It
  waits on the properties pane showing an expanded node, read-only.
- Codegen polish: round numbers (`-Math.PI / 2`), constants for repeated values
- The constraint-first direction ([0014 page 9](docs/issues/0014/09-horizon.md))

## Decisions

- **A structural edit resets simulation state; a prop edit carries it over.**
  Recorded in [0014 page 8](docs/issues/0014/08-play.md#editing-while-it-runs).
  *(Karl, 2026-09-11)*

## Done

- **De-ref the demo** — `<Anchor id>` names a point, a constraint end names it
  by that id, and `CartAndRope` calls no hooks. A test walks every composite in
  the rig outside a render.
- **Tree-walk builder** — `buildScene(element)` builds a `Scene` from JSX with
  no renderer: composites are called, each core component states how it builds
  as data the mounted binding shares, and siblings take JSX order. The assembly
  around those builds is one function both routes call, differing only in
  whether an unbuildable constraint waits or throws. Checked against a
  hand-built scene on every prop of every component, and against the mounted
  route on the demo rig and after every prop changes. Resolves
  [0006](docs/issues/0006.md).
- **Core metadata** — each of the nine building blocks carries a static `meta`:
  its tag, category, slot, description, and a spec per prop: kind, label, and
  a default, or `required` -- with an `initial` to insert, except a
  constraint's ends, which a person picks. A spec is typed by its prop, a
  missing one is a compile error, `coreComponents` lists the nine, and
  `canContain` says where each may go. Every default is checked by building
  with the prop omitted and with it stated.
- **Unique frame ids** — the core `Scene` refuses a frame the tree reaches
  twice, and two frames sharing an id, rather than posing one under the wrong
  parent or letting the toposort drop the other's coordinate.
- **Document model** — a scene held as data: named definitions, one of them the
  scene, each a body of nodes. A component reference says who owns a body
  (core, imported, defined), edits are pure functions returning a new
  document, and nodes are addressed by index path. A document reads from JSX
  without calling anything, and renders back to an element `buildScene`
  builds.
- **Codegen** — a document written out as one TSX module: definitions in
  dependency order with the scene as the default export, props at their
  defaults omitted, a cycle or a prop that is not plain data refused, and each
  node's place in the source recorded. Held to the document by compiling the
  output and rebuilding it.
- **Editor shell** — one document shown five ways at `#editor`, read-only: the
  tab bar, code pane and library global, and the tree, scene and properties
  following the focused tab. A rig that fails to build, or has no consistent
  starting state, says why in the scene pane rather than taking the editor
  down.
- **Selection and prop editing** — a tree row selects its node, and the
  properties pane edits its props with a widget chosen by each prop's
  metadata: a length refuses a negative, an angle and a rotational frame's
  state are shown in degrees, and emptying a field returns a prop to its
  default unless it is required. Every accepted keystroke is a new document.
- **Insert, delete, reorder** — the library adds where the selection says, and
  shows what cannot go there disabled with the reason; the tree's toolbar and
  keys delete and reorder; a new node starts with its required props at their
  initial values; and a building block missing a required prop fails to build
  by name.
- **Extract to component, and tabs** — the MVP's last step: the selected
  subtree moves into a new definition and opens in its own tab, a name is
  checked as it is typed, a defined instance opens by double-click or from the
  properties pane, and a component is refused where the scene already uses its
  ids.
- **Children only under frames** -- a building block that is not a frame
  refuses children in both routes, through one helper, rather than dropping
  them.
- **Play** — Play, Pause and Reset run the scene on `JsSolver`, from its own
  tab. A prop edit carries each frame's state over and a structural edit
  restarts it; an edit that does not build, or a visit to a component's tab,
  pauses the run and keeps it. A run that diverges stops and says so, and a
  stalled or hidden tab does not come back to a burst of catch-up steps.
- **Gizmos** — in the scene pane every frame draws a small cross at its origin,
  turned with its axes and the same size at any zoom, and a faint line back to
  its parent's origin, the world's at the top. The editor draws them over the
  scene from the same pose, so a frame that draws nothing can still be seen,
  and none reaches the scene or the code written from it.
- **Picking** — a click in the scene selects the node in the focused body
  nearest to what it hit: decals on their own geometry, frames on their gizmo,
  topmost first, and the same place again goes one deeper. A frame inside an
  instance selects the instance. The build reports the elements behind each
  frame and decal, and the document says which node made each element, which
  is how a click leads back.
- **Undo** — every edit is recorded in a history of documents, which Undo and
  Redo walk, from the tab bar or from the keyboard outside a text field. One
  visit's keystrokes in a field are one step, and a click is one. Undoing
  returns to the tab the edit was made in, closes a tab whose component is
  gone, and puts back the selection from before the edit; redoing puts back the
  one it made. Only a structural step restarts the run.
- **+x on every gizmo** — a gizmo's +x arm runs on as far again, so which way
  a frame's x axis points can be read off the picture, where a plain cross
  looks the same after a quarter turn. These are the axes the frame's children
  are read along -- and a drag writes along a parent's -- so this came first.
  The pointer is clicked like the cross.
- **Dragging** — a frame's gizmo drags, writing its `position` along its
  parent's axes to the nearest hundredth, as one step to undo. A drag starts
  once the pointer leaves the press, with the primary button, and the node is
  selected then; the click that ends it picks nothing. A press takes the
  selected node if its gizmo is under the pointer, and otherwise the topmost
  gizmo -- which blocks the press, with a not-allowed pointer, when a
  component's instance built its frame.
- **The tree as a tree** — the focus is on each row's tree item, named for
  what the row shows, so a screen reader says which node it is on. Tab reaches
  one row: the focused one while the focus is in the tree, and the selection
  or the first row coming back in. The arrows move through the rest: Up and
  Down, Home and End, Right into a node's children and Left back out.
- **Snapping to points** — a dragged frame's origin snaps, exactly, to another
  frame's origin, a line's end or a circle's centre within eight pixels, with
  a ring on what it snaps to; Alt places it freely. Nothing that moves with
  the dragged frame is a target, and it snaps only in the pose the code
  builds: in a run's pose a drag is free.
- **The last scene that built, under a build error** — while an edit passes
  through a state that does not build, the scene pane keeps the last scene
  that built drawn, dimmed, under the error, so it does not go blank on what
  the edit is doing to the rig. It stays until a scene builds, in its tab or
  another, or its component goes.
- **Type-ahead in the tree** — a typed letter moves the focus to the next row
  whose name starts with it, whatever the case; letters in quick succession
  spell a longer name, and the same letter again steps through the rows that
  start with it. From the tree itself, as after a delete, a search starts at
  the row Tab would reach.
