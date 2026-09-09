# 8 · Play

<sub>[← Prev: 7 · Scene view and properties](./07-editing.md) · [↑ Index](../0014.md) · [Next: 9 · The constraint-first horizon →](./09-horizon.md)</sub>

## The pipeline

```
document  →  expansion  →  Scene  →  Solver  →  frames
(authored)   (evaluate)    (build)   (step)     (draw)
```

Only the first arrow is new. The rest is what the demo already does, and the
editor's scene view is the demo's `<SceneView>` with gizmos on top.

**Play does not change what is displayed** — it changes who is writing the state
map. Paused, the scene view draws the document's authored initial states; running,
it draws the solver's. Same renderer, same geometry, different source of `q`.

**It is scene-wide, not per-tab.** There is one simulation, of the whole module,
however deep you happen to be focused — so a `Pendulum` tab shows *that*
pendulum's frames moving as part of the running rig. Simulating a focused
component in isolation is a different feature, and a tempting one; it would need
a decision about what the world outside it is doing, and this RFC does not take
it.

This is why [0006](../0006.md) — assembly without a renderer — is a prerequisite
rather than a nicety. The editor needs a `Scene` from a document _while showing
that document in the editor's own React tree_, and mounting a second renderer
inside an `<svg>` to get one is not a workable answer.

## Editing while it runs

The good version of this is live: change `segmentCount` while the rope is
swinging and watch it change. That needs a rebuild, and a rebuild raises the
question of what happens to the state.

**Frame identity decides it, and the identity is a path rather than a name.** A
frame in the expansion traces back through every component instance that
produced it — its **instantiation path**, the sequence of keys or indices from
the scene root down. That is well-defined for every frame, including the ones
inside a composite that names none of them.

Rebuild the scene, then carry each frame's `[q, q̇]` across by that path:

- **path present in both** → carry the state over. The rope keeps swinging.
- **path only in the new scene** → use its authored initial state. A new segment
  appears at rest, which is what a person expects.
- **path only in the old scene** → drop it.

An explicit `id` is a *better* key where one exists, because it survives the
frame moving somewhere else entirely. Prefer it, and fall back to the path —
which is most frames, since
[page 6](./06-codegen.md#two-kinds-of-name-and-they-are-not-the-same-kind)
argues against inventing ids nothing references.

The result is that most edits do not interrupt the simulation at all, and that is
worth a great deal — it turns the editor into an instrument for the thing that is
genuinely hard to reason about, which is what a change *does* to a rig in motion.

**It also demands that identity be stable across a rebuild**, which is
[page 4](./04-tree.md#identity-and-what-a-row-is-called)'s key-path requirement
arriving from a second direction. An identity that shifts on edit makes every
edit a reset, and the failure is not loud — the rig just quietly restarts.

⚠️ **Positional identity is where this leaks.** Delete the second of five rope
segments and every segment below shifts up one index, so each inherits its
neighbour's velocity. The result is not a crash; it is a rope that twitches for
no visible reason. That is the strongest argument for the editor assigning an
explicit `key` as soon as a node is reordered or deleted around, rather than
waiting to be asked.

## When carrying state over is wrong

Two cases where it should not:

- **The carried state violates a constraint the edit introduced.** Adding a
  `<Coincidence>` between two frames that are currently far apart hands the
  solver an inconsistent state, which the stabilizer will then yank shut. That is
  arguably correct and looks like an explosion. Better: on adding a constraint,
  re-run the consistency step and say so.
- **A frame's meaning changed.** Same path, but the author retyped it from a
  `TrackFrame` to a `RotationalFrame`; `q` was metres and is now radians.
  Carrying the number over is nonsense. **Identity is (path, kind)**, and a
  changed kind is a new frame.

## What a paused editor still needs from the solver

Even stopped, the editor wants two things the solver can answer, and both are
diagnostics rather than simulation:

- **"This scene cannot move."** [0002](../0002.md)'s pinned scene — reachable
  from the most natural two-armed rig there is, and whose only symptom is that
  nothing happens. Reported at edit time, that is a squiggle under the offending
  constraint. Discovered at play time, it is a mystery.
- **"These constraints cannot all hold."** The over-determination check already
  throws; the editor should surface it as you wire the constraint rather than on
  the first tick.

Both are the same shape: **the editor is the first consumer that can afford to
run a check before the simulation starts**, and it should, because it is also the
first context where the person who caused the problem is sitting right there.

---
<sub>[← Prev: 7 · Scene view and properties](./07-editing.md) · [↑ Index](../0014.md) · [Next: 9 · The constraint-first horizon →](./09-horizon.md)</sub>
