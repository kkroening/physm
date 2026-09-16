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
props holding elements, which is how React expresses the same thing.

**That form is new work in both directions**, not something already supported.
`emitScene`'s `literal()` walks a plain object's entries and would reach a React
element's `$$typeof`, which it refuses as a symbol; and the reader descends into
`children` only, so an element-valued prop would come back as opaque data rather
than as nodes. This is the widening [page 1](01-overview.md) promises at every
step, and it is most of what named slots cost.

The real cost is not here either. A node's children stay **one ordered list** —
[page 5](05-addressing.md) is where that is argued — so what this costs is the
optional label, the list-boundary arithmetic that goes with it, and the emitter
and reader work above.

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

### What [0005](../0005.md) does and does not have to do with this

The tempting claim is that repetition makes 0005 blocking: sibling order is
*first-registration* order, which equals JSX order only for a tree whose shape
never changes, and a repetition node changes the shape by construction.

**It does not hold for the path repetition will run in.** The editor builds
through `buildScene`, whose docstring lists this as the first of its deliberate
differences from mounting — sibling order is JSX order, always, because a walk
has no registration to go by. There is no registry to race and no newcomer to
mis-order; a re-walk reads the whole tree in order every time.

What is real is narrower. Emitted TSX is meant to be mounted by a consumer, and a
consumer that mounts it under `<Scene>` and changes a count prop at run time gets
first-registration order for the newcomers. That is the pre-existing
conditional-mounting case, and repetition supplies one more way to reach it
rather than creating it. So 0005 stays worth fixing, on its own schedule, and
this feature does not wait for it.

### What it emits

The emission rule from [page 1](01-overview.md) bites hardest here, and it is a
good filter. A chain of N has to emit as a real construct — a helper the binding
exports, or a recursive component — rather than as N nested literals. Unrolling
would build the right scene on the first pass and lose the parameter, so the
count would stop meaning anything the moment anyone read the file.

It is worth deciding *that* before the editor-side work, because it is the
constraint that decides what the node can be.

Worth noting which way the reader cuts here, since it is the opposite of
[expressions](04-expressions.md): an **element** survives being read back, because
JSX is a data literal and a composite is not called until build, so
`<Chain count={3}>` arrives as a `Chain` with `count: 3`. A **prop** does not,
because the runtime evaluates it before the element exists. That asymmetry is a
fact about where evaluation happens, not a design choice, and it is why the
emitted *form* for repetition is worth more thought than its emitted *count*.
