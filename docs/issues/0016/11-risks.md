# 11 — Risks

**Parent:** <a href="../0016.md" title="0016 — Make the document a program rather than a drawing">0016</a>
· **Previous:** [Staging](10-staging.md)
· **Next:** [The wish list](12-wishlist.md)

What could sink this, roughly in order of how much I would worry.

## Scope, which is not a technical risk

**This list is bigger than everything built so far, and it is four or five spines
rather than one.** The frontier method has worked well on a single objective with
milestones behind it; it degrades when five are open at once, because the thing
it protects against — knocking out tasks while the goal drifts — is exactly what
a five-front effort invites.

The mitigation is unglamorous: pick one spine, finish it, and let the others
wait. The expression system alone is plausibly a month of pull requests, because
it is not a formula parser — it is a typed scope with a dataflow graph, a type
checker, an editor, and an emitter.

## The expression language grows without bound

Every feature will suggest one more operation, and each will be individually
reasonable. The filter in [page 4](04-expressions.md) — **every construct has to
survive being drawn as a node graph** — is deliberately brutal and should be
enforced rather than admired, because a language acquired one reasonable
concession at a time is how the graph view becomes impossible to build.

The escape hatch is what makes the filter affordable: the answer to "the language
cannot express this" is a hand-written definition, not a new construct.

## The structural/signal split discovered late

If expressions ship untyped in time, two things follow and neither is loud. Props
accept expressions that cannot legally be used where they are written, and the
failure is at build or at run rather than at the point of typing. And a
repetition count that reads state gets written, works in the editor, and
re-assembles the scene every tick once it runs.

Retrofitting the distinction means re-typing every expression already authored.
It is cheap when expressions land and expensive once repetition has.

## The iteration index folded into the path

The migration this used to be about is gone — [page 5](05-addressing.md) puts the
slot on the child node, so `NodePath` does not change for slots. The hazard it
named survives, and now stands alone.

When repetition arrives it needs to address *which copy*, and the tempting place
to put that is a path segment. Doing so interleaves "which node" with "which copy
of it" in one sequence, which every reader of a path then has to unpick — and it
would undo the property the slot decision just bought, that a path names an
authored node and nothing else.

The cheap protection is to decide now that the iteration index lives in a
separate instantiation trail, which costs a sentence and no code.

## The hand-written component that hangs the editor

[Page 7](07-handwritten.md)'s call cannot be moved off the main thread the easy
way: a component returns an element tree whose `type` fields are functions, and
structured clone refuses a function, so nothing resembling that tree crosses a
worker boundary. Compiling in a worker is fine and protects nothing that was at
risk.

The routes out are all real work. Running `buildScene` in the worker and posting
serialized scene data runs into `Scene.toJsonObj` omitting decals and
`Decal.toJsonObj` throwing, and — worse — into `origins`, the `WeakMap` keyed by
element *identity* that the editor's picking depends on, which cannot cross a
boundary at all. Reviving a plain-data element description against the registry
works, at the cost of a second element representation kept in step with the
first. Or the hazard is accepted and made recoverable some other way.

**This matters more than a detail, because the escape hatch is argued as worth
starting earlier than it looks** — partly on the grounds that its costs are small
and bounded. This one is not, and it should be picked before the feature is
scheduled rather than during it.

## A force expression that reads the state mid-batch

[Page 2](02-values.md) splits signals into those that draw, which never enter the
tick loop, and those that feed a force, which are evaluated per *batch* on the
Rust path because `tick_mut` holds its external-force slice constant across one.

The wish list asks for exactly the case that does not fit: a cart force that
varies with how fast the cart is already moving, which is the difference between
a responsive rig and a sluggish one, and which wants the state as it evolves
*within* the batch. The options are evaluation moved into Rust — a second
expression evaluator, in a second language, held to agreeing with the first — or
`tickCount = 1`, which gives up the batching the fast path exists for.

Neither is chosen here. It is on this page because it is the one place where "the
solver is untouched" is not quite true, and finding that out while building key
bindings would be the expensive way.

## The emitted form for repetition

The emission rule says a chain of N must emit as a construct rather than as an
expansion. If no such form is found, the fallback is unrolling — at which point
the count is gone from the emitted file, and the feature is a convenience for
initial authoring rather than a parameter anybody reading the output can see.

**This is the one I would decide before building**, because it can invalidate the
node's design rather than merely complicate it.

## Hand-written components as an excuse

The pressure valve has a failure mode: it relieves exactly the pressure that
would otherwise produce the real feature. A `PendulumCart` written by hand works,
and the incentive to build repetition properly drops the day it does.

I do not think that is a reason to defer it — the schedule protection is worth
more — but it is a reason to keep the frontier honest about which features are
genuinely wanted versus which have been quietly answered by the escape hatch.

## The graph view built on a tree

If the expression representation lands as a tree because a tree is easier, the
blueprint view later is either a lie about sharing or a common-subexpression pass
reconstructing what was discarded. Cheap to avoid now, and nearly impossible to
retrofit without rewriting every stored expression.

## What I would not bet on

- **That the type set is right first time.** `Scalar`, `Point`, `Direction`,
  `Frame` is a guess informed by what the code already distinguishes. Angles
  versus scalars, and whether a "point with direction" is a `Frame` or a pair,
  are the two I expect to move.
- **That named slots are enough.** Positional binding is clearly worse, but
  whether slots need cardinality — "exactly one child", "at least one" — is the
  kind of thing that only shows up once several components have them.
- **That the properties pane survives.** It is a good editor for scalar props and
  it is being asked to become an expression editor with a type checker and a
  variant picker. That may want to be a different pane rather than a bigger one.
- **That a month is the right estimate for the expression system.** It is the
  number I would give and the one I would least defend.
