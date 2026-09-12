# Frontier

The working plan for the scene editor ([0014](docs/issues/0014.md)): what is in
view now, what comes next, and what is further out. Revised freely as the work
teaches things — see [`CLAUDE.md`](CLAUDE.md#the-frontier) for how it is used.

## In view

**An imported component's tag, from its module rather than its function.** The
document records an imported composite by `Function.name`, and the emitter
writes both its tag and its import path from that -- so a production build,
which minifies those names, would emit a file naming the wrong component and
importing from the wrong path.
[0014 page 6](docs/issues/0014/06-codegen.md) says the document holds function
identities "so the emitter knows exactly which module each component came
from", but a function carries no module path at runtime: something has to
supply that map. A registry the host passes to the editor, or a build-time
convention -- which of the two is the question to settle before building it.

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
- Snapping to a box's corners and centre, and to the world's origin as a
  point. Neither is a target yet -- Karl's call -- though a frame at the top
  whose origin sits at its position reaches the origin as a crossing of the
  grid: any rotational frame, and a track frame at a coordinate of zero.
- What a drag does while the scene plays. The frame drifts from the pointer,
  since its own coordinate and its parents' keep moving: pause while a drag is
  held, refuse one during play, or keep the live nudge. Karl's call.
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
- The focused component's definition marked in the code on a change of tab,
  as [0014 page 3](docs/issues/0014/03-focus.md#what-is-global-and-what-belongs-to-a-tab)
  has it. A tab change clears the selection, so after one nothing is marked
  and the pane stays where it was. It needs codegen to record a range per
  definition; whether the selection's mark stands in for it is Karl's call.
- The constraint-first direction ([0014 page 9](docs/issues/0014/09-horizon.md))

## Decisions

- **A structural edit resets simulation state; a prop edit carries it over.**
  Recorded in [0014 page 8](docs/issues/0014/08-play.md#editing-while-it-runs).
  _(Karl, 2026-09-11)_

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
- **The selection in the code** — the code pane marks the selected node's
  source, a frame with all it holds, and scrolls to it once when the
  selection changes -- not on every edit, and nothing but the pane. A mark
  taller than the pane comes in by its first line.
- **π in the code** — a number that is exactly a multiple of π, as an angle
  often is, is written as one: `-Math.PI / 2`, not `-1.5707963267948966`.
  Anything else is written as before, so the code rebuilds the very numbers
  it was written from.
- **The parent's axes, while dragging** — while a drag is under way, the axes
  the frame's `position` is read along go through it, each named at its
  positive end: the world's for a frame at the top, and for one inside
  another its parent's, not its own.
- **A grid** — the scene pane draws a faint line at every whole unit of the
  world under the scene, and the world's own axes a shade darker, whether the
  scene builds or not. Like the gizmos, it never reaches the code.
- **Snapping to the grid** — a dragged frame's `position` snaps to whole
  units, each coordinate on its own within four pixels, on the grid of its
  parent's axes -- so the code keeps whole numbers under a moved or turned
  parent -- and that grid is drawn in the world's place while the drag lasts.
  A point in reach comes first, Alt places freely, and a run's pose has no
  grid to snap to.
- **Find a node** — a field over the tree selects the first node, from the
  selection on, whose tag, id or props hold what is typed, and says which of
  how many; Enter and Shift+Enter step through the rest. What it turns up is
  marked while it holds anything, Escape clears it and returns to the tree,
  and the tree scrolls to the selection when it changes.
- **Components that take children** — a component's body may hold one
  `Children` placeholder, added from the library in a component's tab and
  never the scene's. An instance of such a component then takes children in
  the tree and the library, held to the rules of the frame the placeholder is
  in, and they are built there: the code writes `function Pendulum({ children })`
  and `{children}` where it goes. The placeholder cannot be deleted while an
  instance holds children, nor extracted from its component.
- **Children where they hang** — `FixedFrame` joins the building blocks: a
  frame set at a position and an angle, with no coordinate of its own that
  moves it. With one at a component's bob and the `Children` placeholder in
  it, a nested pendulum hangs from the bob. The core frame, and how its
  coordinate is kept inert in both solvers, landed first.
- **Components take children by default** — an extracted component keeps a
  place for children: at the origin of its outermost frame; passed on, for an
  instance of a component that keeps one; or beside the node. The starter's
  pendulum keeps its place in a `FixedFrame` at its bob, so adding a pendulum
  to its instance makes a double pendulum.
- **Moving a node into another** — Alt+Shift+Right moves the selected node
  into the node above it, after its last child, and Alt+Shift+Left moves it
  out of its parent, just after it. Plain Alt with an arrow stays the
  browser's. The tree's toolbar has both, and says why when it cannot. Each
  is held to the rules of adding there, keeps the focus on the row, and is
  one step to undo.
- **Inspect an expanded node** — Shift and a click in the scene select the
  node that *built* what it hit, in whatever body wrote it, rather than the
  instance standing for it here; clicking again goes deeper, through nodes a
  plain click never tells apart. A node another body wrote is shown read-only,
  saying where it is written, with the way back to the node here that produced
  it and a way into that component's own tab.
- **Dragging a row** — a row dragged onto another goes inside it, after its
  last child; dropped in the gap above a row it goes among those siblings; and
  dropped on the tree's own space it goes to the end of the body. Where it
  lands is which element takes the drop rather than where in a row the pointer
  sits. A drop is held to the rules of adding there, and to two of its own: a
  node cannot go inside itself, and one dropped where it already stands is
  refused rather than recorded as a step that changes nothing.
- **One walk from state to pose** — `Scene.getPosMatrixMap` is the only place
  a state map becomes a pose. The drawing, the gizmos, hit-testing and the
  snap points read a frame's pose out of that map through `poseIn` and
  multiply in the view transform, rather than each composing `M_i = ∏ C_k
  exp(q^k ζ̂_k)` on its own way down the tree. `poseOf` is gone, and the rule
  that a frame absent from the state map is read at its `initialState` is
  stated once.
- **Constants for repeated values** — a compound value written three times or
  more anywhere in the module is declared once, above the definitions, and
  used by name: the starter's bob becomes `const POSITION = [4, 0]`. The name
  comes from the prop that carries it, the most common one where they differ,
  because the name a person wrote is gone with the rest of how the file was
  written -- [0014 page 6](docs/issues/0014/06-codegen.md) says so in its
  table, and asks for the mechanical recovery anyway. Three rather than twice,
  because a drag landing one frame on another's point made a coincidence look
  like a shared value.
