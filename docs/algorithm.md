# The physm equations of motion

The physm solver is a **product-of-exponentials kinematic tree in SE(2)**, whose mass
matrix is a **mass-weighted pullback metric** and whose right-hand side is a **Christoffel
symbol of the first kind**. This document recovers that structure from the implementation,
maps each invented identifier onto the standard object it computes, and records where the
memoization stops short.

Recovered by reading [`physm-rs/src/solver.rs`](../physm-rs/src/solver.rs) and its
supporting modules in full, with [`physm-py/notes.txt`](../physm-py/notes.txt)
(Nov–Dec 2019) for the provenance of the naming. The `physm-py` and `physm-js`
implementations compute the same thing.

## Contents

1. [Two vocabularies](#1-two-vocabularies)
2. [The kinematic model](#2-the-kinematic-model)
3. [The identity everything rests on](#3-the-identity-everything-rests-on)
4. [Five sweeps](#4-five-sweeps)
5. [Assembly](#5-assembly)
6. [Integration](#6-integration)
7. [Where it stops short](#7-where-it-stops-short)

### Notation

$n$ frames indexed $i, j, k$; $p(i)$ the parent; $`i \preceq j`$ means *"$i$ is an
inclusive ancestor of $j$"* (the `^^` of the 2019 notes); $D(i)$ the subtree rooted at $i$;
$w$ ranges over point masses and $f(w)$ is the frame carrying $w$.

---

## 1. Two vocabularies

The source names came before the terminology. Nothing needs renaming to be rigorous — the
objects were already right.

| Name in `solver.rs` | Standard object | Symbol |
| --- | --- | --- |
| `frame` | One-DOF joint plus its child link; node of the kinematic tree | $i$ |
| `q`, `qd` | Generalized coordinate and velocity — a point of $TQ$ | $`q^i`$, $`\dot q^i`$ |
| `get_local_pos_matrix` | Joint transform, $`L_i(q) = C_i \exp(q\hat\zeta_i) \in SE(2)`$ | $`L_i`$ |
| `pos_mats[i]` | Spatial pose; the product of exponentials along the root path | $`M_i`$ |
| `get_local_vel_matrix` | Joint-transform derivative, $`\partial_q L_i = L_i\hat\zeta_i`$ | — |
| `get_local_accel_matrix` | Second derivative, $`\partial_q^2 L_i = L_i\hat\zeta_i^2`$ | — |
| **`vel_mats[i]`** | **Spatial Jacobian column** — the joint screw pushed into the world frame, $`\mathrm{Ad}_{M_i}\hat\zeta_i \in \mathfrak{se}(2)`$ | $`V_i`$ |
| `accel_mats[i]` | Second-order screw term; equals $`V_i^2`$ exactly ([§4](#4-five-sweeps)) | $`\mathcal{A}_i`$ |
| **`vel_sum_mats[i]`** | **Spatial twist** of body $i$: $`\dot M_i M_i^{-1}`$ | $`S_i`$ |
| **`accel_sum_mats[i]`** | **Bias (velocity-product) spatial acceleration** — the $`\ddot q`$-free part of $`\ddot M_i M_i^{-1}`$ | $`A_i`$ |
| `weight_pos_vecs` | The image of the configuration→physical map $`\varphi`$, evaluated | $`x_w`$ |
| **`coefficient_matrix`** | **Pullback metric** $`g = \varphi^*(\bigoplus_w m_w\delta)`$ — the joint-space inertia, i.e. the mass matrix | $`g_{ij}`$ |
| **`force_vector`** | Generalized force minus the Christoffel term: $`Q_i - \Gamma_{i,jk}\dot q^j \dot q^k`$ | $`f_i`$ |
| `resistance`, `drag` | Rayleigh dissipation coefficients — joint-space and task-space | $`c_i`$, $`b_w`$ |

---

## 2. The kinematic model

`RotationalFrame` and `TrackFrame` look like different animals in the source — one builds a
matrix out of `q.cos()` and `q.sin()`, the other out of a fixed `angle` scaled by `q`. They
are the same object:

```math
L_i(q) \;=\; C_i\,\exp\!\big(q\,\hat\zeta_i\big), \qquad C_i \in SE(2),\quad \hat\zeta_i \in \mathfrak{se}(2)
```

with $`C_i = T(p_i)`$ the constant anchor offset in both cases, and the *constant body-frame
generator* $`\hat\zeta_i`$ being the rotation generator $`\hat J`$ for a revolute frame and
the nilpotent $`\hat n(\alpha)^\flat`$ for a prismatic one. So

```math
M_i \;=\; \prod_{k \preceq i} C_k \exp\!\big(q^k \hat\zeta_k\big)
```

is literally Brockett's **product of exponentials**. No basis was ever chosen; group
elements were composed.

That the prismatic generator is nilpotent, $`\hat\zeta^2 = 0`$, is exactly why `TrackFrame`
never overrides `get_local_accel_matrix` and inherits the `Mat3::zeros()` default — a fact
that reads as an omission in the source and is actually a theorem.

---

## 3. The identity everything rests on

```math
\frac{\partial M_j}{\partial q^i} \;=\; V_i\,M_j \quad (i \preceq j),
\qquad\qquad
V_i \;\equiv\; \frac{\partial M_i}{\partial q^i}M_i^{-1} \;=\; \mathrm{Ad}_{M_i}\hat\zeta_i
```

and $`\partial M_j / \partial q^i = 0`$ whenever $`i \not\preceq j`$.

One 3×3 matrix per degree of freedom differentiates every descendant pose, at any depth, by
left multiplication. That is the whole memoization, stated once. It is also why
`get_vel_mats` multiplies the local derivative by the inverse of the frame's *own global
pose* and then left-multiplies by the parent's pose — an operation that looks unmotivated
in the code and is just $`M_i \hat\zeta_i M_i^{-1}`$, the adjoint action carrying the body
screw into world coordinates.

### Two corollaries do the remaining work

**Second derivatives inherit an ordering.** $`V_i`$ depends only on $`q^k`$ for
$`k \preceq i`$, so for $`i \prec j`$ we get $`\partial_i\partial_j M = V_i V_j M`$ —
*ancestor first*. That asymmetry is real, and it is why `get_accel_sum_mats` carries the
one-sided `2. * qd * vel_sum_mats[parent_index] * vel_mats[index]` rather than an
anticommutator. For $i = j$, $`\partial_i^2 M = \mathcal{A}_i M`$.

**Sparsity is the tree order.** $`\partial_i x_w = 0`$ unless $`i \preceq f(w)`$, which is
precisely the `path_contains` test. The consequence is the classical branch-induced
sparsity of the joint-space inertia matrix: $`g_{ij} \neq 0`$ **if and only if $i$ and $j$
are comparable in the tree order.**

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="figures/tree-sparsity-dark.svg">
  <img alt="A six-node kinematic tree beside the six-by-six sparsity pattern of the mass matrix. Frame 2's ancestor and subtree are highlighted on the tree; the same three frames are the only nonzero entries in row 2 and column 2 of the matrix." src="figures/tree-sparsity-light.svg" width="720">
</picture>

**The same fact, twice.** Left: frame 2's inclusive ancestor (ring) and subtree (shaded) —
the only frames whose motion it shares. Right: $g$ is nonzero exactly on comparable pairs,
so frame 2's row and column carry entries only at 1, 2, 3. Frames 2 and 4 lie on disjoint
branches, and the corresponding blocks are structurally zero — the code never even visits
them, via the `path_contains` guard in `get_coefficient_matrix_entry`.

---

## 4. Five sweeps

All in topological order. `sort_frames` is a reverse post-order, so every parent index
precedes its children — which is also what lets `get_descendent_frames` scan only forward
from its argument.

| # | Function | Object | Recurrence |
| --- | --- | --- | --- |
| 1 | `get_pos_mats` | $`M_i`$ | $`M_i = M_{p(i)}\,L_i(q^i)`$ |
| 2 | `get_vel_mats` | $`V_i`$ | $`V_i = M_{p(i)}\,(\partial_q L_i)\,M_i^{-1}`$ |
| 2′ | `get_accel_mats` | $`\mathcal{A}_i`$ | $`\mathcal{A}_i = M_{p(i)}\,(\partial_q^2 L_i)\,M_i^{-1}`$ |
| 3 | `get_vel_sum_mats` | $`S_i`$ | $`S_i = S_{p(i)} + \dot q^i V_i`$ |
| 4 | `get_accel_sum_mats` | $`A_i`$ | $`A_i = A_{p(i)} + (\dot q^i)^2\mathcal{A}_i + 2\dot q^i S_{p(i)}V_i`$ |
| 5 | `get_weight_pos_vecs` | $`x_w`$ | $`x_w = M_{f(w)}\,r_w`$ |

Sweeps 3 and 4 are prefix sums along the root path, and what they accumulate is the
kinematics of any attached point:

```math
\dot x_w \;=\; S_{f(w)}\,x_w,
\qquad\qquad
\ddot x_w \;=\; \Big(\sum_i \ddot q^{\,i} V_i\Big) x_w \;+\; A_{f(w)}\,x_w
```

The 2019 notes record the reaction to this: *"if these equations are true then this is a
bit miraculous: the velocity of any point can be expressed as a matrix times a local
position — seems too good to be true."* It is true, it is the standard spatial-velocity
representation, and the miracle is only that $`\mathrm{Ad}`$ is a homomorphism.

> [!NOTE]
> **Derived here — not in the source.** Sweep 2′ is redundant: since
> $`\partial_q^2 L_i = L_i\hat\zeta_i^2`$, we get $`\mathcal{A}_i = M_i\hat\zeta_i^2 M_i^{-1} = (M_i\hat\zeta_i M_i^{-1})^2 = V_i^2`$.
> So `get_accel_mats` and the whole `get_local_accel_matrix` trait method carry no
> information beyond sweep 2. Kept general, presumably, against a frame type that is not a
> one-parameter subgroup — neither of the two is such a type.

**The bias term is a sum of Lie brackets.** Expanding the sweep-4 recurrence and comparing
against $`S_i^2`$:

```math
A_i \;=\; S_i^{\,2} \;+\; \sum_{k \,\prec\, l \,\preceq\, i} \dot q^k \dot q^l\,\big[\,V_k,\,V_l\,\big]
```

Coriolis *is* the non-commutativity of the joint screws. The correction to a naive "square
the twist" is exactly the failure of $`\mathfrak{se}(2)`$ to be abelian.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="figures/dataflow-dark.svg">
  <img alt="Dataflow of one solve: five linear-time sweeps feed a shared bus, which feeds an assembly step that costs cubic time, then a QR solve. A dashed sixth sweep, absent from the code, would reduce the assembly to quadratic time." src="figures/dataflow-light.svg" width="880">
</picture>

**Where the cost actually is.** Five linear-time sweeps feed a shared bus; the assembly that
consumes it re-walks each subtree once per matrix entry, which is cubic for a chain. The
dashed box is the sweep that is not there — a single leaf-to-root accumulation of composite
second moments, which is the Composite Rigid Body Algorithm in the same idiom as the other
five. Everything above the bus is recomputed four times per tick under RK4, correctly; the
tree topology is recomputed with it, which is waste.

---

## 5. Assembly

### The coefficient matrix is the pullback metric

```math
g_{ij} \;=\; \sum_{w \,:\, j \preceq f(w)} m_w \,\big\langle V_i x_w,\; V_j x_w\big\rangle
\;=\; \sum_w m_w\,\delta_{ab}\,\partial_i x_w^{\,a}\,\partial_j x_w^{\,b}
\qquad (i \preceq j)
```

With physical space $`\mathbb{R}^2`$ carrying the Euclidean metric $`\delta`$ and each
weight contributing $`m_w\delta`$, this is $`g = \varphi^*\big(\bigoplus_w m_w\delta\big)`$ —
the mass-weighted pullback along $`\varphi : Q \to (\mathbb{R}^2)^W`$. Kinetic energy is
$`T = \tfrac12 g_{ij}\dot q^i\dot q^j`$; the code builds $g$ itself, correctly without the
$`\tfrac12`$, and fills the lower triangle by symmetry. The summation range in
`get_coefficient_matrix_entry` is right because
$`\operatorname{supp}(\partial_i)\cap\operatorname{supp}(\partial_j) = D(j)`$ when
$`i \preceq j`$.

### The force vector is force minus Christoffel

```math
\begin{aligned}
f_i \;=\;\; & \underbrace{\sum_{w \in D(i)} m_w\langle V_i x_w, \mathbf{g}\rangle}_{-\,\partial_i U}
  \;\underbrace{-\sum_w b_w \langle V_i x_w, S_{f(w)}x_w\rangle \;-\; c_i\dot q^i}_{-\,\partial\mathcal{F}/\partial\dot q^i \;\text{(Rayleigh)}} \\[1.4ex]
  & +\; \underbrace{Q_i^{\text{ext}}}_{\text{external}}
  \;\underbrace{-\sum_w m_w\langle V_i x_w, A_{f(w)}x_w\rangle}_{-\,\Gamma_{i,jk}\dot q^j\dot q^k}
\end{aligned}
```

That last group is the local `kinetic_force_vec`, and it is the **Christoffel symbol of the
first kind**, via the identity that holds for any metric induced by an embedding:

```math
\Gamma_{i,jk} \;=\; \tfrac12\big(\partial_j g_{ik} + \partial_k g_{ij} - \partial_i g_{jk}\big)
\;=\; \sum_w m_w \big\langle \partial_i x_w,\; \partial_j\partial_k x_w \big\rangle
```

Which makes `get_system_of_equations` a verbatim statement of the Euler–Lagrange equation in
covariant form, and `solve` a step of forced geodesic flow on $(Q, g)$:

```math
\boxed{\;g_{ij}\,\ddot q^{\,j} \;+\; \Gamma_{i,jk}\,\dot q^{\,j}\dot q^{\,k} \;=\; Q_i\;}
```

The "gnarly simplification" remembered from the original derivation is that Christoffel
identity. It was found by hand, in matrix form, without the name attached.

---

## 6. Integration

`tick_runge_kutta_mut` is textbook **RK4** on $`y = (q, \dot q)`$ with
$`\dot y = (\dot q,\; a(q,\dot q))`$. All four stage combinations check out against the
standard tableau: $`k_1`$ at $`y_0`$, $`k_2`$ at $`y_0 + \tfrac{h}{2}k_1`$, $`k_3`$ at
$`y_0 + \tfrac{h}{2}k_2`$, $`k_4`$ at $`y_0 + hk_3`$, combined
$`\tfrac16(k_1 + 2k_2 + 2k_3 + k_4)`$. It is the default (`runge_kutta: true` in
`Solver::new`), and it calls `solve` — hence all five sweeps — four times per tick.

`tick_simple_mut` is **forward Euler**, not semi-implicit: `q` is advanced using the
pre-step `qd`, so both updates read pre-step state. For an oscillatory mechanical system
that is the one first-order scheme with the wrong energy behaviour — it gains energy every
step. Swapping the two lines would make it semi-implicit Euler and approximately symplectic,
at zero cost.

---

## 7. Where it stops short

### It is a forest, not a DAG — *structural*

`children: Vec<Box<dyn Frame>>` is unique ownership, so no node can have two parents. The
`index_path_map` and `path_contains` machinery *looks* DAG-ready, but `get_index_path_map`
memoizes exactly one path per node and would silently pick an arbitrary one; duplicate frame
ids would collide in `get_id_index_map` rather than error.

The 2019 notes anticipated the DAG — springs relating two frames, a scene graph wider than
the frame tree — and the Rust never got there. For the "arbitrary DAG" ambition this is the
real gap: with multiple parents, $`\partial_i M_j = V_i M_j`$ has to become a sum over the
paths from $i$ to $j$, and the comparability test that gives $g$ its sparsity becomes
reachability.

### Assembly is cubic, and the fix is one more sweep — *complexity*

`get_coefficient_matrix_entry` re-walks the subtree and re-sums its weights for *every* pair
$(i,j)$. But the entry factors:

```math
g_{ij} \;=\; \operatorname{tr}\!\big(V_i^{\mathsf T} V_j\, \mathcal{J}_j\big),
\qquad \mathcal{J}_j \;\equiv\; \sum_{w \in D(j)} m_w\, x_w x_w^{\mathsf T}
```

and $`\mathcal{J}_j = \sum_{\text{own}} m_w x_w x_w^{\mathsf T} + \sum_{c\,\in\,\text{children}} \mathcal{J}_c`$
accumulates in one bottom-up sweep. That is $O(n^2)$ assembly, and it is precisely the
**Composite Rigid Body Algorithm**. The force vector factors the same way —
$`f_i = \langle V_i, \mathcal{K}_i\rangle_F`$ with $`\mathcal{K}`$ accumulated upward —
which is the backward pass of RNEA and makes the right-hand side $O(n)$.

### Static structure is rebuilt every stage — *complexity*

`sort_frames`, `get_index_path_map` and `get_weight_offsets` are pure functions of the
topology, and they run inside every `tick_mut` — so four times per tick under RK4, alongside
the sweeps that genuinely do depend on state. Hoisting them into `Solver` at construction is
free.

### QR on an SPD matrix, with an unwrap behind it — *robustness*

$g$ is symmetric positive definite whenever every degree of freedom moves some mass, so
Cholesky is roughly half the work. More importantly it is *singular* for a frame whose
subtree carries no weights — a legal scene — and
`coefficient_matrix.qr().solve(&force_vector).unwrap()` will not be gracious about that.

---

## Colophon

Results marked **Derived here** are not in the source and were checked against the code's own
recurrences; everything else is a restatement of what `solver.rs` computes.

Figures are committed as light/dark pairs under [`figures/`](figures/) and selected by
`<picture>`; see [`figures/README.md`](figures/README.md) for the colour tokens that
distinguish the two variants.
