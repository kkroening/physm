# 2 — Structural values and signals

**Parent:** <a href="../0016.md" title="0016 — Make the document a program rather than a drawing">0016</a>
· **Previous:** [Overview](01-overview.md)
· **Next:** [Scope and the port surface](03-scope.md)

Every expression in the document is one of two kinds, and the difference decides
where it may appear, when it is evaluated, and whether a feature is tractable at
all.

- **Structural.** Evaluated once, at build time, from parameters and constants.
  It decides the scene's *shape*: how many of something there are, where a frame
  sits in its parent, how long a rod is, which variant of an enum is in force.
- **Signal.** Evaluated per tick, against the current pose and state. It decides
  things that may change while the scene runs: a force, a world-space drawing, a
  key binding's contribution.

**A structural expression may not read state.** That is the whole rule, and three
of the wish list's items fall out of it.

## Why a repetition count must be structural

`pendulumCount` decides how many frames exist. Frames carry state, the state map
is keyed by frame id, and the solver assembles its matrices from the frame set.
A count that could change per tick would mean re-assembling mid-run and
re-keying the state map — losing the run, and with it undo's ability to carry
state across a prop edit ([0014 page 8](../0014/08-play.md) settled that a prop
edit carries state over and a structural edit restarts it; a count that changed
per tick would make every tick a structural edit).

So the constraint is not a limitation to apologise for. It is what makes
repetition implementable: **the count is a function of parameters, and parameters
do not change while the scene runs.**

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

## Why "keep the pole horizontal" is a signal

A rotary spring that restores a frame toward its parent's zero is a trivial local
term: torque proportional to the frame's own coordinate. The wish list's crane
arm is not that. "Horizontal" is a *world* direction, so the rest orientation has
to be expressed in the arm's frame, which requires the accumulated pose from the
world down to that frame.

A solver that evaluates forces from the current pose handles this without
difficulty — but the spring's rest direction is a signal, not a constant, and
writing it as a constant would silently give the wrong behaviour the moment
anything above the arm rotates.

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
