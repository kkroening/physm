import { historyOf, recorded, redone, undone } from './history';
import type { SceneDocument } from './sceneDocument';
import type { Step } from './history';

/** A document told apart from the others by its name alone. */
function named(root: string): SceneDocument {
  return { root, definitions: [{ name: root, body: [] }] };
}

const [a, b, c, d] = ['A', 'B', 'C', 'D'].map(named) as [
  SceneDocument,
  SceneDocument,
  SceneDocument,
  SceneDocument,
];

/** An edit to `doc`: a prop edit from `field`, or a structural one. */
function edit(doc: SceneDocument, field: string | null = null): Step {
  return {
    doc,
    focus: 'Scene',
    structural: field === null,
    before: null,
    after: null,
    field,
  };
}

describe('history', () => {
  test('undo and redo walk back and forth, and stop at either end', () => {
    const h = recorded(recorded(historyOf(a), edit(b)), edit(c));

    expect(undone(h).present.doc).toBe(b);
    expect(undone(undone(h)).present.doc).toBe(a);
    expect(undone(undone(undone(h)))).toEqual(undone(undone(h)));
    expect(redone(undone(undone(h))).present.doc).toBe(b);
    expect(redone(h)).toBe(h);
  });

  test("a field's run of edits is one step, and another field starts a new one", () => {
    let h = historyOf(a);
    h = recorded(h, edit(b, 'Box/width'));
    h = recorded(h, edit(c, 'Box/width'));
    h = recorded(h, edit(d, 'Box/height'));

    expect(undone(h).present.doc).toBe(c);
    expect(undone(undone(h)).present.doc).toBe(a);
  });

  test('a new edit drops what was undone', () => {
    const h = recorded(
      undone(recorded(recorded(historyOf(a), edit(b)), edit(c))),
      edit(d),
    );

    expect(h.future).toHaveLength(0);
    expect(undone(h).present.doc).toBe(b);
  });

  test('typing again after an undo starts a step of its own', () => {
    let h = historyOf(a);
    h = recorded(h, edit(b, 'Box/width'));
    h = recorded(h, edit(c, 'Box/height'));

    // Back at `b`, which the width field made: more width is a new step, so
    // `b` is still there to come back to.
    h = recorded(undone(h), edit(d, 'Box/width'));

    expect(undone(h).present.doc).toBe(b);
  });

  test('after a redo too', () => {
    let h = historyOf(a);
    h = recorded(h, edit(b, 'Box/width'));
    h = redone(undone(h));
    h = recorded(h, edit(c, 'Box/width'));

    expect(undone(h).present.doc).toBe(b);
  });
});
