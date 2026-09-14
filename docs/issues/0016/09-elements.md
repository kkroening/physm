# 9 — New elements

**Parent:** <a href="../0016.md" title="0016 — Make the document a program rather than a drawing">0016</a>
· **Previous:** [Metadata](08-metadata.md)
· **Next:** [Staging](10-staging.md)

The additive part of the list — and the one part that is *not* the document
becoming a program. These need no new document machinery at all, which is what
makes them the useful thing to build while the rest is being designed, and also
what keeps them out of [page 1](01-overview.md)'s reduction.

**Additive does not mean small, because physm has two solvers.** `RsSolver`
serializes the scene with `Scene.toJsonObj` and hands the JSON to wasm, which
`physm-rs` parses; the demo runs that path rather than `JsSolver`; and
`CLAUDE.md` names the cross-validation between the two — the same scene through
both, trajectories required to agree — as a deliberate invariant. So a new
force-contributing element is a core class, a case on each side of the JSON
boundary, a Rust force term, and a cross-validated test. A scene only one solver
can run is worse than not having the feature.

## Springs

**Linear** springs are unremarkable: two attachment points, a rest length, a
stiffness, and a force along the line between them. The attachments are the same
kind of thing a `Distance` constraint's ends already are, so the naming and
resolution machinery exists.

**Rotary** springs are where the wish list's instinct that they are "a little
trickier" is right, and worth being precise about *why*, because the two cases
are genuinely different:

- A spring restoring a frame toward its **parent's** zero is a local term:
  torque proportional to the frame's own coordinate, with no pose needed.
- A spring restoring a crane arm toward **horizontal** references a world
  direction. Its rest orientation must be expressed in the arm's frame, which
  needs the accumulated pose from the world down — so the rest direction is a
  signal ([page 2](02-values.md)), not a constant.

The second is not hard for a solver that evaluates forces from the current pose,
but writing it as though it were the first gives silently wrong behaviour as soon
as anything above the arm rotates. The distinction belongs in the component's
props rather than in the author's memory: a rotary spring says what it is
restoring *toward*, and that target is typed.

Neither adds constraint rows, so neither disturbs the over-determination
accounting [0002](../0002.md) is about.

## Decals drawn in world space

[Page 2](02-values.md) reaches this from the wish list's own example — a line
drawn between two anchors in different frames, whose separation is a function of
the pose. There is no frame in which that line has fixed endpoints, so it is not
`LineDecal` with better props.

**What this says about [0003](../0003.md), and what it does not.** That RFC
observes that every decal transforms itself twice by two routes, that
`Decal.xform(m)` returns a decal in transformed coordinates, and that *nothing
outside the test suite calls it* — so the question of which is the real API has
little evidence to decide it.

A world-space decal is some evidence, and it is worth being precise about which
kind. It is **not** a caller for `xform`: [page 2](02-values.md) argues that such
a line has no frame in which its endpoints are fixed, which is the same as saying
there is no frame-local geometry to carry through a matrix. Its endpoints come
out of the pose map already in world coordinates, and what remains is the *view*
transform, which the decal views already apply inline.

Nor does it touch 0003's stated blocker, which is about correctness rather than
about callers: `BoxDecal.xform` reconstructs a box from a transformed `angle`
while the renderer carries precomputed `corners` through the matrix, and those
agree only under rotation and uniform scale. A y-down screen transform is a
reflection. A world-space decal is drawn through that same transform, so it
inherits the problem rather than resolving it.

What it does supply is one more consumer of "geometry through a matrix", which is
evidence about whether the operation earns its keep at all — the question 0003 is
actually weighing, and which [0004](../0004.md) sharpened toward deleting.

Worth noting the ordering consequence: a world-space decal is drawn from the pose
map, so it is produced *after* the walk rather than during assembly. Paint order
against frame-local decals is therefore a decision to make rather than a thing to
inherit — another place [0005](../0005.md) is adjacent.

## External force channels

A named in-port carrying a signal at run time, declared by the definition that is
willing to be pushed — `cart.trackForce`. [Page 3](03-scope.md) covers the
declaration; the solver side is a contribution to the force assembly, keyed by
the frame the channel names.

The wish list distinguishes two things worth keeping distinct: a force in a
**world direction** applied at a point on a body — click and drag the ball —
versus a force on a **degree of freedom**, like a track frame's coordinate or a
rotational frame's angle. The first is the general case and the second is a
projection of it, but the second is what a key binding usually wants, so both
deserve to be expressible without the author doing the projection by hand.

This is also the concrete answer to [0011](../0011.md): the demo reaches into the
rig by id because the rig has no way to offer a push. A declared channel is that
offer, and the id goes away with it.
