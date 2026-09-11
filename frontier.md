# Frontier

The working plan for the scene editor ([0014](docs/issues/0014.md)): what is in
view now, what comes next, and what is further out. Revised freely as the work
teaches things — see [`CLAUDE.md`](CLAUDE.md#the-frontier) for how it is used.

## In view

**Core metadata.** A static `meta` on each of the nine core components: its
name, category, the slot it fills, and a spec for every prop — kind, label,
default, whether it is required.

- a prop with no spec is a compile error, not a gap found at runtime
- `meta.name` is stated rather than read off the function, because production
  builds minify `Function.name`
- a default is only a default if omitting the prop and stating it build the
  same scene — one test per default
- what may contain what is answered once, and agrees with the builder at the
  root

## Next — the MVP

Roughly one PR each.

1. ~~**De-ref the demo**~~ — done
2. ~~**Tree-walk builder**~~ — done
3. **Core metadata** — *in view*
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

- **De-ref the demo** — `<Anchor id>` names a point, a constraint end names it
  by that id, and `CartAndRope` calls no hooks. A test walks every composite in
  the rig outside a render.
- **Tree-walk builder** — `buildScene(element)` builds a `Scene` from JSX with
  no renderer: composites are called, each core component states how it builds
  as data the mounted binding shares, and siblings take JSX order. Both routes
  refuse two anchors sharing an id, and a name meaning both an anchor and a
  frame, through the same helpers. Checked against the mounted route on the
  demo rig and on every prop. Resolves [0006](docs/issues/0006.md).
