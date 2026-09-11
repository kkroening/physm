import type { SceneDocument } from './sceneDocument';

/** One state the document has been in, and how the edit that made it was made. */
export interface Step {
  readonly doc: SceneDocument;

  /** The tab the edit was made in, which undoing or redoing it returns to. */
  readonly focus: string;

  /** Whether the edit changed the structure: see `useSimulation`. */
  readonly structural: boolean;

  /**
   * The field a prop edit came from, so that a run of keystrokes in one field
   * is one step. `null` for any other edit, and for a step undo or redo has
   * returned to: typing there again starts a step of its own rather than
   * rewriting that one.
   */
  readonly field: string | null;
}

/** Every step so far, and where the editor is among them. */
export interface History {
  /** Oldest first. */
  readonly past: readonly Step[];
  readonly present: Step;

  /** Nearest first: what redo would bring back, in order. */
  readonly future: readonly Step[];
}

/** A history that starts at `doc`, with nothing to undo. */
export function historyOf(doc: SceneDocument): History {
  return {
    past: [],
    present: { doc, focus: doc.root, structural: false, field: null },
    future: [],
  };
}

/**
 * `history` with an edit recorded, and whatever was undone before it dropped.
 *
 * An edit from the same field as the step before it replaces that step rather
 * than stacking on it: page 7 of `docs/issues/0014` has a field's run of
 * keystrokes undo as one.
 */
export function recorded(history: History, step: Step): History {
  const { past, present } = history;

  return step.field !== null && step.field === present.field
    ? { past, present: step, future: [] }
    : { past: [...past, present], present: step, future: [] };
}

/** `history` one step back, or unchanged with nothing to undo. */
export function undone(history: History): History {
  const previous = history.past[history.past.length - 1];

  return previous
    ? {
        past: history.past.slice(0, -1),
        present: { ...previous, field: null },
        future: [history.present, ...history.future],
      }
    : history;
}

/** `history` one step forward, or unchanged with nothing to redo. */
export function redone(history: History): History {
  const [next, ...rest] = history.future;

  return next
    ? {
        past: [...history.past, history.present],
        present: { ...next, field: null },
        future: rest,
      }
    : history;
}
