# 2 — Structural values and signals

**Parent:** <a href="../0016.md" title="0016 — Make the document a program rather than a drawing">0016</a>
· **Previous:** [Overview](01-overview.md)
· **Next:** [Scope and the port surface](03-scope.md)

Every expression in the document is one of two kinds, and the difference decides
where it may appear, when it is evaluated, and whether a feature is tractable at
all.

- **Structural.** Evaluated **per build**, from parameters and constants. It
  decides the scene's *shape*: how many of something there are, where a frame
  sits in its parent, how long a rod is, which variant of an enum is in force.
- **Signal.** Evaluated per tick, against the current pose and state. It decides
  things that may change while the scene runs: a force, a world-space drawing, a
  key binding's contribution.

**"Per build" is not "once", and the difference matters more than it looks.** An
earlier draft of this page said structural values are evaluated *once*, which
reads as *immutable* and is wrong. A build happens whenever the element tree is
produced again — which the mounted route does on every React re-render. So a
`pendulumCount` held in a component's state is still structural; it simply
triggers a rebuild when it changes.

That gives three regimes rather than two, and the third had no name here:

| regime | when | example |
|---|---|---|
| build | the tree is produced | a rod's length from a parameter |
| tick | every solver step | a force, a world-space line's endpoints |
| **event** | something happens | a box breaks into fragments; a rope grows a segment |

The event regime is *structural values changing between builds*, not a fourth
kind of value — which is why it needs no new machinery in this RFC and does need
[a policy for what survives a rebuild](#what-survives-a-rebuild).

**A structural expression may not read state.** That is the whole rule, and three
of the wish list's items fall out of it.

## What survives a rebuild

A structural change at run time means a new `Scene`: a new frame set, new
matrices, and a state map keyed on frame ids that may no longer match. The
editor's rule today is all-or-nothing — [0014 page 8](../0014/08-play.md#editing-while-it-runs)
settled that a structural edit **resets** simulation state while a prop edit
carries it over — and that is right for an editor, where you changed the rig and
restarting is honest.

It is wrong for a box breaking mid-swing. Nothing else in the scene should
teleport back to its start because one body fragmented.

**The merge was already specified, and already rejected**, so the question is
not what the mechanism is — it is whether the gameplay case escapes the reason
it was turned down. [0014 page 8](../0014/08-play.md#editing-while-it-runs) sets
out carrying each frame's `[q, q̇]` across a rebuild by identity, and then:

> ⚠️ **Positional identity is where this leaks, and the editor resets rather
> than guessing.** Delete the second of five rope segments and every segment
> below shifts up one index — so carrying state by path would not reset the
> shifted frames, **it would hand each its neighbour's velocity.**

That reason is sound, and it covers the rope case this page wants. A count
falling from five to four is benign only because it drops the *last* one; a
segment removed from the middle is exactly the leak.

**The escape is on the same page**: *"An explicit `key` the author wrote is
honoured either way; the editor does not invent one."* The leak is about
identity being **positional**, and the gameplay case is the one where it need
not be — an engine that fragments a body or removes a segment *knows which*, so
identity is carried rather than inferred from where something sits.

So the proposition, narrowly: **a rig whose structure changes at run time must
carry stable keys, and then merge-by-identity is sound; where it does not,
0014's reset is still right.** Two notes if that is taken:

- 0014 settles identity as **`(path, kind)`, with an explicit `id` preferred**.
  The `kind` half is load-bearing — a frame retyped from `TrackFrame` to
  `RotationalFrame` has `q` in metres and then in radians — and the preference
  for an explicit `id` is the same argument as generating ids from the
  instantiation path ([page 3](03-scope.md)).
- The merged state can violate the *new* scene's constraints. 0014 is sharper
  than "stabilise it" here: the stabilizer yanking shut **looks like an
  explosion**, so re-running the consistency step and saying so beats silently
  correcting.

**Changing 0014's rule is Karl's call and is not taken here.** It is his
decision and his prior reasoning; this page's job is to say that the gameplay
case reopens it, and on what grounds.

## Why a repetition count must be structural

`pendulumCount` decides how many frames exist. Frames carry state, the state map
is keyed by frame id, and the solver assembles its matrices from the frame set.
A count that could change per tick would mean re-assembling mid-run and
re-keying the state map — losing the run, and with it undo's ability to carry
state across a prop edit ([0014 page 8](../0014/08-play.md) settled that a prop
edit carries state over and a structural edit restarts it; a count that changed
per tick would make every tick a structural edit).

So the constraint is not a limitation to apologise for. It is what makes
repetition implementable: **the count is a function of parameters, and a
parameter changes between builds rather than between ticks.** A count that
changes on an event is fine, and is the rope-grows-a-segment case; a count that
changes per tick would make every tick a structural edit.

## Why a line between two anchors needs a signal

Take the case from the wish list directly: a `Distance` constraint between two
anchors in different frames, with a line drawn between them.

Those two points have no common frame. Their separation is a function of the
pose, which is a function of the state, which changes every tick. There is no
frame in which this line has fixed endpoints, so it is not a `LineDecal` with
cleverer props — **it is a decal drawn in world space, whose endpoints are
signals**, rendered after the pose walk rather than carried inside a frame.

That is a new category of element rather than a new kind of prop, and
[page 9](09-elements.md) takes it up — including what it does and does not say
about [0003](../0003.md)'s uncalled `Decal.xform`.

## Why a rest direction read against another frame is a signal

A rotary spring that restores a frame toward a rest in **its own coordinate** is a
trivial local term: torque proportional to the displacement from that rest, with
no pose involved at all.

**The crane arm is that case, which this page originally got wrong.** "Keep the
pole horizontal" means horizontal relative to whatever the pole is mounted on,
and a joint's coordinate is measured from exactly there — so it is a constant
rest on a local spring and needs nothing further. `Spring.rest` is that, and
what this page previously identified as the motivating example for signals is
not one _(Karl, 2026-09-16)_.

What remains a signal is a rest direction read against **some other frame** —
the world, or a sibling, rather than the mount. Then the rest orientation has to
be expressed in the arm's frame, which requires the accumulated pose down to it,
and writing it as a constant *does* silently give the wrong behaviour the moment
anything between the two rotates.

That case is also not a property of the spring. Observing one frame from another
is a capability, and [0030](../0030.md) is where it belongs — with the warning
that its consumer is not cheap: a rest depending on more than one coordinate
puts the restoring torque in every rotational ancestor's row, so the force
vector stops being computable row by row.

## The React worry, answered

The wish list raises a fair objection to outputs: in React you cannot ask an
element for its rendered position, and perhaps `leftPendulum.bobPosition` is the
same mistake.

The analogy holds for exactly half of it, and the half it holds for is the half
this distinction names.

`bobPosition` is ambiguous between **where the bob sits in the pendulum's own
frame** — structural, authored, knowable without running anything, and no more
exotic than asking a component for a prop it was given — and **where the bob is
in the world right now**, which is a signal.

The first is fine and cheap. The second is the one React cannot do cleanly, and
the reason it cannot is instructive: **layout belongs to the browser**, happens
after commit, and React does not own it. The escape is a ref, an effect, and a
requestAnimationFrame loop, which is exactly the machinery nobody enjoys.

**Physm owns its layout step.** `Scene.getPosMatrixMap` *is* the layout pass, it
already runs once per tick, and this year's work made it the single place a state
map becomes a pose — the drawing, the gizmos, hit-testing and the snap points all
read through `poseIn` rather than each composing the walk their own way. A
world-space signal is therefore not a new mechanism at all. It is one more
consumer of the pose map.

So outputs are not the React mistake, **provided they are typed**. An output
declared structural is a constant the caller can compute with anywhere; an output
declared as a signal may only be consumed where signals are allowed.

## Which solver a signal is evaluated against

"Per tick" names a moment, and physm has that moment in two places. `JsSolver`
ticks in JavaScript. `RsSolver` serializes the scene, hands a *batch* of ticks to
wasm, and the loop runs inside Rust — and that is the path the demo runs. So a
signal evaluated per tick in JavaScript is not automatically available where the
simulation actually happens.

Splitting the two uses answers most of it:

- **Signals that draw** — a world-space decal's endpoints — are evaluated at
  render time from the pose map, *after* the batch, once per animation frame.
  They never enter the tick loop, and the fast path is untouched.
- **Signals that feed a force** meet the batch boundary. `RsSolver.tick` fills its
  external-force buffer once and `tick_mut` holds that slice constant for the
  whole batch, so such an expression is evaluated per batch rather than per tick.

That is the granularity the demo already ships with — `App.jsx` computes its cart
force once per animation frame — so a key binding routed through an expression
inherits what exists rather than needing something new.

What does not fit is a force expression reading the state *evolving within* a
batch, which is exactly the responsive-cart case the wish list asks for. Its
options are evaluation moved into Rust, or `tickCount = 1` and a slower path;
[page 11](11-risks.md) records it as open rather than picking now.

## Where each kind is admitted

| position | kind | why |
|---|---|---|
| a frame's `position`, `angle`, initial state | structural | defines the scene the solver assembles |
| a decal's frame-local geometry | structural | it lives in a frame; the frame moves, the geometry does not |
| a repetition count, an enum discriminant | structural | decides the tree's shape |
| a world-space decal's endpoints | signal | no frame contains them |
| an external force's magnitude | signal | that is what a force is — per batch on the Rust path, above |
| a spring's rest direction, when world-referenced | signal | depends on accumulated pose |
| a key binding's routing expression | signal | reads current state by design |

The table is the specification a reviewer can hold a prop editor to: if a prop
accepts an expression, its `PropSpec` says which kind, and the editor refuses the
other at the point of typing rather than at the point of running.
