# 10 · Risks

<sub>[← Prev: 9 · Staging](./09-staging.md) · [↑ Index](../0014.md)</sub>

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
[Page 5](./05-codegen.md#what-is-lost-precisely) is honest that `SWEEP`,
`SEGMENT_COUNT` and `TIP` come back as inlined literals. If the export is
something people paste once and then hand-rewrite, the editor is a sketching tool
rather than an authoring tool. It would still be worth having — but it is a
smaller thing than it sounds like now, and the constant-extraction mitigation is
a guess at how much that helps rather than a measurement.

**The prop-type vocabulary may not close.** [Page 4](./04-metadata.md#what-the-prop-types-have-to-cover)
lists seven kinds and asserts they cover the scene vocabulary. That is an
assertion from one demo rig. If real scenes want expressions, per-instance
overrides, or props that depend on other props, the schema grows toward being a
language, and schemas that grow toward being languages are a well-known way to
lose a year.

## The ones that would cost time

**The expansion presentation is a guess.** [Page 2](./02-document.md#where-the-two-trees-meet)
picks slots over faithful nesting on reasoning, not evidence. It is the design's
most user-facing judgment call and the one most likely to be wrong in a way only
use reveals — which is why the read-only tree view is
[step 4](./09-staging.md#an-order-that-produces-something-usable-early), early
enough to find out cheaply.

**Referential integrity is a second data structure.** Named references
([page 4](./04-metadata.md#references-have-to-become-names)) mean the document is
a tree plus an index, and every edit has to maintain both. Delete, re-parent,
rename and undo all touch it. This is where a tree editor usually acquires its
first real bugs.

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
  [step 5](./09-staging.md#an-order-that-produces-something-usable-early) does
  that from the start.

## The overall read

**The design is sound and the risk is concentrated where it can be tested
first.** Both premises the project rests on — that the element tree reproduces
the mounted scene, and that emitted source rebuilds to the same scene — are
falsifiable in the first two steps, before a single pane exists.

**What is genuinely uncertain is not the architecture but the product**: whether
an editor whose output you paste once is worth building, and whether the
composite-heavy way this repo writes scenes leaves enough for direct manipulation
to act on. `CartAndRope` is one authored node with an anchor prop; there is not
much in it to click. A rig assembled from core pieces would have plenty. Which
kind of scene the editor is *for* is the question worth settling before step 4,
and it is a question about intent rather than about code.

---

<sub>[← Prev: 9 · Staging](./09-staging.md) · [↑ Index](../0014.md)</sub>
