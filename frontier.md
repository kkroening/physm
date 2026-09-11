# Frontier

The working plan for the scene editor ([0014](docs/issues/0014.md)): what is in
view now, what comes next, and what is further out. Revised freely as the work
teaches things — see [`CLAUDE.md`](CLAUDE.md#the-frontier) for how it is used.

## In view

**Document model.** The editor's scene, held as data: a set of named
definitions, one of them the scene, each a body of nodes -- a component
reference, props, an optional key, children.

- a component reference says who owns the body: core (the binding's), imported
  (an opaque function), or defined (this document's, editable all the way down)
- edits are pure functions returning a new document -- set a prop, insert,
  remove, move -- so undo is a stack of past documents
- nodes are addressed by index path, since a node reference goes stale with the
  first edit
- element to document and back: reading JSX calls nothing, and a document
  renders to an element `buildScene` builds like hand-written JSX

## Next — the MVP

Roughly one PR each.

1. ~~**De-ref the demo**~~ — done
2. ~~**Tree-walk builder**~~ — done
3. ~~**Core metadata**~~ — done
4. **Document model** — *in view*
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

- Refuse children under a non-frame in `buildScene`. They are dropped silently
  today, which changes the answer rather than the picture -- for a document,
  only `canContain` stands in the way.
- Types first or schema first, for components the editor declares? The core
  nine are types-first, forced by their core option classes, while
  [0014 page 5](docs/issues/0014/05-metadata.md) argues schema-first. Declared
  components take no props until promote-to-prop, so it stays open -- Karl's
  call.
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
  as data the mounted binding shares, and siblings take JSX order. The assembly
  around those builds is one function both routes call, differing only in
  whether an unbuildable constraint waits or throws. Checked against a
  hand-built scene on every prop of every component, and against the mounted
  route on the demo rig and after every prop changes. Resolves
  [0006](docs/issues/0006.md).
- **Core metadata** — each of the nine building blocks carries a static `meta`:
  its tag, category, slot, description, and a spec per prop: kind, label, and
  a default, or `required` -- with an `initial` to insert, except a
  constraint's ends, which a person picks. A spec is typed by its prop, a
  missing one is a compile error, `coreComponents` lists the nine, and
  `canContain` says where each may go. Every default is checked by building
  with the prop omitted and with it stated.
- **Unique frame ids** — the core `Scene` refuses two frames sharing an id,
  rather than letting its toposort keep one and drop the other's coordinate.
