# 4 — Expressions

**Parent:** <a href="../0016.md" title="0016 — Make the document a program rather than a drawing">0016</a>
· **Previous:** [Scope and the port surface](03-scope.md)
· **Next:** [Addressing](05-addressing.md)

The wish list asks for expressions "not just in an `eval` / code injection
manner, but rather in a way that physm understands the overall AST-like
structure / graph relationship". That is the right requirement and it rules out
the two easy implementations — storing a string and evaluating it, or storing a
string and parsing it on demand — in favour of the expression *being* the stored
form.

## A DAG, not a tree

**Store expressions as a graph with node identity, not as a tree.** This is the
cheapest decision on the list to get right now and among the most expensive to
change later.

An expression tree cannot say that two props hold *the same* value — only that
they hold equal values. A graph can, because a reference is an edge to a node
that already exists. Three things want that:

- **The visual graph editor.** A blueprint-style view of a tree is a view in
  which shared subexpressions cannot be drawn, because there is nothing to draw
  them as. Either the view is a lie, or common-subexpression detection gets
  bolted on to reconstruct the sharing that was discarded on the way in.
- **Named intermediates.** "Compute the rod length once and use it in four
  places" is the ordinary way anyone writes anything, and it is a node with four
  in-edges.
- **`emitScene`'s constants heuristic, which is a symptom of this gap.** It
  hoists a compound value written three times or more into a named constant
  because the document cannot record that two props *are* one value. It guesses,
  it can guess wrong in both directions, and the frontier already notes that what
  would end it is "the document recording that several props hold one value".
  Expression identity is that recording. The heuristic can then be deleted rather
  than tuned.

## What is in the language

Small, and filtered by a useful test: **every construct has to survive being
drawn as a node graph.**

- Literals of each port type.
- References: to parameters, to a named instance's outputs, to named
  intermediates.
- Arithmetic on scalars and angles; vector construction and component access;
  the handful of geometric operations that already exist in `Mat3` and `Vec3` —
  add, scale, rotate, normalise, dot, perpendicular.
- Comparison and selection, for enum discriminants and conditional structure.

Not in it: statements, loops, user-defined functions, recursion, string
manipulation. Repetition is a *structural* node ([page 6](06-structure.md)), not
an expression construct, precisely so that the count remains something the
editor can evaluate and the tree view can show.

Anything beyond this is what [page 7](07-handwritten.md) exists for.

## Typed, and typed in two dimensions

Every expression node carries a port type — `Scalar`, `Point`, `Direction`,
`Frame` — and a kind, structural or signal ([page 2](02-values.md)). Both are
checked, and both are checked *while editing* rather than at build:

- A `Direction` cannot be added to a `Point` and then used as a length.
- A signal cannot appear where a structural value is required, which is what
  stops someone writing a repetition count that reads the cart's velocity and
  discovering the problem only when the solver re-assembles.

The kind propagates the obvious way: an expression is a signal if any of its
inputs is.

## Editing it three ways

The wish list wants the same expression editable as text, as a graph, and
eventually as code. The first two are the same data viewed differently, which is
what storing a graph buys:

- **In the properties pane**, as text. The pane parses to the graph on accept and
  renders the graph back to text for display. Parsing failure is a refusal to
  accept the edit, in the same style as the length field that refuses a negative.
- **In a graph pane**, as nodes and edges — the Unreal-blueprint view. This is
  deferred, but nothing about it is blocked once the representation is a graph;
  it is a second renderer of stored data, not a second source of truth.
- **As emitted code**, one-way, like everything else the editor writes. Reading
  edited code back is the bidirectional problem [page 1](01-overview.md) declines.

## Cycles

References make cycles possible: `a` reads `b.x` while `b` reads `a.y`.
`emitScene` already refuses a cycle among definitions, so the shape of the answer
exists — a topological pass with an error that names the participants rather than
recursing until the stack gives out. Worth building with the feature rather than
after the first hang, since an expression graph makes cycles reachable by
ordinary editing rather than by perversity.

## What this replaces

Today a prop is plain data. The change is to make a prop value a tagged thing —
a literal *or* an expression reference — and that indirection is worth
introducing **before** it has a second case, while there is exactly one variant
and the change is mechanical. Doing it later means touching every prop site
twice. [Page 10](10-staging.md) puts it first for that reason.
