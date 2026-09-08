# Constraints and loop closure

**A design, not an implementation.** Nothing described here exists in the code yet;
[`algorithm.md`](algorithm.md) describes what the solver actually computes today. This document
exists to be argued with before any of it is built.

## Contents

1. [The problem](#1-the-problem)
2. [Two things called "DAG"](#2-two-things-called-dag)
3. [The augmented system](#3-the-augmented-system)
4. [The Jacobian is already computed](#4-the-jacobian-is-already-computed)
5. [Constraint types](#5-constraint-types)
6. [Why the target length must be explicit](#6-why-the-target-length-must-be-explicit)
7. [Drift, and how it gets fixed later](#7-drift-and-how-it-gets-fixed-later)
8. [What the solver has to tolerate](#8-what-the-solver-has-to-tolerate)
9. [Prior art, and two bugs in it](#9-prior-art-and-two-bugs-in-it)
10. [Verification](#10-verification)

---

## 1. The problem

The solver models a **forest of frames**: every frame has exactly one parent, and its pose is the
product of the joint transforms along its root path. That is what makes
$`\partial M_j/\partial q^i = V_i M_j`$ true, and everything in [`algorithm.md`](algorithm.md)
follows from it.

A mechanism with a **closed loop** does not fit. The motivating example:

> A cart on a horizontal track. Two rigid poles descend from it, one to the lower left and one to
> the lower right. A rope hangs between the pole tips — modelled as a chain of swivelling segments
> from each tip — with the two chains joined in the middle by a short link. Driving the cart left
> and right should make the rope flop, transferring momentum along its length, while staying
> suspended between the poles with enough slack to be interesting rather than taut.

Each rope chain is a tree, and the cart is their common ancestor. What the tree cannot express is
that the two chains **meet**. That relationship is a loop closure, and it is what constraints are
for.

## 2. Two things called "DAG"

The 2019 design notes say *"components form a dag"*, which is ambiguous between two very different
changes. The distinction decides whether the existing derivation survives.

**A frame with two parents is over-determined, not ill-posed.** Such a node has two candidate
poses, $`M_a L_j`$ and $`M_b L_j'`$, and they must agree. *Requiring them to agree is a loop
closure* — so the second-parent edge is not an alternative to constraints, it is a thing
constraints implement.

What genuinely does not survive is making the **solver** carry it. If a frame's pose depends on
two root paths there is no single product of exponentials, no $`M_j`$ for $`\mathrm{Ad}`$ to act
on, and the comparability test that gives $g$ its sparsity becomes reachability. Sections 2–5 of
`algorithm.md` would have to be rewritten.

**So the split is authoring versus solving, not two rival features.** The frame tree the solver
sees stays a tree; a second parent is desugared at scene-build time into one parent plus a
coincidence constraint. Everything in `algorithm.md` survives unchanged — the mass matrix, the
Christoffel term and both composite sweeps are untouched — and an author can still write "this
hangs from both pole tips", which is the natural way to describe the motivating example.

**One thing that sugar does not cover.** A genuine second parent pins three quantities in
$`SE(2)`$: the child's origin *and* its orientation. [§5](#5-constraint-types) offers only point
constraints, so the desugaring expresses the position half. Whether a relative-angle or weld type
is worth building is a separate question; the motivating example does not need one.

## 3. The augmented system

For $m$ scalar holonomic constraints $`C(q) = 0`$ with Jacobian $`J = \partial C/\partial q`$
($m \times n$), the constrained equations of motion are the unconstrained ones plus a generalised
constraint force $`J^{\mathsf T}\lambda`$, together with the constraint differentiated twice:

```math
g\,\ddot q \;=\; f \;+\; J^{\mathsf T}\lambda,
\qquad
J\,\ddot q \;=\; -\,\dot J\dot q
```

which is one symmetric saddle-point system:

```math
\begin{bmatrix} g & J^{\mathsf T} \\ J & 0 \end{bmatrix}
\begin{bmatrix} \ddot q \\ -\lambda \end{bmatrix}
=
\begin{bmatrix} f \\ -\dot J\dot q \end{bmatrix}
```

$g$ and $f$ are exactly what `get_coefficient_matrix` and `get_force_vector` produce today. The
change is **additive**: build the $J$ rows, assemble $(n+m)$, and slice $`\ddot q`$ out of the
first $n$ entries. Neither composite sweep changes.

**Assemble it symmetrically.** $`\lambda`$ is a free variable, so scaling one off-diagonal block
and not the other still yields the correct $`\ddot q`$ — it only rescales $`\lambda`$. It is worth
getting right anyway: an asymmetric matrix rules out a symmetric indefinite factorization later,
and misreports the constraint force if anything ever reads it.

## 4. The Jacobian is already computed

This is the part that makes the change small. For a constraint between point $`r_P`$ on frame $a$
and point $`r_Q`$ on frame $b$, with $`d = x_P - x_Q`$ their world-space separation:

**Write $`J_d \equiv \partial d/\partial q`$ for the separation's Jacobian**, distinct from
$`J = \partial C/\partial q`$ in [§3](#3-the-augmented-system). The two coincide only for the
coincidence type, and conflating them produces a bias term that is right for one constraint type
and dimensionally wrong for the other.

```math
(J_d)_i \;=\; \frac{\partial d}{\partial q^i} \;=\; [\,i \preceq a\,]\,V_i x_P \;-\; [\,i \preceq b\,]\,V_i x_Q
```

$`V_i x`$ — a spatial Jacobian column contracted with a world point — is the same primitive the
mass matrix is built from. The rows are non-zero exactly on the union of the two frames' root
paths, which `index_path_map` already provides.

The velocity-product term is the same story:

```math
\ddot d \;=\; \sum_i \ddot q^{\,i}\,(J_d)_i \;+\; \big(A_a x_P - A_b x_Q\big)
\qquad\Longrightarrow\qquad
\dot J_d\,\dot q \;=\; A_a x_P - A_b x_Q
```

using `accel_sum_mats`, the bias accelerations the force vector already consumes. **Each
constraint type derives its own $`\dot J\dot q`$ from this**; see [§5](#5-constraint-types).

**So constraints need no new kinematics.** They reuse $V$ and $A$ — sweeps 2 and 4 — plus the
attachment points, which are $`x_P = M_a r_P`$, one product against `pos_mats` from sweep 1. (Not
sweep 5: `get_weight_pos_vecs` maps over `frame.get_weights()` and has no entry for an arbitrary
point on a frame.) The only genuinely new code is the constraint type, the row assembly, and the
augmented solve.

## 5. Constraint types

Two forms, both valid, differing in what they pin and how many rows they cost.

### Distance — one row

```math
C \;=\; \tfrac12\big(\lVert d\rVert^2 - L^2\big),
\qquad
\frac{\partial C}{\partial q^i} \;=\; d^{\mathsf T}\frac{\partial d}{\partial q^i}
```

```math
\dot J\dot q \;=\; \lVert \dot d\rVert^2 + d^{\mathsf T}\big(A_a x_P - A_b x_Q\big)
\qquad\Longrightarrow\qquad
J\ddot q \;=\; -\lVert \dot d\rVert^2 - d^{\mathsf T}\big(A_a x_P - A_b x_Q\big)
```

Note the bias is a **scalar** and carries a $`\lVert\dot d\rVert^2`$ term that the coincidence
type does not. Reading $`\dot J_d\dot q`$ from [§4](#4-the-jacobian-is-already-computed) as though
it were $`\dot J\dot q`$ gives a vector where a scalar belongs and silently drops that term — which
is the term the 2019 implementation got wrong.

Removes one degree of freedom. This is a rigid massless link between two points, free to swing
about both ends — which is what the motivating example's central joining link is.

**Degenerate as $`\lVert d\rVert \to 0`$** — and the condition is on the *current* separation,
which is state, not on $L$. The row is $`J_d^{\mathsf T}d`$, which vanishes with $d$; and since
[§7](#7-drift-and-how-it-gets-fixed-later) establishes that $`\lVert d\rVert`$ is not held at $L$
but drifts, requiring $`L > 0`$ at authoring time guarantees nothing at any later step.

It is not a knife edge either. The row scales like $`\lVert d\rVert`$ while the right-hand side
keeps a $`-\lVert\dot d\rVert^2`$ term that does not, so as the separation shrinks the equation
approaches $`0 = -\lVert\dot d\rVert^2`$ and the multiplier grows without bound. The motivating
example's central element is *a short link*, which is that regime. See
[§8](#8-what-the-solver-has-to-tolerate) for what to do about it.

### Coincidence — two rows

```math
C \;=\; d \;=\; 0
```

```math
\dot J\dot q \;=\; A_a x_P - A_b x_Q
```

Removes two degrees of freedom: a true pin joint. Each component is linear in $d$ rather than
quadratic, so there is no degeneracy at the target — this is the form to use when two points must
actually coincide, and it is the form a desugared second parent produces
([§2](#2-two-things-called-dag)).

**Neither subsumes the other**, which is the argument for a `Constraint` trait supplying `value`,
`jacobian_rows` and `bias` rather than hardcoding one form.

### Degrees of freedom in the example

Cart 1, plus 3 swivels per rope chain, is $n = 7$. The rigid poles are not degrees of freedom —
they are static offsets, which `RotationalFrame`'s `position` already expresses. A distance
constraint joining the chains gives $m = 1$ and **6 effective degrees of freedom**.

Slack comes from the total rope length exceeding the pole-tip separation. Making them equal pulls
it taut, which is also where conditioning is worst.

## 6. Why the target length must be explicit

At the acceleration level, $`L`$ **cancels**: it is a constant, so it appears in neither $J$ nor
$`\ddot C`$. A distance constraint can therefore be implemented with no $`L`$ anywhere, and it will
hold whatever separation the scene started with. That is a reasonable authoring default — you
place two things, say "link these", and the length falls out of the geometry.

It is still worth storing, for two reasons, and the second is the one that decides the sequencing.

**Stabilization needs it.** Every strategy in [§7](#7-drift-and-how-it-gets-fixed-later) corrects
toward $`C = 0`$, and $C$ cannot be evaluated without $L$. An implementation without it is not
merely unstabilized — it cannot be stabilized without a data-model change.

**Measurement needs it, and that comes first.** Without a stored $L$ there is no quantity to
observe, so "confirm that the constraint drifts" means watching an animation and agreeing it looks
wrong. With it, $`C(t)`$ is computable every step: drift becomes a number to plot, to assert on in
a test, and — the point — **to compare stabilization strategies against**. Baumgarte with
well-chosen constants versus projection is not a distinction visible in a rope animation.

That comparison additionally requires the consistency step in
[§7](#7-drift-and-how-it-gets-fixed-later): with $`\dot C_0 \neq 0`$ the measured drift is
dominated by a term linear in the horizon that has nothing to do with the integrator, and two
strategies cannot be ranked against it. **Storing $L$ is necessary and not sufficient.**

So $L$ belongs on the constraint from the first commit, defaulted at scene-build time from the
authored geometry, with an explicit override available.

**In physm-rs it has to be explicit anyway.** `Scene::from_json_value` parses `frames` and
`gravity`; the frame types parse `angle`, `children`, `id`, `position`, `resistance` and `weights`.
There is no `initialState` — state arrives separately on every `tick`, so the solver never sees
$`q_0`$. Capturing $L$ implicitly would mean latching a value on the first tick, which is stateful
and wrong across RK4's four stage evaluations.

## 7. Drift, and how it gets fixed later

### Consistent initial conditions come first

Enforcing $`\ddot C = 0`$ **preserves $`\dot C`$**, so $`C(t) = C_0 + \dot C_0\,t`$. If the
authored initial velocities do not satisfy $`\dot C_0 = 0`$, the separation drifts **linearly and
exactly**, in exact arithmetic, before any numerical error exists.

That is the ordinary case rather than a corner: every frame in `physm-js`'s cross-validation scene
carries a non-zero initial velocity, and `physm-rs` receives arbitrary $`(q, \dot q)`$ on every
`tick_mut` and so never has an opportunity to check.

**So scene build must establish consistency**, by projecting $`\dot q_0`$ onto $`J\dot q = 0`$ —
the velocity half of the projection strategy below, run once rather than per step — and by
**rejecting** a `length` override inconsistent with the placed geometry. Rejecting rather than
warning, because acceleration-level enforcement preserves $`C_0 \neq 0`$ exactly and forever: the
constraint would silently hold the wrong separation and never converge toward the authored one.

> **Built**, in `physm-js` — and *solving* rather than rejecting, which turned out to be the
> better half of this section's advice. Each constraint type leaves one thing unspecified, and
> `Scene.addConstraint` fills it in from the pose the scene is actually in:
>
> | type | free parameter | solved to |
> | --- | --- | --- |
> | `DistanceConstraint` | `length` | the gap between the two attachment points |
> | `CoincidenceConstraint` | `position2` | $`M_2^{-1}M_1 r_1`$ |
>
> So the author places the frames wherever they belong and names *one* attachment point, and the
> constraint holds at $`t = 0`$ by construction. There is no geometry to get right, and so nothing
> to reject. Rejection survives only for a value the author does supply, which is opting back into
> being responsible for it.
>
> **The rejecting form was written first and was the wrong instinct** *(Karl, 2026-09-07)*. It
> forces the author to solve the geometry and then grades their answer, which is backwards when the
> answer is derivable — and it is unworkable for a scene nobody typed. An interactive builder
> cannot ask someone dragging two chains together to place them coincident to machine precision,
> and "move the frames until the points meet" is not advice a generator can act on.
>
> `Scene.getInitialStateMap` returns $`\dot q_0`$ projected, and both solvers seed from that one
> method, so they cannot disagree about what the initial state is. **The projection is orthogonal
> in the scene's own metric** $`g`$ — $`\dot q \leftarrow \dot q - g^{-1}J^{\mathsf T}(Jg^{-1}J^{\mathsf T})^{-1}J\dot q`$
> — not in the Euclidean one. A plain least-norm correction minimises $`\lVert\Delta\dot q\rVert_2`$,
> which adds a prismatic coordinate's metres per second to a revolute one's radians per second and
> so depends on the unit lengths were authored in; measured, the same rig in millimetres, metres and
> kilometres gave three different answers. The metric version minimises $`\tfrac12\Delta\dot q^{\mathsf T}g\Delta\dot q`$,
> the kinetic energy of the correction — Gauss's principle of least constraint — and an energy does
> not care what anybody authored lengths in.
>
> **Over a band, not unboundedly.** Measured, the correction is identical to eight figures across
> ten orders of magnitude of length scale — $`10^{-5}`$ to $`10^{5}`$ — and outside that the solve
> *fails* rather than degrading quietly. The bound is real rather than a tolerance: $`g`$ mixes a
> prismatic coordinate's mass with a revolute one's mass × length², so its condition number grows
> like the square of the scale, and float64 runs out eventually too. Rescaling the scene is the fix.
>
> The band was five and a half orders — $`10^{-3}`$ to $`3 \times 10^{2}`$, to six figures — while
> `physm-js` computed in float32 on TensorFlow.js tensors. Replacing that with a float64 matrix
> module widened it by four and a half orders. It is worth being precise about *why* that is less
> than the ratio of the two machine epsilons would suggest: what binds at the edges is the
> consistency tolerance the solve is checked against, not the epsilon itself, so the gain is about
> $`10^{6}`$ rather than the $`5.4 \times 10^{8}`$ a naive reading predicts.
>
> **And a coincidence constraint welds two points wherever they land.** Solving `position2` means
> the attachment can sit some way from anything the author drew — in the demo it is about 14% of a
> segment past the end of the last drawn link. That is the contract, not an accident: the constraint
> is about two *points*, and where the geometry is drawn is the renderer's business. It is the price
> of never refusing a scene, and for an interactive builder it is the right side of that trade —
> though a builder will want to *say* when the gap it absorbed is large, since a rig that
> simulates correctly while looking wrong is its own kind of confusing.
>
> **And only there**, for the reason two paragraphs up: `physm-rs` frames do not carry an initial
> state at all — they never parse `initialState`, and the wasm boundary receives $`(q, \dot q)`$ on
> every call. There is no pose on that side to check a constraint against, and inventing one would
> mean a second source of truth for the initial state, which is a worse failure than the one this
> section is about. Rust rejects what it *can* judge without a pose: a constraint naming a frame
> the scene does not contain.
>
> An authored violation is still reachable, deliberately, through
> `addConstraint(c, { allowInitialViolation: true })` — because "$`C`$ is conserved" is only
> observable from a scene that starts violated, so the tests for this formulation need it.

### Then the numerical drift

With consistent initial conditions, position and velocity violations are still unobserved, and
each step injects a small $`\ddot C`$ error that integrates twice, so $`\lVert C\rVert`$ grows
secularly.

**In the motivating example the symptom is that the central link's length changes** — the two rope
chains slowly separate or overlap — while every instantaneous acceleration looks correct.

⚠️ **Without the consistency step, the same symptom appears on roughly the same schedule for an
entirely different reason.** That is the worse outcome of the two: the predicted behaviour shows
up on time and confirms a diagnosis that is not the cause. Establish $`\dot C_0 = 0`$ *before*
concluding anything about numerical drift.

| Strategy | Where it attaches | Cost |
| --- | --- | --- |
| **Baumgarte** — enforce $`\ddot C + 2\alpha\dot C + \beta^2 C = 0`$ | Constraint RHS only | One term; two constants that interact badly with the integrator |
| **Projection** — after each step, Newton $q$ onto $`C = 0`$, then project $`\dot q`$ onto $`J\dot q = 0`$ | *After* the integrator | Robust, untuned, keeps the dynamics clean |
| **GGL** — carry velocity-level multipliers, enforcing $`C = 0`$ and $`\dot C = 0`$ explicitly | System shape | No tuning; larger system |

**Three seams keep these addable without rework:**

1. **`Constraint` exposes `value`, `jacobian_rows` and `bias` separately.** Baumgarte needs
   `value` and $`\dot C`$; projection needs `value` and `jacobian_rows` evaluated at a *new* $q$.
   Fusing them into one "emit my row" method puts both out of reach.
2. **The constraint RHS is assembled as $`-\dot J\dot q`$ plus a stabilization term defaulting to
   zero.** Baumgarte is then a substitution rather than surgery.
3. **The integrator has a post-step hook.** Projection must run once the step is complete, not per
   RK4 stage. `tick_runge_kutta_mut` currently owns the whole update inline, and retrofitting a
   hook into the integrator later is the most expensive of these to defer.
4. **The kinematic sweeps are callable as a function of $q$ alone.** Seam 1 makes the methods
   reachable but not *evaluable*: projection's Newton iteration evaluates `value` and
   `jacobian_rows` at trial $q$ values no solve was run at, which needs sweeps 1, 1′ and 2 re-run
   there. In `physm-rs` those are private free functions reachable only through
   `get_system_of_equations`, which also builds $g$, $f$ and both composite sweeps — everything
   projection does not want. Extract them, have `get_system_of_equations` call the extraction, and
   let `value`/`jacobian_rows` take its output as a parameter.

   **Seams 3 and 4 land together or neither is worth anything**: a post-step hook with no way to
   evaluate the constraint at a trial configuration is a hook with nothing to call.

## 8. What the solver has to tolerate

**The augmented matrix is symmetric *indefinite*, not positive definite.** `algorithm.md` §7 notes
that Cholesky is generically about half the work of the QR currently in use. That is true of $g$
alone and **false the moment constraints exist** — the zero block guarantees negative eigenvalues.
QR, or an $`LDL^{\mathsf T}`$ factorization designed for saddle-point systems, is the
constraint-compatible choice.

**Rank deficiency becomes easy to hit**, and the design has to decide what happens rather than
only noting it. `algorithm.md` §7 already flags
`coefficient_matrix.qr().solve(&force_vector).unwrap()` as ungracious about a singular $g$;
constraints make that reachable through ordinary scene authoring rather than only through a
weightless subtree. Split it the way `algorithm.md` §7 already splits the $g$ case:

| Kind | Examples | When it is caught |
| --- | --- | --- |
| **Structural** | `length` authored as zero; two constraints pinning the same freedom; an over-constrained loop | Once, at **scene build** — reject |
| **Configuration-dependent** | $`\lVert d\rVert`$ drifting toward zero; a chain reaching full extension | Only at **solve time** — return an error, never `unwrap` |

Both want a verification item that drives a scene into them, so the behaviour is pinned rather
than assumed.

## 9. Prior art, and two bugs in it

`physm-py`'s `NaiveSolver._solve` implements exactly this scheme — augmented matrix sized
`nframes + nconstraints`, constraint rows appended, multipliers discarded on return. It is the
right shape, and the 2019 notes record it not working: *"sorta got constraints implemented, but
struggling to get it to produce reasonable results."*

**Two defects are recorded below because they are real, not because they are known to explain
that.** The notes' next two lines are the author's own diagnosis —

> the simulation seems to be unstable, such that it appears that the lagrange multipliers are
> encouraging the acceleration constraint, but it does nothing to prevent displacement+velocity
> drift

— which describes an unstabilized index-1 formulation, i.e. the thing [§7](#7-drift-and-how-it-gets-fixed-later)
predicts this port will also do. It is an impression rather than a measurement, so it settles
nothing; but it is the only contemporaneous evidence, and it points away from the defects.

**The constraint Jacobian is written to the wrong indices.** The mass block converts a path member
to a matrix index explicitly:

```python
for frame_j in frame_i_path:
    j = self.scene.sorted_frames.index(frame_j)
    ...
    a_mat[k, j] += ...
```

The constraint block does not:

```python
for k, frame_k in enumerate(subframe_path):
    ...
    a_mat[k, coeff_index]       += 0.5 * disp_perturb
    a_mat[coeff_index, k]       += disp_perturb
```

There `k` is the position *along the root path*, not the global frame index. The two coincide only
when the constrained frame's root path is a prefix of `sorted_frames` in the same order — roughly,
a single unbranched chain from the first root. **Any branched scene writes the constraint rows into
the wrong coordinates**, which looks like instability and worsens with branching. The motivating
example is branched.

**The velocity-product term has the wrong sign.** $`\ddot C = 0`$ requires

```math
J\ddot q \;=\; -\lVert\dot d\rVert^2 \;-\; \sum_{k,l}\dot q^k\dot q^l\,d^{\mathsf T}\partial_k\partial_l d
```

but the code accumulates `b_vec[coeff_index] += sign * qdk * qdl * ...`, i.e. **plus** the second
term. `get_xform_matrix` returns $`+\partial^2 M`$ — it substitutes the local velocity and
acceleration matrices into the product with no negation — so the sign is not absorbed elsewhere.

**A third thing is not a bug**, recorded so nobody re-derives it: `a_mat[k, coeff_index]` carries a
`0.5` that its transpose does not. Since $`\lambda`$ is free, this yields correct $`\ddot q`$ with
a multiplier at twice its true value. Harmless for the motion; see [§3](#3-the-augmented-system).

**The attribution is answerable, and worth answering rather than arguing.** The sign defect's
acceleration-level error works out to $`2\sum_{k,l}\dot q^k\dot q^l\,d^{\mathsf T}\partial_k\partial_l d`$
— quadratic in velocity, so it vanishes at rest and grows with speed. *"Fine when slow, flies apart
when driven"* is distinguishable from steady drift. The notebook still runs, and its only
`Constraint(...)` — joining `pendulum` to `base2` — is commented out but intact, on a branched
scene, which is the case defect 1 needs. Uncommenting it with both fixes applied settles it in one
run. **Follow-up, not part of this design.**

**The lesson that does carry over is which check finds which defect.** Defect 1 is invisible to
inspection and obvious to a finite-difference check on the Jacobian *and its indices*. Defect 2 is
invisible to that same check, because the Jacobian contains no $`\dot q`$ —
see [§10](#10-verification).

`physm-rs` is also structurally less prone to the indexing defect, because `index_path_map` maps a
global index to a path *of global indices* — a path member already **is** a matrix index, so the
lookup physm-py forgot does not exist as a step to forget.

## 10. Verification

**Each item names the defect class it catches, because the obvious plan does not catch both of the
ones in [§9](#9-prior-art-and-two-bugs-in-it).**

1. **Finite-difference the Jacobian, and its indices.** Perturb $`q^i`$, compare
   $`\Delta C/\Delta q^i`$ against the analytic row, on a deliberately **branched** scene.
   *Catches defect 1* — a Jacobian written to the wrong coordinates — and any error in
   $`J_d`$ or in a type's $`\partial C/\partial q`$.

   ⚠️ **It cannot catch defect 2.** The Jacobian is $`\partial C/\partial q`$ and contains no
   $`\dot q`$; the sign defect lives in $`\dot J\dot q`$, a velocity-quadratic term. Flip that
   sign and this test passes unchanged.

2. **Assert the linear solve.** Check that $`J\ddot q + \dot J\dot q \approx 0`$ after a solve.
   *Catches assembly and factorization errors* — a row written to the wrong offset, a singular
   system silently producing garbage.

   ⚠️ **This is the augmented system's own second block row, so it is satisfied by
   construction.** If $`\dot J\dot q`$ is whatever the assembler produced, a wrong sign propagates
   identically into the matrix and into the assertion, and the residual measures the solver's
   backward error and nothing else. It holds exactly *because it is the equation that was solved*.

3. **Evaluate $`\ddot C`$ without reusing the assembler's bias.** *This is the item that catches
   defect 2*, and nothing above does. Solve once at $`(q,\dot q)`$, hold $`\ddot q`$, and
   central-difference in time:

   ```math
   \frac{\dot C(q + h\dot q,\; \dot q + h\ddot q) \;-\; \dot C(q - h\dot q,\; \dot q - h\ddot q)}{2h} \;\approx\; 0
   ```

   computing $`\dot C`$ from `value` and the state alone. Equivalently, pin $C$ and $`\dot C`$
   against a closed-form scene — a single distance constraint on a two-link chain — over a short
   horizon.

4. **Drive a scene into each singular case** from [§8](#8-what-the-solver-has-to-tolerate), so the
   chosen behaviour is pinned rather than assumed.

5. **Cross-validate the two implementations.** `physm-js`'s `Solver.test.ts` steps `JsSolver` and
   `RsSolver` over the same scene and asserts agreement. *Catches transcription and indexing
   divergence between the two ports* — which is real, and is most of what goes wrong when the same
   design is written twice.

   ⚠️ **It is common mode for a derivation error.** Both implementations are written from this
   document, so a mistake here lands identically in each and they agree perfectly on the wrong
   answer. This is still the strongest reason to build both, but not for the reason a
   "sign-sensitive code deserves two implementations" argument would suggest — item 3 is what
   guards the signs.

6. **Measure the drift.** Record $`\max_t \lVert C(t)\rVert`$ over a fixed scenario, **after** the
   consistency step in [§7](#7-drift-and-how-it-gets-fixed-later) is in place. Without it the
   number is $`\lvert\dot C_0\rvert`$ times the horizon and is not comparable between runs, let
   alone between stabilization strategies — which would defeat the purpose
   [§6](#6-why-the-target-length-must-be-explicit) gives for storing $L$ at all.

## Sequencing

Explicit `length` and both constraint types behind one trait; the scene-build consistency step;
the four seams; finite-difference, solve-residual and time-differenced $`\ddot C`$ checks; both
implementations, cross-validated; the demo scene; then the drift measurement.

Stabilization strategies are follow-ups, as is settling the
[§9](#9-prior-art-and-two-bugs-in-it) attribution by re-running the 2019 notebook. §7's four seams
are what keep the former from being rewrites.
