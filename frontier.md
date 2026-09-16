# Frontier

The working plan for the scene editor: what is in view now, what comes next,
and what is further out. Revised freely as the work teaches things — see
[`CLAUDE.md`](CLAUDE.md#the-frontier) for how it is used.

**The objective.** [0014](docs/issues/0014.md) built an editor whose document is
a drawing of one scene, and it is done to its MVP. [0016](docs/issues/0016.md)
is the next objective: make that document a *program* that produces scenes —
parameters, expressions, repetition, slots, a declared port surface, and
hand-written components as the escape hatch for whatever the subset cannot say.
Its [staging page](docs/issues/0016/10-staging.md) orders the work by risk; this
file is what actually decides what happens next, and is expected to diverge.

## In view

**Signals** -- 0016's step 4, and the first thing since parameters that the
core has to know about. Expressions are done end to end otherwise: stored,
resolved, emitted, drawn, and typed.

Staged by what each slice touches, because the ends of it are very different
sizes:

1. ~~**The kind**~~ -- done. An evaluation either has somewhere the scene has
   got to or it has not, and a build has not: `worldPoint` reads a point on a
   frame through the pose map, and anything built on it refuses in a position a
   build has to answer, naming the operation and the prop. That is one of the
   two decisions this slice was owed -- **a signal evaluated with no pose
   refuses**, rather than yielding a number from a pose it did not mean.
2. ~~**The consumer that never enters the tick loop**~~ -- done. `<WorldLine>`
   is a decal in world coordinates, made afresh from each tick and drawn
   *after* the frames, which is the second decision this slice owed: page 9
   calls paint order "a decision to make rather than a thing to inherit", and
   over the rig is what keeps a line visible when it exists to show a
   relationship between the bodies it would otherwise hide behind. A tick
   carries the scene as well as its poses, so `worldPoint` is
   `Scene.getWorldPosition` rather than a second copy of it.
3. **The editor's half -- blocked, and not small, which is a correction of
   what this said.** The plan was a `PropSpec` saying structural or signal and
   the prop box narrowing its refusal to read it. That part is a few lines and
   it would change nothing observable, because a person cannot type a signal at
   all: a point property is not offered as text, and the grammar has no string
   or point literal to spell `worldPoint('cart', [0, 0])` with. Underneath both
   is a question nobody had asked -- whether a frame id should be *typed*
   rather than picked, when the editor is the one party that knows which ids
   exist, and page 2's own example is a line between two *anchors*, which are
   already named things here. [0028](docs/issues/0028.md) is that question, and
   it is Karl's.

   [0027](docs/issues/0027.md) belongs with this too: a world-space decal
   cannot be clicked in the drawing, because the thing a person would click
   does not exist when the trace that maps shapes back to nodes is made.

   And a question to *ask* here rather than answer: a `Scene` now holds a
   closure, and `toJsonObj` has no term for one. The editor's round trip is
   document -> elements -> `Scene` and never `Scene` -> JSON, so nothing needs
   it yet -- but a save format ([0017](docs/issues/0017.md)) does, and it is
   what decides whether a world decal serializes as the expression it was built
   from or whether scene serialization stays honestly partial.
4. **Force channels**, which meet the Rust boundary: `tick_mut` holds its
   external-force slice constant for a batch, so such an expression is
   evaluated per *batch*. That is the granularity the demo already ships, so it
   inherits rather than needing something new.
5. **A spring whose rest direction is world-referenced**, which needs the
   accumulated pose and is core work on both sides.

**Not taken here:** what survives a rebuild when structure changes at run time.
Page 2 reopens [0014](docs/issues/0014.md)'s reset-on-structural-edit rule for
the gameplay case and says plainly that changing it is Karl's call.

**Still open, and owed an answer around here:**

- **What the language admits**, which is now four issues asking one question
  and is cheaper answered together than four times:
  [0022](docs/issues/0022.md) (do the parameter types grow toward the prop
  kinds), [0024](docs/issues/0024.md) (what unit is an angle expression in) and
  [0025](docs/issues/0025.md) (is there exponentiation). An answer to any
  constrains the others -- a `Length` type wants to know whether `x**2` yields
  one, and an `Angle` carrying a unit wants to know what a power of it means.

  **Half of 0025 is answered** and is written into the issue: `**` was an
  example rather than a requirement, and the spelling is the implementer's call
  _(Karl, 2026-09-16)_. What is left of it is whether the operation should
  exist at all.

  [0028](docs/issues/0028.md) joined them, and is the one with a feature
  waiting on it: `<WorldLine>` is reachable from hand-written TSX and not from
  the editor, and what unblocks it is a decision about whether a signal is
  typed, picked, or both.
- [0023](docs/issues/0023.md) -- whether to run a real mutation tester. Seven
  review rounds have found something the hand enumeration missed in five
  distinct ways, and a tool has no frame to miss things from.

- **Whether the emitter binds a shared subexpression.** The original step said
  it would, and this is the part of it that did not land: one node in two props
  emits as `vec(mul(half, 2), 0)` twice, so the sharing the document records
  stops at the source. It is a decision rather than a leftover -- a `const`
  binding inside the function is what the expressions design shows, and it is
  only now expressible, because the node set gives the source a form for it.
  What it needs first is a resolved shared node surviving the build route,
  which it now does.

- [0022](docs/issues/0022.md) -- promoting a prop widens its contract, and an
  expression on a `length` prop asks the same question from the other side.
  One answer serves both.
- **A composite's props are not folded, and will have to be.** Both build
  routes call a composite with what it was given, and neither can do otherwise:
  `computed` folds a *value*, and page 4 requires a parameter to arrive as a
  value rather than a node so a hand-written component can write
  `if (halfLength > 3)`. Unreachable today, because a composite's props are the
  author's own plain type -- and live the moment the document can hold an
  operation, since `sceneDocument` builds a defined component's props exactly
  as it builds a core one's. Then `halfLength * 2` is `NaN` and
  `halfLength > 3` is `false`, both silently. A requirement of the step that
  lands it, not a thing to guard before there is anything to fold.
- **Where a node set lives, once a reader can produce a multi-definition
  document.** Sharing is recorded per *read* today, which is narrower than what
  the emitter can already write -- `constantsOf` hoists across definitions, and
  `extractComponent` makes a node shared between two of them, which no reader
  can take back because `documentFrom` yields one definition. What forces the
  wider scope is a reader that does not: a save format
  ([0017](docs/issues/0017.md)), rather than the node set, which needs nothing
  the read scope does not already give it.

**[0019](docs/issues/0019.md) is filed and waiting**, and nothing here depends
on it. Its small half -- what *names* a component -- looks ready to decide; its
large half wants evidence rather than argument, namely whether anything besides
the demo ever wants the mounted route.

## Next — 0016

**Where it stands: three of seven steps are done, signals are two slices in
with the third blocked on a decision, and the three steps after them are
untouched.** With the editor's half waiting on
[0028](docs/issues/0028.md), the next thing built is force channels -- keeping
this list's order, and taking only the part page 11 does not record as open. The three that landed came first because each
grows more expensive with every site built before it. What remains of
expressions themselves is the wish list rather than the feature -- `rotate`,
comparison and selection, and the open questions above. Roughly one PR each,
ordered by risk rather than appetite; the
[staging page](docs/issues/0016/10-staging.md) argues the order.

1. ~~**A prop value becomes a tagged thing**~~ — done.
2. ~~**Parameters, literal values only**~~ — done.
3. ~~**Structural expressions**~~ -- the node set, evaluation, and a document
   that holds one. What is left of it is the half a person touches: a viewer,
   and a prop box that parses `halfLength * 2`. Both are in view above. One
   piece of the original item is *not* done and is not in view either -- see
   the binding of a shared subexpression, below.
4. **Signals**, hanging off the pose map, and with them decals drawn in world
   space. Says which solver a per-tick value is specified against, since the
   Rust path hands external forces across once per batch. *Two slices in: the
   kind and its leaf, and a line drawn between two bodies. The slices left are
   in view above, one of them blocked.*
5. **Named slots** -- where the `slot` field lands, and new work in both the
   emitter and the reader, neither of which handles an element-valued prop.
6. **Repetition**, with the emitted form decided first.
7. **The port surface** -- outputs and instance names, then manipulators, force
   channels and key bindings. [0011](docs/issues/0011.md) closes here. Whether
   any of it has a TSX spelling at all is the one open question in the plan, and
   it is owed an answer before parameters fix the declaration block's shape.

**Hand-written components are not an escape hatch any more.** As the syntax
converges -- one node set, one constructor form, the same code either way --
hand-writing becomes the way to bypass codegen and reach an exact effect
directly, which makes the generated layer self-contained and take-it-or-leave-it
rather than mandatory. Anything standing in the way of that is a bad-design
enabler, so it is a first-class step rather than a relief valve, landing soon
after the node question settles _(Karl, 2026-09-16)_.

**Running alongside, blocked by nothing:** springs -- additive to the document,
though each is core work on both sides of the `physm-rs` boundary rather than a
warm-up. The local joint spring is done; the ones referencing another frame's
direction wait on signals.

**Standing fallback when the main line is blocked:** the expression graph viewer
([0018](docs/issues/0018.md)). It is a check on the representation as much as a
debugging tool -- a graph that cannot be drawn is one that has been stored
wrongly -- so it is worth early and is never urgent.

## Further out

- An imported component's tag, from its module rather than its function. The
  document records an imported composite by `Function.name`, and the emitter
  writes both its tag and its import path from that, so a production build
  would name the wrong component and import from the wrong path. A function
  carries no module path at runtime: a registry the host passes in, or a
  build-time convention -- Karl's call which.
  [0017](docs/issues/0017.md) reaches the same gap from the other side: a saved
  document cannot name an imported component's module either, for the same
  reason. One answer serves both -- but the two halves come apart, which is
  worth knowing before picking one. `nameOf` already reads `displayName ?? name`
  and nothing sets a `displayName`; one that was set would survive minification
  and fix the *tag*, while `importsOf` writes `./${name}` from that same string
  and would still be wrong wherever the display name is not the filename. So a
  naming fix can look like it settled this and leave the path half standing --
  which is the half a save format needs. That argues for the registry over the
  build-time convention: a registry can hand back a module specifier, and a
  convention can only ever hand back a name.

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
- Which snap targets survive the marks being hidden. Point snapping goes with
  *Marks* today because the ring reporting it is drawn there, but the targets
  are a mixed bag: another frame's origin is invisible once the marks are off,
  while a line's end and a circle's centre are painted by the scene and stay
  visible. So the principled rule is probably "the targets still drawn stay
  targets" rather than "all of them go" -- a change to `snapPoints` with its
  own tests. Whether that, a third control, or the current pairing is right is
  Karl's call.
- Reaching the view from the keyboard. The wheel and a button-held drag are
  the only ways to zoom or pan, and `Reset view` -- the one keyboard-reachable
  control -- is disabled precisely while it is all someone has. The view is
  also the first piece of editor state with no typed surface: a frame that
  cannot be dragged can still be reached by typing into the properties pane,
  and there is no equivalent for scale or origin. `App.jsx` has carried a
  keyboard scheme all along, but it leans on a held-key loop with a
  `deltaTime`, and four of its six keys are letters the tree's type-ahead owns;
  `-` and `=` are free. Whether navigation is owed a keyboard path at all, and
  where those keys would live, is Karl's call.
- What a drag does while the scene plays. The frame drifts from the pointer,
  since its own coordinate and its parents' keep moving: pause while a drag is
  held, refuse one during play, or keep the live nudge. Karl's call.
- Types first or schema first, for components the editor declares? The core
  nine are types-first, forced by their core option classes, while
  [0014 page 5](docs/issues/0014/05-metadata.md) argues schema-first. Declared
  components take no props until promote-to-prop, so it stays open -- Karl's
  call. Note that the deferral expires by its own terms at 0016's parameters
  step, which *is* promote-to-prop; [0016 page 8](docs/issues/0016/08-metadata.md) argues an
  answer for user-declared parameters and leaves the core nine types-first.
- Whether an emitted constant is the answer or a placeholder. What page 6's
  first row loses is not the constant but *the fact that the uses were one
  value*, and no count recovers that: three values can coincide as easily as
  two, and a rod used by a line and a weight without a circle is a real repeat
  left inline. The threshold trades a false positive for a false negative
  rather than removing the guess. What would end it is the document recording
  that several props hold one value -- which is close to what promote-to-prop
  implies -- and whether that is where this goes is Karl's call. 0016's
  expressions step *proposes* deleting the heuristic rather than tuning it, on the grounds that
  expression identity is what it was guessing at; the call is still owed.
- Promote to prop, or scope ids per instance: either makes a component that
  names an id reusable. Which comes first is Karl's call, and
  [0016 page 3](docs/issues/0016/03-scope.md) proposes a third answer -- *both*,
  as one design: a name inside a definition becomes private and generated from
  the instantiation path, and anything a caller needs to name becomes a declared
  port. Which matters because the ids are not only anchors': a frame id is what
  [0011](docs/issues/0011.md) is about, and the state map and external force map
  are keyed on it, so scoping alone would break that case rather than fix it. A
  promoted prop that sets a count -- page 8's `segmentCount` -- changes the
  structure but arrives as a prop edit, which carries the run over; whether it
  resets instead, and how the editor tells, is part of the same call.
- The focused component's definition marked in the code on a change of tab,
  as [0014 page 3](docs/issues/0014/03-focus.md#what-is-global-and-what-belongs-to-a-tab)
  has it. A tab change clears the selection, so after one nothing is marked
  and the pane stays where it was. It needs codegen to record a range per
  definition; whether the selection's mark stands in for it is Karl's call.
- A save format for the document ([0017](docs/issues/0017.md)). The editor has
  never had one, and the emitted TSX cannot be it -- `documentFrom` recovers a
  single definition, so anything with a scene *and* a component is already
  one-way, and expressions widen that. Not blocking; wants deciding before
  somebody loses a scene rather than after.
- The constraint-first direction ([0014 page 9](docs/issues/0014/09-horizon.md))

## Decisions

- **A slot lives on the child node, not in the path.** A node's children stay
  one ordered list and a child carries an optional label, so `NodePath` never
  changes and the migration the RFC called its most invasive change does not
  exist. Children bind to slots by Python's keyword-argument rule: unnamed go to
  the first slot, and once one child names a slot every later child must too.
  Recorded in
  [0016 page 5](docs/issues/0016/05-addressing.md#the-slot-belongs-on-the-child-not-in-the-path).
  _(Karl, 2026-09-16)_
- **A structural edit resets simulation state; a prop edit carries it over.**
  Recorded in [0014 page 8](docs/issues/0014/08-play.md#editing-while-it-runs).
  _(Karl, 2026-09-11)_
- ~~**An expression emits as the host language's own syntax.**~~ Reversed
  2026-09-16, below.
- **An expression emits in constructor form, structural and signal alike.**
  `mul(halfLength, 2)`, not `halfLength * 2`. A signal has no value at emit time
  and must survive as a graph, and JavaScript cannot write an edge with `*` --
  so the choice was one syntax for structural and another for signals, or one
  for both. `mul` constructs a node rather than multiplying, so evaluating it
  builds the graph rather than destroying it, and the same form serves the
  hand-written component, the emitted module and the document's own storage. The
  prop editor still takes `halfLength * 2`; a DSL collapsing the emitted form
  back to infix is pure sugar, deferred. Recorded in
  [0016 page 4](docs/issues/0016/04-expressions.md#what-the-emitter-writes).
  _(Karl, 2026-09-16, reversing his own 2026-09-14 call.)_

## Done

- **A line between two points on different bodies** -- the wish list's own
  example, which no `<Line>` prop could express because its endpoints have no
  common frame. An expression is structural or signal; a signal reads where the
  scene has got to, and a build -- which has nowhere -- refuses one, naming the
  operation and the prop. `<WorldLine>` is the consumer: a decal in world
  coordinates, remade from each tick and drawn over the rig, and the one
  building block that folds its own props rather than taking them folded. One
  that cannot be made costs itself rather than the picture.
- **A computed prop, in the document** — a prop value's third variant is an
  expression, resolution goes into the graph so a reference inside one finds
  the instance's argument, and the emitter writes `endPos={vec(mul(half, 2),
  0)}` rather than the value it folds to, importing the operations beside the
  components. A shared subexpression stays one node through resolution. Shown
  in the tree and the properties pane as the call that built it, not yet
  editable.
- **The expression graph, drawn** — a computed prop shows the nodes and edges
  it is stored as, beneath the prop itself. One node per stored object
  identity, never per equal subtree, which is what makes it a check on the
  representation rather than a second opinion about it. Resolves
  [0018](docs/issues/0018.md).
- **Expressions, typed** — `halfLength * 2` in a prop box becomes the graph the
  emitter writes as `mul(halfLength, 2)`, and a refusal says what was wrong and
  where, beside the field. A prop is offered as text when the field can *read
  its own output back*, so a graph with no syntax for it is drawn rather than
  offered as text a person cannot change. An angle is not offered at all while
  its unit is open ([0024](docs/issues/0024.md)).
- **Expression nodes** — a prop can be computed rather than stated:
  `position={vec(3, mul(halfLength, 2))}`. A constructor returns a node rather
  than a result, so one form serves a hand-written component, the module the
  editor writes, and the document's own storage; an operand is whatever object
  was handed over, so binding a subexpression once and using it twice stores
  one node with two edges. Both build routes fold a computed prop where props
  are handed over, and a graph that reaches itself is named rather than
  recursed into.
- **Sharing, recorded rather than guessed** — a value object held by two props
  is one node in the document, so the emitter names it because the document
  says the two are one value rather than because they happen to agree. Two
  props that merely agree stay two, however many of them there are, and the
  sharing survives a round trip through emitted source.
- **Parameters** — a definition declares typed parameters with optional
  defaults, an instance passes literals, and a child prop may be a reference to
  one, resolved against what that instance supplied. The emitted module writes
  the signature and the reference rather than the argument, and every name it
  binds is checked before it is written. A person adds, names, types, defaults
  and deletes them in a declaration block at the top of the definition's tree,
  with a rename carrying every prop that names it and a delete refused while
  one refers to it. A prop is carried into the block and back with one button
  each; an instance's props are the parameters its component declares, edited
  with the same fields; and an extracted subtree takes the declarations it
  refers to with it. Resolves [0020](docs/issues/0020.md).
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
- **A press drags the nearest thing that can move** — a press anywhere in a
  component's instance drags the frame that puts the instance where it is,
  rather than refusing with a not-allowed pointer because the frame under it
  belongs to another body. Each thing under the pointer in turn leads back to
  the nearest node above it this body can write to, and the first that leads
  anywhere wins -- so the gesture the picture invites is the one that happens.
- **Shapes can be edited at all** — the selected shape's point-props are drawn
  as handles and dragged: a box by its `position`, a line by either end, and a
  weight, which draws nothing whatever, by the only mark it has. The nearest
  handle in reach takes the press, and a shape's prop is written in the
  coordinates of the frame drawing it. Points read in another frame, and those
  whose absence means the solver finds them, are left unmarked.
- **The marks and the grid can be hidden** — two controls in the scene pane
  turn off what the editor draws over the scene and under it, and each takes
  with it the rule its marks stood for: with the marks off there is no gizmo
  to drag by, no handle to catch a press, and no ring to snap to. What no mark
  made discoverable stays: the selected shape is still dragged by its body,
  which the scene itself paints and the properties pane names, and a press
  anywhere else falls to the nearest frame above what it points at -- the rule
  that needs nothing drawn. With the grid off a drag no longer snaps to whole
  units. Hiding the marks alone would have left those rules deciding presses
  invisibly.
- **The view can move** — the wheel zooms about the pointer, dragging empty
  space pans, and a control returns the view home; before this the scene pane
  drew at a fixed eighteen pixels to the unit centred on the world origin, so a
  rig larger than the pane could not be edited at all. `getViewXformMatrix`
  always took a translation and a scale and every consumer is handed the
  matrix, so the change was those two arguments becoming state -- except in the
  drag, which caches values derived from the matrix across frames and so
  refuses the wheel while it runs. Its zoom-out was clamped by the grid drawing
  a line at every unit -- see the entry above, which is what lifted that -- and
  the zoom-in bound is a pick.
- **A click in a test presses first** — `clickScene` fired a bare `click` with
  no `mousedown`, so a click straight after a drag was suppressed rather than
  picking. The flag that suppresses one click after a drag is cleared by a
  press, and a bare click could only spend it by being the click suppressed —
  which is not what a browser does, since a real click always begins with a
  press. It presses, releases and clicks now, closing a trap that was latent
  rather than theoretical: a dozen drags in the file are still driven by hand
  to `mouseup`, leaving that flag set.
- **A grid that steps 1-2-5** — the grid's step is the smallest rung of the
  1-2-5 ladder whose lines clear twelve pixels, rather than the smallest power
  of ten. A decade ladder let the spacing grow tenfold before the next rung
  arrived, which as drawing is only crowded at one end and sparse at the other
  -- but the snap rides the same ladder, so it also meant one wheel notch took
  a person from placing on tens to placing on hundreds with nothing between,
  and that is what reaches the code. No two rungs are further apart than two
  and a half.
- **The drag helper raises the click a browser does** — `dragScene`, which
  nearly every scene test goes through, fired mouse down, move and up and
  stopped. A browser also raises a `click`, and picking listens to that and to
  nothing else, so any assertion about what a drag's *release* does to the
  selection asserted nothing at all -- picking where the drag did not, cycling
  in the same place, clearing on empty space. A drag that moved was never among
  them: it picks from its own move handler. Three tests reached `master` that
  way, each found by a mutant rather than by the suite, and four places had
  hand-rolled the missing click with comments showing the gap was understood
  each time it was met.
- **A grid that steps** — the grid draws a line at every multiple of a power of
  ten, the smallest whose lines stay at least twelve pixels apart, so it keeps
  its shape however far the view pulls back instead of flooding the pane. A
  drag snaps to that same step rather than to a unit the grid may have stopped
  drawing, and the snap's reach is a quarter of a step at its widest, so half
  of every gap stays free at any zoom. That is what let the view's zoom-out
  widen from four pixels to the unit down to one.
- **Constants for repeated values** — a compound value written three times or
  more anywhere in the module is declared once, above the definitions, and
  used by name: the starter's bob becomes `const POSITION = [4, 0]`. The name
  comes from the prop that carries it, the most common one where they differ,
  because the name a person wrote is gone with the rest of how the file was
  written -- [0014 page 6](docs/issues/0014/06-codegen.md) says so in its
  table, and asks for the mechanical recovery anyway. Three rather than twice,
  because a drag landing one frame on another's point made a coincidence look
  like a shared value.
- **A prop value is a tagged thing** — a document's props hold
  `{ kind: 'literal', value }` rather than the value itself, which is the
  indirection [0016](docs/issues/0016.md) needs before a prop can hold an
  expression. One variant, no behaviour change: the reader wraps what JSX
  states, the builder and the emitter unwrap, and `setProp` takes a tagged
  value so the caller is where the choice will eventually be made. The tag is
  already doing its work -- reaching for `.value` is what marks a caller that
  can only handle a literal, so a second variant makes the compiler name every
  one of them. It also separated two questions a plain value had run together:
  a summary row now shows the props that have a *value*, not the props that are
  *there*, which untyped JSX can tell apart.
- **A joint spring** — `stiffness` on a frame, slack at the frame's own zero, so
  the restoring force is `-stiffness * q` beside the existing
  `-resistance * qd`. The local case: it reads the frame's coordinate and
  nothing else, so it needs no pose. In both solvers, on both sides of the JSON
  boundary, and in `docs/algorithm.md` -- where it groups with *gravity* under
  `-d_i U` rather than with the Rayleigh coefficients it sits beside in the
  code, because a spring is conservative. The test pins the physics rather than
  the agreement: a point mass keeps its radius, so `I qdd = -k q` is exact at
  any amplitude, and three samples a quarter period apart catch a sign flip, a
  `qd`-for-`q` slip and a dropped term *made in both solvers at once* -- each of
  which the cross-validation suite is blind to.
- **Parameters, in the document** — a definition declares typed parameters with
  optional defaults, an instance passes literals, and a child prop may *be* a
  reference to one. `elementOf` threads a scope so each instance resolves its
  own, and the emitter writes the signature and the reference rather than the
  argument -- `<Pendulum bob={[4, 0]} />` calling
  `function Pendulum({ bob }: { bob: readonly [number, number] })`, with
  `endPos={bob}` inside. Two instances of one definition can now differ, which
  a document of literals could not express at all.

  The tagged prop value earned its keep here: adding the second variant
  produced sixteen compile errors, one per site that could only handle a
  literal, so every one was a decision rather than a discovery. And the seam
  page 4 predicted would split did -- `plainProps` had no callers left and is
  gone, replaced by `resolvedProps` for React and the emitter printing
  references itself.
