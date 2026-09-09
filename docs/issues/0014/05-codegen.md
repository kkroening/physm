# 5 · Code generation

<sub>[← Prev: 4 · Component metadata](./04-metadata.md) · [↑ Index](../0014.md) · [Next: 6 · Scene view and properties →](./06-editing.md)</sub>

## The easy half

The document is a tree of `{ type, props, children }`. TSX is a textual notation
for exactly that. Printing one as the other is a recursive walk with an
indentation counter, and it is genuinely as small as it sounds:

```tsx
<TrackFrame id="cart" resistance={5}>
  <RopeChain anchor={[-5.4, 1]}>
    <Pendulum />
  </RopeChain>
</TrackFrame>
```

Four things make the output look written rather than serialized, and all four are
cheap:

- **Omit defaulted props.** Metadata knows the default, so `mirror={false}` never
  appears. Without this the output is unreadable within a few nodes.
- **Emit strings as strings.** `id="cart"`, not `id={'cart'}`.
- **Self-close childless elements**, and never emit `children` as an attribute.
- **Hand the result to Prettier**, which the repo already runs. Codegen should
  produce *correct* text and let the formatter produce *canonical* text; the
  alternative is reimplementing line-breaking decisions that already have an
  owner and a CI check.

## Identity, and why nodes need ids

Two independent needs, both landing on the same mechanism:

- **Frames need ids for constraints and controls.** `<Coincidence frame1="…">`
  names one; so do the demo's arrow keys ([0011](../0011.md)).
- **Simulation state survives an edit by frame id** — see
  [page 7](./07-play.md).

So an authored frame carries a stable id from the moment it is created, and
codegen emits it. Generated ids should be readable and derived from the
component (`rope-chain-1`, not `n7`) — they end up in the source, and a person
reading the emitted file should be able to tell what a constraint is pointing at.

**Ids must never be renumbered on re-emit.** A stable id that changes when a
sibling is deleted is not a stable id, and the symptom is a constraint that
silently reattaches to the wrong frame.

## What the emitted file looks like

Not one giant expression. The unit is a **component**, because that is the unit
the document already has:

```tsx
import { Circle, Line, RotationalFrame, Weight } from "./react";

export function Pendulum(): ReactElement {
  return (
    <RotationalFrame position={[0, 0]} initialState={[-1.5708, 0]}>
      <Line endPos={[8, 0]} lineWidth={0.22} />
      <Circle position={[8, 0]} radius={0.65} />
      <Weight mass={15} position={[8, 0]} />
    </RotationalFrame>
  );
}
```

Imports are derived from the set of component types actually used — the document
holds function identities, so the emitter knows exactly which module each came
from, with no name resolution to guess at.

## What is lost, precisely

This is the honest list, and it is the cost of
[page 2](./02-document.md#jsx-is-a-data-literal-not-a-call)'s trick. The document
is what the source **evaluated to**, not how it was **written**, so everything
between those two is gone:

| Written                                   | Comes back as                 | Verdict                                                |
| ----------------------------------------- | ----------------------------- | ------------------------------------------------------ |
| `const TIP = [1.4, 0]` … `position={TIP}` | `position={[1.4, 0]}`         | **Lost.** The constant is gone; every use is inlined   |
| `{items.map(x => <Seg …/>)}`              | five sibling `<Seg>` elements | **Unrolled.** The loop is gone                         |
| `{show && <Foo/>}`                        | `<Foo/>`, or nothing          | **Collapsed** to whichever branch this evaluation took |
| `// comments`                             | nothing                       | **Lost**                                               |
| `-Math.PI / 2`                            | `-1.5707963267948966`         | **Evaluated**, and prints as a decimal                 |
| import aliases, file layout               | canonical form                | **Normalized**                                         |

The first and last rows are the ones that will actually hurt. `CartAndRope.tsx`
is built out of named constants — `SWEEP`, `SEGMENT_COUNT`, `TIP` — and its whole
readability rests on them. Round-tripping it through the editor would return
correct code that nobody wants to maintain.

**Which is why the workflow is one-way and the editor is for layout.** You lay a
rig out, emit it, and then the source is the source. Re-emitting over a
hand-refined file is not a supported operation, and the editor should say so
plainly at the moment of export rather than letting someone discover it.

## Two mitigations worth building, neither urgent

- **Emit a named constant when a value repeats.** `[1.4, 0]` appearing six times
  becomes `const TIP = [1.4, 0]`. Mechanical, and it recovers a good part of what
  the first row loses.
- **Round-number formatting.** `-1.5707963267948966` should be emitted as
  `-Math.PI / 2` when it matches to within float64. A small table of recognized
  constants covers most of what a scene contains, and the alternative is a file
  full of seventeen-digit decimals.

## Highlighting

The code pane should highlight the selection, which needs the emitter to record a
**source range per document node** as it prints. That is a few lines — track the
offset before and after each node — and it is much easier to add while writing
the emitter than to retrofit by searching the output afterwards. Worth doing on
the first pass even though the highlighting itself can come later.

---

<sub>[← Prev: 4 · Component metadata](./04-metadata.md) · [↑ Index](../0014.md) · [Next: 6 · Scene view and properties →](./06-editing.md)</sub>
