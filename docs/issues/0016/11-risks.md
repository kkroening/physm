# 11 — Risks

**Parent:** <a href="../0016.md" title="0016 — Make the document a program rather than a drawing">0016</a>
· **Previous:** [Staging](10-staging.md)

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
It is cheap at step 4 and expensive at step 8.

## Addressing changed twice

[Page 5](05-addressing.md) is the whole argument. The risk is not that it is
hard — it is that slots feel urgent and repetition feels distant, so the slot
half lands alone and the iteration half arrives as a second migration through the
same dozen files.

## The emitted form for repetition

The round-trip rule says a chain of N must emit as a construct and read back as a
chain. If no such form is found, the fallback is unrolling — at which point the
count stops meaning anything after the first save, and the feature is a
convenience for initial authoring rather than a parameter.

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
