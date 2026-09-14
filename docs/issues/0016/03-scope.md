# 3 — Scope and the port surface

**Parent:** <a href="../0016.md" title="0016 — Make the document a program rather than a drawing">0016</a>
· **Previous:** [Structural values and signals](02-values.md)
· **Next:** [Expressions](04-expressions.md)

Expressions need something to refer to. This page is about what that is, and the
short version is: **a definition has a declared surface of named ports, and
references are lexical.** No globals.

## Physm has already run the experiment

The wish list worries that a globally unique name for a direction would be
"playing with fire, just like relying on globals in general". That worry is
confirmed by this codebase's own history, twice over.

`<Anchor id="...">` names a point so a constraint end can reference it by id.
That is a global namespace — the core `Scene` refuses two frames sharing an id —
and the consequence is already recorded on the frontier: a component that names
an id **cannot be instantiated twice**. Two pendulums, one `Anchor`, one id, and
the scene refuses to build. The recorded options are *promote to prop* or *scope
ids per instance*, and they are the same question this page answers.

[0011](../0011.md) is the second run of the experiment, from the other side: the
demo needs to push the cart from outside the scene, so it reaches in by id, and
the rig "has to break its own story exactly once, and the app has to hold the
string it broke it with". That is not a naming inconvenience — it is a missing
surface. A scene that wanted to expose a push had no way to say so, so the app
guessed a string.

**Both are solved by the same thing: a definition declares what it takes and what
it offers, and everything else is private.**

## The surface

A definition's ports come in three kinds, and it is worth seeing them together
because the wish list arrives at them separately:

**In — parameters.** Typed, named, with an optional default. `Pendulum` takes
`length: Scalar`. `PendulumCart` takes `pendulumCount: Integer` and
`pendulumLength: Scalar`. A direction imported from elsewhere is a parameter of
kind `Direction`, which is what the wish list reasons its way to and is right
about: the dependency becomes explicit at the instantiation, the definition stays
self-contained, and there is nothing global to collide.

**Out — outputs.** Named values a caller may read: a point, a direction, a frame.
`Pendulum` offers `bobPosition`. Each output declares whether it is structural or
a signal ([page 2](02-values.md)), because the caller's use of it is constrained
by which.

**Both — manipulators and force channels.** A manipulator is a port that *reads*
a value and *writes it back*: the handle shows where a parameter currently puts
something, and dragging it edits that parameter. A force channel is an in-port
that carries a signal at run time rather than a value at build time — the thing
0011 needed. Both are declared by the definition's author, which is the point:
nothing can guess which of a deeply nested component's knobs deserve a handle in
the caller's scope, so the author says.

## Names in the caller's scope

An instance may be given a local name — `leftPendulum` — and that name is how its
outputs are reached: `leftPendulum.bobPosition`. The name is **lexically scoped
to the definition that holds the instance**, which is what makes it safe where an
id is not. Two definitions may both name something `leftPendulum` without
consulting each other, and a definition instantiated twice gets two independent
scopes.

The same applies to the other node kinds the wish list wants to reference: a
`Distance` constraint given the name `tether` offers `tether.endPosition`; a
manipulator named `armHandle` is referenced by that name in the sibling
expressions that consume it.

This is also what finally makes an `Anchor`'s id an implementation detail: an
anchor inside a definition gets a scoped name, and the emitter generates a unique
id per instantiation rather than asking the author to.

## Parameters and ports as tree nodes

The wish list proposes that props appear as nodes in the tree view, confined to
the top of a definition's body before any component nodes. That is right, and it
generalises: **the declaration block is the port surface**, holding parameters,
outputs, manipulators and force channels, with component nodes beneath it.

It buys three things. The tree view becomes a complete picture of a definition
rather than of its body only. The declarations get the same editing machinery —
select, edit properties, reorder, delete — as everything else, instead of a
separate dialogue. And the emitter has an obvious target: the declaration block
is the function's signature and its `return`'s surroundings.

## Types

Ports are typed, and the types are the thing the wish list gestures at with
"String, Position, Direction, TangentVector; exact names TBD; but one should be
aware that a point with direction is a distinct thing from just a point or just a
direction".

That awareness is the right one and the resolution is to keep them separate:
`Point` and `Direction` are different types because they transform differently —
a point is affected by translation and a direction is not, which is exactly the
homogeneous-coordinate distinction `vec3.point` and `vec3.direction` already
make in this codebase. A "point with direction" is a `Frame`, which is a third
thing and is also already a concept here.

So the starting type set is small and drawn from what the code already
distinguishes: `Scalar`, `Integer`, `Angle`, `Point`, `Direction`, `Frame`, and a
`Label` for the few genuinely textual props. [Page 8](08-metadata.md) covers where
these are declared and why user parameters force that to be data rather than
TypeScript.

## Key bindings are scene-level ports

A key binding is not a property of the component that ends up moving. It is a
statement at the scene level that a key contributes a signal, routed by an
expression, into a named force channel — `cart.trackForce`. Keeping the binding
at the top and the channel at the leaf is what lets the wish list's "more
elaborate expressions for the forces" work: the routing expression sits where it
can see the whole scene, and the channel stays a local declaration of what the
component is willing to be pushed by.

The demo already does a crude version of this — `App.jsx` maps pressed keys to an
external force map — so there is a working prototype to generalise from rather
than a blank page.
