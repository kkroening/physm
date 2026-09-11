# Frontier

The working plan for the scene editor ([0014](docs/issues/0014.md)): what is in
view now, what comes next, and what is further out. Revised freely as the work
teaches things — see [`CLAUDE.md`](CLAUDE.md#the-frontier) for how it is used.

## In view

**Tree-walk builder.** `buildScene(element)`: walk an element tree, call each
composite with its props, and build a `Scene` from the core components it bottoms
out in — with no renderer, no effects and no second render.

- each core binding component exposes how it builds, as data both the walker
  and the mounted component use, so the two cannot drift
- composites are called; the binding's own components are not
- sibling order is JSX order by construction, which is what
  [0005](docs/issues/0005.md) asks for
- the assembly pass is shared too, not only the per-component builds:
  anchors are collected, a name meaning both an anchor and a frame is refused,
  and only then are constraints built -- one rule, whichever route runs it
- checked against the mounted route: `buildScene(<CartAndRope />)` must equal
  what `<Scene>` assembles — same frames, decals, weights and constraints, in
  the same order

## Next — the MVP

Roughly one PR each.

1. ~~**De-ref the demo**~~ — done
2. **Tree-walk builder** — *in view*
3. **Core metadata** — prop schemas for the nine core components
4. **Document model** — a module of definitions, immutable edits, element ↔
   document conversion
5. **Codegen** — document → TSX, with a compile-and-rebuild round trip
6. **Editor shell** — tab bar, code, tree, scene, properties, library; read-only
7. **Selection and prop editing**
8. **Insert, delete, reorder** from the library
9. **Extract to component, and tabs** — anchor ids are scene-wide and
   duplicates are refused, so extraction has to deal with an id it captures:
   refuse the subtree, promote the id to a prop, or scope ids per instance
10. **Play**
11. **Gizmos**

The MVP is through 9: load a scene, see its tree, edit props, add, delete and
reorder nodes, extract a component and reuse it, and export TSX that rebuilds to
the same scene. Play is cheap once the shell exists and may come forward.

## Further out

- Scene picking and dragging
- Promote to prop
- Code pane highlighting, and scroll-once on focus change
- Codegen polish: round numbers (`-Math.PI / 2`), constants for repeated values
- The constraint-first direction ([0014 page 9](docs/issues/0014/09-horizon.md))

## Decisions

- **A structural edit resets simulation state; a prop edit carries it over.**
  Recorded in [0014 page 8](docs/issues/0014/08-play.md#editing-while-it-runs).
  *(Karl, 2026-09-11)*

## Done

- **De-ref the demo** — `<Anchor id>` names a point, a constraint end resolves
  an anchor id before a frame id, and `CartAndRope` calls no hooks. A test walks
  every composite in the rig outside a render.
