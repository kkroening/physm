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

**Kinematic DAG — a frame with two parents.** This does not survive. A node with two parents has
no single product of exponentials, so there is no $`M_j`$ for $`\mathrm{Ad}`$ to act on;
$`\partial_i M_j = V_i M_j`$ becomes a sum over the paths from $i$ to $j$, and the comparability
test that gives $g$ its sparsity becomes reachability. Sections 2–5 of `algorithm.md` would all
have to be rewritten.

**Scene DAG — constraints and springs as edges between frames.** The frame tree stays a tree; the
extra relationships enter as rows on an augmented system. Everything in `algorithm.md` survives
unchanged, and the mass matrix, the Christoffel term and both composite sweeps are untouched.

**This document is entirely about the second.** The motivating example needs no frame to have two
parents — it needs two frames to be told they coincide.

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

```math
\frac{\partial d}{\partial q^i} \;=\; [\,i \preceq a\,]\,V_i x_P \;-\; [\,i \preceq b\,]\,V_i x_Q
```

$`V_i x`$ — a spatial Jacobian column contracted with a world point — is the same primitive the
mass matrix is built from. The constraint rows are non-zero exactly on the union of the two
frames' root paths, which `index_path_map` already provides.

The velocity-product term is the same story:

```math
\ddot d \;=\; \sum_i \ddot q^{\,i}\,\frac{\partial d}{\partial q^i} \;+\; \big(A_a x_P - A_b x_Q\big)
\qquad\Longrightarrow\qquad
\dot J\dot q \;=\; A_a x_P - A_b x_Q
```

using `accel_sum_mats`, the bias accelerations the force vector already consumes.

**So constraints need no new kinematics.** They reuse $V$, $A$ and world-space attachment points —
all three already produced by sweeps 2, 4 and 5. The only genuinely new code is the constraint
type, the row assembly, and the augmented solve.

## 5. Constraint types

Two forms, both valid, differing in what they pin and how many rows they cost.

### Distance — one row

```math
C \;=\; \tfrac12\big(\lVert d\rVert^2 - L^2\big),
\qquad
\frac{\partial C}{\partial q^i} \;=\; d^{\mathsf T}\frac{\partial d}{\partial q^i}
```

```math
J\ddot q \;=\; -\lVert \dot d\rVert^2 \;-\; \sum_{k,l}\dot q^k \dot q^l\, d^{\mathsf T}\,\partial_k\partial_l\, d
```

Removes one degree of freedom. This is a rigid massless link between two points, free to swing
about both ends — which is what the motivating example's central joining link is.

**Degenerate at $`L = 0`$.** The gradient is $`J^{\mathsf T}d`$, which vanishes identically when
$`d = 0`$: the constraint row becomes all zeros at exactly the configuration it is meant to hold,
and the system goes singular. Distance constraints require $`L > 0`$.

### Coincidence — two rows

```math
C \;=\; d \;=\; 0
```

Removes two degrees of freedom: a true pin joint. Each component is linear in $d$ rather than
quadratic, so there is no degeneracy at the target — this is the form to use when two points must
actually coincide.

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

So $L$ belongs on the constraint from the first commit, defaulted at scene-build time from the
authored geometry, with an explicit override available.

**In physm-rs it has to be explicit anyway.** `Scene::from_json_value` parses `frames` and
`gravity`; the frame types parse `angle`, `children`, `id`, `position`, `resistance` and `weights`.
There is no `initialState` — state arrives separately on every `tick`, so the solver never sees
$`q_0`$. Capturing $L$ implicitly would mean latching a value on the first tick, which is stateful
and wrong across RK4's four stage evaluations.

## 7. Drift, and how it gets fixed later

Constraining at the acceleration level leaves position and velocity violations unobserved. In
exact arithmetic $`C = \dot C = 0`$ would be preserved; in practice each step injects a small
$`\ddot C`$ error that integrates twice, so $`\lVert C\rVert`$ grows secularly.

**In the motivating example the symptom is that the central link's length changes** — the two rope
chains slowly separate or overlap — while every instantaneous acceleration looks correct. It is
visible within a minute of simulation, and it is the expected outcome of the first implementation
rather than a defect in it.

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
   hook into the integrator later is the most expensive of the three to defer.

## 8. What the solver has to tolerate

**The augmented matrix is symmetric *indefinite*, not positive definite.** `algorithm.md` §7 notes
that Cholesky is generically about half the work of the QR currently in use. That is true of $g$
alone and **false the moment constraints exist** — the zero block guarantees negative eigenvalues.
QR, or an $`LDL^{\mathsf T}`$ factorization designed for saddle-point systems, is the
constraint-compatible choice.

**Rank deficiency becomes easy to hit.** Redundant constraints — an over-constrained loop, or two
constraints that pin the same freedom — make $J$ rank-deficient and the whole system singular.
`algorithm.md` §7 already flags `coefficient_matrix.qr().solve(&force_vector).unwrap()` as
ungracious about a singular $g$; constraints make that reachable through ordinary scene authoring
rather than only through a weightless subtree.

## 9. Prior art, and two bugs in it

`physm-py`'s `NaiveSolver._solve` implements exactly this scheme — augmented matrix sized
`nframes + nconstraints`, constraint rows appended, multipliers discarded on return. It is the
right shape, and the 2019 notes record it not working: *"sorta got constraints implemented, but
struggling to get it to produce reasonable results."*

Two defects explain that, and neither is about stabilization.

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

**The lesson for the port is the testable one.** Both real defects are invisible to inspection and
obvious to a finite-difference check: perturb $`q^i`$, compare $`\Delta C/\Delta q^i`$ against the
analytic row. One test on a deliberately branched scene catches both, with no physical intuition
required.

`physm-rs` is also structurally less prone to the indexing defect, because `index_path_map` maps a
global index to a path *of global indices* — a path member already **is** a matrix index, so the
lookup physm-py forgot does not exist as a step to forget.

## 10. Verification

In the order the evidence is worth having:

1. **Finite-difference the Jacobian**, on a branched scene, for both constraint types. This is the
   check that would have caught both 2019 defects.
2. **Assert the constraint is satisfied at the acceleration level** — that $`J\ddot q + \dot J\dot q`$
   is zero to floating-point noise, immediately after a solve. It should hold exactly even while
   $C$ drifts, and separates "the algebra is wrong" from "the integration drifts".
3. **Cross-validate the two implementations.** `physm-js`'s `Solver.test.js` steps `JsSolver` and
   `RsSolver` over the same scene and asserts agreement. It is the only check either solver has
   against an independent implementation of the same equations, and constraint code — new,
   sign-sensitive, and demonstrably easy to get wrong — is where it earns most. **That is the
   argument for implementing constraints in both rather than one.**
4. **Measure the drift.** Record $`\max_t \lVert C(t)\rVert`$ over a fixed scenario. This is the
   number that later shows a stabilization strategy worked.

## Sequencing

Explicit `length` and both constraint types behind one trait; finite-difference and
acceleration-level checks; both implementations, cross-validated; the demo scene; then the drift
measurement. Stabilization strategies are follow-ups, and §7's three seams are what keep them from
being rewrites.
