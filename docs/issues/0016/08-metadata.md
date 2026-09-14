# 8 — Metadata

**Parent:** <a href="../0016.md" title="0016 — Make the document a program rather than a drawing">0016</a>
· **Previous:** [Hand-written components](07-handwritten.md)
· **Next:** [New elements](09-elements.md)

[0014 page 5](../0014/05-metadata.md) argued for schema-first components and the
core nine were built types-first anyway, forced by their core option classes.
The frontier has carried the question open ever since, with the note that
declared components take no props so nothing has yet pressed on it.

This RFC presses on it, and it also narrows what actually has to change.

## User parameters are schema-first by necessity

A definition's parameters are authored *in the editor*, by someone who is not
writing TypeScript. There is no type to reflect, because the thing declaring the
parameter is a document node. So a parameter's name, type, default and label are
data, are edited as data, are emitted into the generated function's signature,
and are read back from it.

That settles the question for the half that matters without touching the core
nine at all. **The core components can stay types-first indefinitely** — their
`meta` is written by hand beside the class it describes, checked by the compiler,
and there is no user pressing on it. What the editor needs is one interface over
both: a description of *a* component's props, satisfied by a hand-written literal
for a core component and by the declaration block for a defined one.

That is a smaller change than "migrate to schema-first", and it is the one the
work requires.

## Algebraic enums

The wish list's `Line` — either start and end, or start and angle and distance —
is a sum type, and the alternatives are worse in familiar ways: distinct
component types multiply combinatorially, and nullable props with
mutual-exclusion rules put the schema in prose where nothing checks it.

The blocking issue is that **the properties pane cannot render a variant picker
for a type it cannot introspect.** A TypeScript discriminated union is erased;
the editor sees whatever the prop spec says, and today a prop spec has a single
`kind`. So a sum-typed prop group needs the variants described as data: a
discriminant, the variants, and the props each carries.

Three consequences follow, and the third is the reason this page exists rather
than a paragraph elsewhere:

- The prop editor gains a variant selector, and switching variants discards the
  props of the one being left — which needs the same treatment as any destructive
  edit, meaning one undo step.
- The emitter writes the props of the live variant and nothing else, and
  `documentFrom` infers the variant from which props are present — so variants
  must be distinguishable by their prop sets, which is a real constraint on how
  they may be declared.
- Expression types and enum variants are the same mechanism seen twice. A
  parameter of kind `Direction`, and a `Line` whose geometry is one of two
  shapes, both need types described as data that the editor can render an editor
  for. Building them separately means building it twice.

**So enums are a nice-to-have whose design is not optional.** Even deferred, the
decision to describe prop types as data has to be taken when parameters are
built, because parameters need it anyway and retrofitting sum types onto a
single-`kind` spec afterwards is the expensive order.
