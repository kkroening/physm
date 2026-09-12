# 6 · Code generation

<sub>[← Prev: 5 · Component metadata](./05-metadata.md) · [↑ Index](../0014.md) · [Next: 7 · Scene view and properties →](./07-editing.md)</sub>

## The easy half

The document is a tree of `{ type, props, children }`. TSX is a textual notation
for exactly that. Printing one as the other is a recursive walk with an
indentation counter, and it is genuinely as small as it sounds:

```tsx
<TrackFrame id="cart" resistance={5}>
  <RopeChain anchor={[-5.4, -1]}>
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

## Two kinds of name, and they are not the same kind

Easy to conflate, and they answer different questions:

- **`key`** — *which sibling is this?* Structural, scoped to one parent, and the
  document's identity mechanism
  ([page 4](./04-tree.md#identity-and-what-a-row-is-called)). Emitted only when
  explicit; an implicit key is the child index, and there is nothing to write.
- **`id`** — *what is this frame called, scene-wide?* A user-facing name that
  constraints and controls point at: `<Coincidence frame1="left-tip">`, and the
  demo's arrow keys ([0011](../0011.md)). Emitted whenever set, and set by a
  person rather than generated.

The editor should **not** invent ids for every frame. An emitted file where each
of sixty frames carries `id="frame-37"` is noise, and the ids nobody references
are the ones most likely to end up wrong. Ids appear where something names them.

**Neither may be renumbered on re-emit.** A key that shifts when a sibling is
deleted is not an identity, and the symptom is a constraint that silently
reattaches to the wrong frame.

## What the emitted file looks like

**One file, every definition in it**, because that is what the document is
([page 3](./03-focus.md#a-scene-is-a-file-not-a-tree)):

```tsx
import { Circle, Line, RotationalFrame, TrackFrame, Weight } from './react';
import type { ReactElement } from 'react';

const POSITION = [8, 0];

function Pendulum(): ReactElement {
  return (
    <RotationalFrame initialState={[-Math.PI / 2, 0]}>
      <Line endPos={POSITION} lineWidth={0.22} />
      <Circle position={POSITION} radius={0.65} />
      <Weight mass={15} position={POSITION} />
    </RotationalFrame>
  );
}

export default function SomeScene(): ReactElement {
  return (
    <TrackFrame id="cart">
      <Pendulum />
      <Pendulum />
    </TrackFrame>
  );
}
```

**Definitions come out in dependency order, scene root last** — a topological
sort of "who instantiates whom", which terminates because
[cycles are refused at the gesture](./03-focus.md#three-operations-that-need-rules).
Only the root is exported; the rest are file-local, because nothing outside the
file refers to them.

⚠️ **That is what the emitter actually produces today** — printed from it
rather than written by hand, which is the only way this block stays true. Four
things in it are worth naming, because an earlier version of this page showed
none of them: the repeated point is declared once and used by name; the angle
prints as `-Math.PI / 2` rather than the `-1.5707963267948966` it evaluated to;
`position={[0, 0]}` is absent, because a prop equal to its declared default is
not written; and the scene is the module's `default` export.

Imports are derived from what the file actually uses, split by where it came
from: the core vocabulary from `./react`, prefabs from their own modules, and
**type imports** for the annotations the emitter itself writes. The document
holds **function identities**, so the emitter knows exactly which module each
component came from with no name resolution to guess at — and an editor-created
component needs no import at all, because it is defined a few lines up.

The type import matters more than it looks: `physm-js` runs `tsc --noEmit` in
CI, so a generated file missing one does not merely look untidy, it fails to
build.

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

## Two mitigations, both built

- **A named constant when a value repeats.** `[1.4, 0]` written three times
  becomes `const TIP = [1.4, 0]` — except for the name, which cannot be `TIP`:
  the first row above is exactly the loss of it, so the name comes from the
  prop that carries the value. Three uses rather than two, because two can be
  a coincidence of layout rather than one value used twice; and only on the
  building blocks, whose prop types are known to accept a value inferred on
  its own, where an imported component's are not.
- **Round-number formatting.** `-1.5707963267948966` is emitted as
  `-Math.PI / 2`: a multiple of π over a small denominator, when one matches
  the value exactly.

What the first of them recovers is a good part of the first row, not the row
itself. What is lost there is the *fact* that several uses were one value, and
counting cannot tell that from a coincidence -- which is why the threshold is a
judgement rather than a rule, and why a document that recorded the sharing
would end the guessing rather than tune it.

## Highlighting

The code pane should highlight the selection, which needs the emitter to record a
**source range per document node** as it prints. That is a few lines — track the
offset before and after each node — and it is much easier to add while writing
the emitter than to retrofit by searching the output afterwards. Worth doing on
the first pass even though the highlighting itself can come later.

---
<sub>[← Prev: 5 · Component metadata](./05-metadata.md) · [↑ Index](../0014.md) · [Next: 7 · Scene view and properties →](./07-editing.md)</sub>
