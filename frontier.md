# Frontier

The working plan for the scene editor ([0014](docs/issues/0014.md)): what is in
view now, what comes next, and what is further out. Revised freely as the work
teaches things — see [`CLAUDE.md`](CLAUDE.md#the-frontier) for how it is used.

## In view

**Extract to component, and tabs.** Extraction turns a rig laid out from
building blocks into one described by components.

- the selected subtree moves into a new definition, an instance takes its
  place, and the new component opens in its own tab
- a name the generated module could not use is refused as it is typed
- an instance of a defined component opens by double-click, or from the
  properties pane
- ids, a frame's or an anchor's, are scene-wide, so a component whose subtree
  names one cannot be added where its ids are already used -- the MVP's floor.
  Promote-to-prop, or scoping ids per instance, is how such a component becomes
  reusable.

## Next — the MVP

Roughly one PR each.

1. ~~**De-ref the demo**~~ — done
2. ~~**Tree-walk builder**~~ — done
3. ~~**Core metadata**~~ — done
4. ~~**Document model**~~ — done
5. ~~**Codegen**~~ — done
6. ~~**Editor shell**~~ — done
7. ~~**Selection and prop editing**~~ — done
8. ~~**Insert, delete, reorder**~~ — done
9. **Extract to component, and tabs** — *in view*
10. **Play**
11. **Gizmos**

The MVP is through 9: load a scene, see its tree, edit props, add, delete and
reorder nodes, extract a component and reuse it, and export TSX that rebuilds to
the same scene. Play is cheap once the shell exists and may come forward.

## Further out

- Keyboard in the tree, as a tree: a roving tabindex on the tree items, Up and
  Down to move focus, Enter and Space to select. Focus lands on a row with no
  role today, so a screen reader hears nothing when a node is selected.
- Keep the last scene that built drawn, dimmed, under a build error, reset on
  a change of focus. With every keystroke a new document, an edit can pass
  through states that do not build -- retyping a position under a stated
  length, say -- and a blank pane hides what the edit is doing to the rig.
- Take an imported component's tag from the module lookup
  [0014 page 6](docs/issues/0014/06-codegen.md) describes, not from
  `Function.name`, which a production build minifies. Dev builds and the tests
  keep real names, so nothing shows it yet.
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
- **Unique frame ids** — the core `Scene` refuses a frame the tree reaches
  twice, and two frames sharing an id, rather than posing one under the wrong
  parent or letting the toposort drop the other's coordinate.
- **Document model** — a scene held as data: named definitions, one of them the
  scene, each a body of nodes. A component reference says who owns a body
  (core, imported, defined), edits are pure functions returning a new
  document, and nodes are addressed by index path. A document reads from JSX
  without calling anything, and renders back to an element `buildScene`
  builds.
- **Codegen** — a document written out as one TSX module: definitions in
  dependency order with the scene as the default export, props at their
  defaults omitted, a cycle or a prop that is not plain data refused, and each
  node's place in the source recorded. Held to the document by compiling the
  output and rebuilding it.
- **Editor shell** — one document shown five ways at `#editor`, read-only: the
  tab bar, code pane and library global, and the tree, scene and properties
  following the focused tab. A rig that fails to build, or has no consistent
  starting state, says why in the scene pane rather than taking the editor
  down.
- **Selection and prop editing** — a tree row selects its node, and the
  properties pane edits its props with a widget chosen by each prop's
  metadata: a length refuses a negative, an angle and a rotational frame's
  state are shown in degrees, and emptying a field returns a prop to its
  default unless it is required. Every accepted keystroke is a new document.
- **Insert, delete, reorder** — the library adds where the selection says, and
  shows what cannot go there disabled with the reason; the tree's toolbar and
  keys delete and reorder; a new node starts with its required props at their
  initial values; and a building block missing a required prop fails to build
  by name.
