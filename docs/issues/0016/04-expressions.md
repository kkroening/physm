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
- Arithmetic on scalars and angles; vector construction and component access; a
  handful of geometric operations — add, scale, rotate and dot, which `Vec3` and
  `Mat3` already have, plus normalise and perpendicular, which they do not and
  which are a few lines each.
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

**That check is load-bearing rather than a nicety, and it became so when the two
kinds started sharing one node set.** While structural expressions were host
arithmetic, a signal could not be written into a structural prop — there was no
syntax for naming a pose-derived value in an expression the host evaluates. Now
`length={mul(bobVelocity, 2)}` is perfectly writeable, and kind propagation is
the only thing between it and a scene that re-assembles every tick. So it lands
*with* the node set, not after it.

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

## What the emitter writes

**Constructor form, not host arithmetic.** A prop holding *halfLength × 2*
emits as `mul(halfLength, 2)`, and a structural one emits the same way. The
emitted module is still ordinary TSX — `mul` is a function the binding exports —
but what it builds is an **expression node**, not a product.

```tsx
function Pendulum({
  halfLength,
  children,
}: {
  halfLength: number;
  children?: ReactNode;
}): ReactElement {
  const bob = vec(0, neg(mul(halfLength, 2)));

  return (
    <RotationalFrame initialState={[-0.6, 0]} resistance={0.4}>
      <Line endPos={bob} lineWidth={0.15} />
      <Weight mass={10} position={bob} />
      <FixedFrame position={bob}>{children}</FixedFrame>
    </RotationalFrame>
  );
}
```

**This reverses an earlier decision, and the reason is signals.** The first
version of this page said an expression emits as `halfLength * 2`, on the
grounds that the emitted module should read like source a person wrote. That
holds for a *structural* expression, whose only job is to produce a number
before the build consumes it. It cannot hold for a **signal**, which has no
value at emit time and must survive as a graph — and JavaScript offers no way to
write an edge with `*`.

So the choice was one syntax for structural and another for signals, or one
syntax for both. One is better, and the cost is verbosity in the near term.

The `FixedFrame` is what keeps a place for children at the bob, so a pendulum
hung from this one pivots on its ball — it is in the starter document for that
reason, and an emitted `Pendulum` without it would build a different scene from
the one it came from.

And `bob` bound once and used three times is the sharing this page argues for,
in the form it takes in source: one object, three references, which is a DAG
edge rather than three identical subtrees.

**Why a constructor survives evaluation when arithmetic does not.** `mul(a, b)`
does not multiply. It returns `{ kind: 'mul', a, b }` — an expression node, the
way `createElement` returns an element rather than rendering one. So evaluating
it is what *builds* the graph rather than what destroys it, which is why the
same form works in a hand-written component, in the emitted module, and as the
document's own storage.

That also means `mul(x, y)`, `<Multiply a={x} b={y}/>` and the object literal are
three spellings of one thing. **Calls are the right spelling for expressions** —
JSX earns its shape on scene trees, where the nesting is structure you want to
see, and loses badly on `sqrt(add(pow(x, 2), pow(y, 2)))`.

**Structural is the same graph, evaluated eagerly.** A structural expression is
a signal graph whose inputs happen not to vary, so `buildScene` walks it and
collapses it to a value. Overkill for `mul(halfLength, 2)`, and worth it for
having one node set, one type system, one graph pane, and one thing for the prop
editor to parse into.

**Literals stay literals.** A leaf is already a valid node, so `position={[4, 0]}`
emits unchanged rather than as `vec(lit(4), lit(0))`. Verbosity is proportional
to how much computation a document contains, which today is none — the starter
document emits byte-identically.

**The surface syntax is unaffected.** Someone typing into a prop box still
writes `halfLength * 2`, or `sqrt(x**2 + y**2)`. The editor parses it to the same
graph either way; only the *printed* form is the constructor. A DSL that
collapses the emitted form back to infix is pure sugar and can arrive whenever —
and in JavaScript it will always need a parser, because there is no operator
overloading and a Proxy cannot intercept arithmetic.

**A parameter is a value at call time, not a node**, and it is worth saying so
rather than leaving it to be inferred. The alternative would let a *reference*
survive evaluation, which sounds attractive and costs too much: a hand-written
component could no longer write `if (halfLength > 3)`. That is structural
branching on a parameter — which is what makes a tree's shape depend on one, and
is repetition written by hand — and a `Select` node cannot stand in for it,
because `Select` chooses a value where this chooses a shape.

So this does **not** make a computed prop recoverable. A constructor call does
survive into what `documentFrom` reads, but by then `halfLength` is an ordinary
binding holding a number, so what survives is `mul(4, 2)` — the operation, over
an operand the host already folded. And a definition's body is never read back
at all, since `documentFrom` yields one definition. [0017](../0017.md)'s three
reasons for a save format all stand.

_(Karl, 2026-09-16, reversing his 2026-09-14 call, by first-principles reasoning
about what a signal forces.)_

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
