# Frontier

The working plan for the scene editor ([0014](docs/issues/0014.md)): what is in
view now, what comes next, and what is further out. Revised freely as the work
teaches things — see [`CLAUDE.md`](CLAUDE.md#the-frontier) for how it is used.

## In view

**De-ref the demo.** `CartAndRope` holds its two rope tips in `useRef` so its
`<Coincidence>` can name them, and a hook cannot run outside a render — so a
tree walk cannot evaluate the demo at all.

- `<Anchor id="left-tip" />` registers its point under that id
- a constraint end that names an anchor id resolves to the anchor's point,
  before falling back to a frame of that id
- `CartAndRope` uses ids and calls no hooks

## Next — the MVP

Roughly one PR each.

1. **De-ref the demo** — *in view*
2. **Tree-walk builder** — `buildScene(element)` with no renderer, checked
   against the mounted route on the demo
3. **Core metadata** — prop schemas for the nine core components
4. **Document model** — a module of definitions, immutable edits, element ↔
   document conversion
5. **Codegen** — document → TSX, with a compile-and-rebuild round trip
6. **Editor shell** — tab bar, code, tree, scene, properties, library; read-only
7. **Selection and prop editing**
8. **Insert, delete, reorder** from the library
9. **Extract to component, and tabs**
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

Nothing yet.
