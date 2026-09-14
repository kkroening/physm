# 6 — Structure that computes

**Parent:** <a href="../0016.md" title="0016 — Make the document a program rather than a drawing">0016</a>
· **Previous:** [Addressing](05-addressing.md)
· **Next:** [Hand-written components](07-handwritten.md)

Two features let the document's *shape* depend on something rather than being
written out in full.

## Multiple slots

A definition's body may hold at most one `Children` placeholder today. The wish
list's `DualAntennaCart` — two poles, each taking its own children — wants
several, and is right that there is no fundamental reason for the limit.

**On the definition side** this is small: the placeholder gains an optional name,
and several may appear. The existing rules carry over unchanged — a placeholder
still cannot be deleted while an instance holds children in it, still cannot be
extracted from its component, and children are still held to the rules of the
frame the placeholder sits in.

**On the instantiation side** the question the wish list leaves open is how a
caller says which children go where. Named is better than positional, for the
reason named arguments are generally better: positional binding silently
re-targets everything when the author adds a slot, and a slot is exactly the kind
of thing that gets added. In the tree view an instance with named slots shows its
slots as grouping rows, with children beneath each; in the emitted TSX they are
props holding elements, which is how React expresses the same thing and is
already round-trippable.

The real cost is not here — it is that a node's children stop being one list,
which is [page 5](05-addressing.md)'s subject.

## Repetition

The wish list's `pendulumCount`: a `Pendulum` inside a `RotationalFrame`, and
inside that `Pendulum` another, N deep.

**It is two features, and one name hides them.** The pendulum case is *nesting* —
each copy is placed inside the previous one, and the result is a chain. A picket
fence is *siblings* — N copies beside each other in the same parent. They expand
differently, they compose differently, and the second is much the easier of the
two. Whatever these end up called, they should not be one node with a mode flag
that nobody can predict the behaviour of; "Repeat" and "Chain" are closer to
honest than "NestedForLoop".

**The count is structural.** [Page 2](02-values.md) argues why it has to be, and
the argument is load-bearing rather than cautious: frames carry state, the state
map is keyed by frame id, and a count that varied per tick would re-key it every
tick. So the count is an expression over parameters and constants, which is
exactly what makes it implementable.

**The tree shows the template, the scene shows the expansion.** This is the part
that sounds hardest and is already solved: it is precisely what an instance of a
defined component does today. The tree view holds `Chain` with one `Pendulum`
beneath it; the scene holds N pendulums; a click on the fourth selects — by
default — the authored `Pendulum`, with Shift reaching the expansion, which is
the behaviour that already exists for instances.

### Repetition makes [0005](../0005.md) blocking

Sibling order in an authored scene is *first-registration* order, which equals
JSX order only for a tree whose shape never changes. A repetition node changes
the shape by construction: raising the count appends, and the newcomer takes
registration order rather than the position it occupies in the tree.

For decals that is paint order; for frames it is more than cosmetic. So 0005
stops being a latent question about conditional mounting and becomes a
prerequisite for this feature behaving predictably. Worth resolving *before*
repetition rather than discovering it through a rig whose pendulums draw in the
wrong order.

### What it emits

The round-trip rule from [page 1](01-overview.md) bites hardest here, and it is a
good filter. A chain of N has to emit as TSX that `documentFrom` can read back as
a `Chain` node rather than as N nested literals — otherwise the first round trip
silently unrolls the loop and the parameter stops meaning anything. That most
likely means the emitted form is a real construct (a helper the binding exports,
or a recursive component) rather than an expansion, and it is worth deciding
*that* before the editor-side work, because it is the constraint that decides
what the node can be.
