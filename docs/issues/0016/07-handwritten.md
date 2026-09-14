# 7 — Hand-written components

**Parent:** <a href="../0016.md" title="0016 — Make the document a program rather than a drawing">0016</a>
· **Previous:** [Structure that computes](06-structure.md)
· **Next:** [Metadata](08-metadata.md)

A definition is either a **tree** the editor edits directly, or **source** the
author types and the editor compiles. Drilling into a composite offers the
switch: as source, the code pane becomes editable and the tree view becomes
read-only, which is the mirror of how a visual definition works today.

## This is the pressure valve, and that is an argument for doing it early

The obvious reading is that this is a convenience for people who would rather
type. The more useful reading is that **it converts every unbuilt feature on this
list from a blocker into an inconvenience.**

If repetition is six months away, `PendulumCart` can be hand-written this month
and the rest of the scene stays visual. If an expression the language does not
have is needed once, the definition that needs it becomes source. Nothing waits
on the subset growing, which takes the schedule pressure off every other page in
this RFC — and schedule pressure on a language design is how languages acquire
features they regret.

It is also unusually independent: it touches the definition boundary and the
build path, and almost nothing else in this RFC. It can land while the addressing
change is still being argued about.

## Why it is much simpler than bidirectional editing

There is **one source of truth per definition**, chosen explicitly by the author.
A tree definition's truth is its tree; a source definition's truth is its source.
Nothing reconciles, nothing merges, no comment survives a round trip it was never
put through.

The mixing works because `buildScene` already calls composites. A scene that is a
tree, containing a hand-written `PendulumCart`, containing a visual `Pendulum`,
is three definitions of two kinds, and the builder does not care which is which —
it calls what it is given and assembles what comes back.

## What it costs

**A compiler in the browser.** `esbuild-wasm` is the natural pick: Vite already
uses esbuild, physm already loads and links wasm, and the build step is a
transform rather than a bundle — JSX and types out, JavaScript in.

**A module registry.** The author writes `import { RotationalFrame } from
'physm/react'`, and the runtime has to hand back the real components rather than
resolving a path. That is a small map, and it doubles as the definition of what
a hand-written component is allowed to reach: the binding, and other definitions
in the same document.

**A worker for the compile — and an unsolved hazard for the call.** The hazard is
not malice: it is the author's own code, and there is nothing to defend against
that they could not do more easily in the console. The hazard is a `while (true)`
that hangs the editor with no way back.

Compiling in a worker under a deadline is straightforward, because `esbuild-wasm`
produces a *string* and a string crosses the boundary happily. **Calling the
component there does not work.** Its return value is an element tree whose `type`
fields are function references handed back by the registry above, and structured
clone throws on a function — so nothing resembling that tree can be posted back.

The call therefore happens on the main thread, which is precisely where the hang
is: the worker would be protecting the step that was never at risk. The ways out
(building inside the worker and posting serialized scene data, reviving a
plain-data element description against the registry, or accepting the hazard and
making it recoverable some other way) are each larger than this bullet, and
[page 11](11-risks.md) carries it as open rather than as handled.

**An error surface.** A compile error and a runtime throw are both ordinary
states for a definition being typed into, and they should read like the existing
build failure: the pane says why, the last scene that built stays on screen, and
nothing takes the editor down. That machinery exists.

## The one-way door

Switching a definition from source back to tree keeps what the function
*produced* and discards how it was written — comments, names, structure, any
computation that is not expressible in the subset.

That is the same loss the emitter already takes in the other direction, and this
codebase has been honest about it before: [0014 page 6](../0014/06-codegen.md)
concedes that a name the author wrote is gone with the rest of how the file was
written, and the constants heuristic exists to recover a shadow of it. So the
warning should say what is lost rather than warn in the abstract, and it should
be the kind that can be dismissed for good rather than the kind that trains
people to click through.

Capture itself is not new work: `nodesFrom` and `documentFrom` already read JSX
into a document, and are what `starterDocument` is built from. What is new is
doing it to the *result of calling a function* rather than to a literal, which is
the same thing `buildScene` does and the same authored-versus-expanded boundary
[0014 page 2](../0014/02-document.md) already draws.

## What it changes about the document's meaning

Honestly: something real. Today the document fully describes the scene, and that
is a property worth naming before it goes. With a source definition in it, the
document describes the scene **only if you run it** — which is true of any
program and is the trade this whole RFC makes, but it arrives here first and
most visibly.

Two consequences worth stating rather than discovering. A source definition is
opaque to the editor's structural operations — extract-to-component, insertion
rules, the tree's drag and drop — and its instances can still be manipulated
because an instance is a node like any other. And the round-trip discipline
changes shape: a source definition's TSX *is* its document, so it round-trips
trivially, while the guarantee that the whole document is reconstructible from
its own output now holds per definition rather than globally.
