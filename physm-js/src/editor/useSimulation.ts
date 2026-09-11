import JsSolver from './../JsSolver';
import { InvalidStateMapError } from './../Solver';
import { STEP, carryOver, stepsFor } from './simulation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type CoreScene from './../Scene';
import type { StateMap } from './../Frame';

/** What the scene pane needs to run a scene, and to draw it running. */
export interface Simulation {
  /** The state to draw, or `null` for the scene's initial state. */
  readonly stateMap: StateMap | null;
  readonly playing: boolean;

  /** Whether there is a run to reset: it has been played at least once. */
  readonly started: boolean;

  /** Why the run stopped, when it stopped on its own. */
  readonly error: string | null;

  readonly play: () => void;
  readonly pause: () => void;
  readonly reset: () => void;
}

/**
 * What a run that diverges says. The solver's own message names its internals;
 * the person needs what happened to the rig, and what to do about it.
 */
const DIVERGED =
  'The simulation diverged: a coordinate stopped being a number. Reset starts ' +
  'it over.';

/** A run: the scene it belongs to, where it is, and the structure it began in. */
interface Run {
  readonly scene: CoreScene;
  readonly map: StateMap;
  readonly structure: number;
}

function messageOf(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

/**
 * Run a built scene forward in time, one animation frame at a time.
 *
 * Every edit builds a new scene, and the run moves to it: carried over, frame
 * by frame, when `structure` -- the editor's count of structural edits -- has
 * not changed, and started over when it has. Karl's decision in
 * `docs/issues/0014/08-play.md`: a prop edit leaves the motion alone, and a
 * structural edit resets it. `JsSolver`, because the editor's scenes are small
 * and it needs no wasm module loaded first.
 *
 * No scene -- an edit that does not build, or a tab with nothing to play --
 * stops the run and keeps it, so the next scene that builds takes it up by the
 * same rule. A run that diverges stops and says so, rather than starting over
 * where nobody asked it to.
 */
export default function useSimulation(
  built: { scene: CoreScene; initial: StateMap } | null,
  structure: number,
): Simulation {
  const scene = built?.scene ?? null;
  const initial = built?.initial ?? null;
  const solverRef = useRef<JsSolver | null>(null);
  const structureRef = useRef(structure);
  structureRef.current = structure;
  const [run, setRun] = useState<Run | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Computed while rendering, not in an effect: a prop edit made while the rig
  // swings would otherwise show one frame of the authored pose before the run
  // caught up with it.
  const stateMap = useMemo(() => {
    if (!run || !scene || !initial) {
      return null;
    }

    if (run.scene === scene) {
      return run.map;
    }

    return run.structure === structure
      ? carryOver(run.scene, run.map, scene, initial)
      : null;
  }, [run, scene, initial, structure]);

  /** A solver for the current scene, starting from what is drawn. */
  const solverHere = (): JsSolver | null => {
    if (!scene) {
      return null;
    }

    try {
      const solver = new JsSolver(scene);
      if (stateMap) {
        solver.setStateMap(stateMap);
      }

      solverRef.current = solver;
      setRun({ scene, map: solver.getStateMap(), structure });
      return solver;
    } catch (caught) {
      solverRef.current = null;
      setRun(null);
      setPlaying(false);
      setError(messageOf(caught));
      return null;
    }
  };

  // A new scene: move the run to it, if there is one. With no scene, the run
  // stops where it is and waits for the next.
  useEffect(() => {
    if (!scene) {
      setPlaying(false);
    } else if (solverRef.current && solverRef.current.scene !== scene) {
      solverHere();
    }

    // `solverHere` reads `stateMap` and `structure`, which change with every
    // tick and every edit; the move is owed only when the scene does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  // The loop, while playing.
  useEffect(() => {
    if (!playing) {
      return undefined;
    }

    let frame = 0;
    let last: number | null = null;
    let carry = 0;
    const advance = (now: number): void => {
      const solver = solverRef.current;
      const elapsed = last === null ? 0 : (now - last) / 1000;
      last = now;
      const { steps, carry: left } = stepsFor(elapsed, carry);
      carry = left;
      if (solver && steps) {
        try {
          solver.tick(STEP, steps);
        } catch (caught) {
          setError(
            caught instanceof InvalidStateMapError
              ? DIVERGED
              : messageOf(caught),
          );
          setPlaying(false);
          return;
        }

        setRun({
          scene: solver.scene,
          map: solver.getStateMap(),
          structure: structureRef.current,
        });
      }

      frame = requestAnimationFrame(advance);
    };

    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  return {
    stateMap,
    playing,
    started: run !== null,
    error,
    play: () => {
      if (solverRef.current?.scene === scene || solverHere()) {
        setError(null);
        setPlaying(true);
      }
    },
    pause: () => setPlaying(false),
    reset: () => {
      const solver = solverRef.current;
      if (solver) {
        solver.resetStateMap();
        setRun({ scene: solver.scene, map: solver.getStateMap(), structure });
      }
    },
  };
}
