# 11 · Risks

<sub>[← Prev: 10 · Staging](./10-staging.md) · [↑ Index](../0014.md)</sub>

Ordered by how much they would cost, not how likely they are.

## The ones that would change the design

**Purity is a rule with no enforcement.** [Page 2](./02-document.md#what-expanded-costs)
requires components to be pure functions of their props, and nothing stops one
from using a hook. The failure is quiet: the editor shows one tree, the
simulation runs another, and they disagree in a way that looks like a physics
bug. *Mitigation:* expand twice in development and compare; a lint rule banning
hooks in anything with `defineComponent`. Neither is free, and the second is the
kind of rule that gets disabled.

**The emitted source may be unmaintainable enough that nobody uses it.**
[Page 6](./06-codegen.md#what-is-lost-precisely) is honest that `SWEEP`,
`SEGMENT_COUNT` and `TIP` come back as inlined literals. If the export is
something people paste once and then hand-rewrite, the editor is a sketching tool
rather than an authoring tool. It would still be worth having — but it is a
smaller thing than it sounds like now, and the constant-extraction mitigation is
a guess at how much that helps rather than a measurement.

**The prop-type vocabulary may not close.** [Page 5](./05-metadata.md#what-the-prop-types-have-to-cover)
lists seven kinds and asserts they cover the scene vocabulary. That is an
assertion from one demo rig. If real scenes want expressions, per-instance
overrides, or props that depend on other props, the schema grows toward being a
language, and schemas that grow toward being languages are a well-known way to
lose a year.

**Positional identity leaks into the simulation.** Identity is the key path
([page 4](./04-tree.md#identity-and-what-a-row-is-called)), and an implicit key
is an index — so deleting a node shifts every sibling after it, and
[page 8](./08-play.md#editing-while-it-runs)'s state-carrying hands each one its
neighbour's velocity. The symptom is a rig that twitches rather than one that
breaks, which is the worse kind. *Mitigation:* assign explicit keys on reorder
and delete. That is a heuristic about when identity *ought* to be pinned, and
heuristics about intent are where this will be wrong occasionally.

## The ones that would cost time

**The expansion presentation is a guess.** [Page 2](./02-document.md#where-the-two-trees-meet)
picks slots over faithful nesting on reasoning, not evidence. It is the design's
most user-facing judgment call and the one most likely to be wrong in a way only
use reveals — which is why the read-only tree view is
[step 4](./10-staging.md#an-order-that-produces-something-usable-early), early
enough to find out cheaply.

**Referential integrity is a second data structure, and now there are two.**
Named references
([page 5](./05-metadata.md#references-have-to-become-names)) make the document a
tree plus an index; component definitions
([page 3](./03-focus.md#three-operations-that-need-rules)) add a second, from
definition to instantiation site, maintained across rename, delete, extract and
undo. This is where a tree editor usually acquires its first real bugs, and
there are twice as many places for them.

**Extraction has a scope question the model says cannot arise.** The claim is
that a subtree is closed — literals and instances, nothing captured from an
enclosing scope ([page 3](./03-focus.md#extract-to-component)) — which follows
from a document being all literals. It is exactly the kind of invariant that
holds until the first feature that breaks it, and
[page 6](./06-codegen.md#two-mitigations-worth-building-neither-urgent)'s
shared-constant idea would break it directly.

**Scene picking may be fiddlier than budgeted.** Gizmos make it tractable;
overlapping frames, coincident origins and the composite-ancestor walk are each
small and there are several. *Mitigation:* the tree is always the failsafe, so
this can ship late or badly without blocking anything.

## The ones I am not worried about

Listed because leaving them out would look like an oversight rather than a
judgment:

- **Codegen correctness.** It is a tree walk with a round-trip test.
- **Performance.** The demo has twelve frames. An editor redrawing a tree of a
  few hundred nodes is not a problem this decade.
- **Undo.** Free if the document is replaced rather than mutated, and
  [step 5](./10-staging.md#an-order-that-produces-something-usable-early) does
  that from the start.

## The overall read

**The design is sound and the risk is concentrated where it can be tested
first.** Both premises the project rests on — that the element tree reproduces
the mounted scene, and that emitted source rebuilds to the same scene — are
falsifiable in the first two steps, before a single pane exists.

**The altitude question is settled, and was worth asking.** An earlier draft
ended here on *which kind of scene is this for* — the composite-heavy rig with
nothing to click, or the flat pile of primitives. The answer is **both**, and the
mechanism is [page 3](./03-focus.md): expansion for looking, focus for editing,
extraction for moving a rig from the second kind toward the first. That is a
better resolution than picking a side, and the design got there from the question
rather than the other way round.

**What remains genuinely uncertain is the product**: whether an editor whose
output you paste once is worth building. The strongest evidence for is that a rig
laid out in the editor is editable all the way down, so the tool is not confined
to toys. The strongest evidence against is that nobody has built a rig in it, and
the only rig that exists is one nobody would have built this way.

---
<sub>[← Prev: 10 · Staging](./10-staging.md) · [↑ Index](../0014.md)</sub>
