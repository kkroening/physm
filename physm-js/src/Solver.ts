import type { FrameId, StateMap } from './Frame';
import type Scene from './Scene';
import { NotImplementedError } from './utils';

/** What every solver accepts, whatever it integrates with. */
export interface SolverOptions {
  stabilize?: boolean;
}

/** An external generalized force per frame, as the interactive demo supplies. */
export type ExternalForceMap = Map<FrameId, number> | null;

export class InvalidStateMapError extends Error {
  constructor() {
    super('Encountered invalid state map');
    this.name = 'InvalidStateMapError';
  }
}

/**
 * Whether every coordinate is still a number.
 *
 * A scene that diverges produces `NaN` rather than a large value, and `NaN`
 * propagates silently through every subsequent step -- so it is worth catching
 * at the tick that produced it rather than at the render that shows nothing.
 */
export function isValidStateMap(stateMap: StateMap): boolean {
  return [...stateMap].every(
    ([, [q, qd]]) => !Number.isNaN(q) && !Number.isNaN(qd),
  );
}

export function checkStateMapValid(stateMap: StateMap): void {
  if (!isValidStateMap(stateMap)) {
    throw new InvalidStateMapError();
  }
}

/**
 * What every integrator implementation has in common: a scene, a state, and a
 * way to advance it.
 */
export default class Solver {
  readonly scene: Scene;

  /**
   * Whether to pull the state back onto the constraint manifold after a tick.
   *
   * **On by default, because the two failure modes are not symmetric.**
   * Unstabilized, this formulation *conserves* a constraint violation exactly --
   * `C(t) = C₀ + Ċ₀t` -- so a rig looks correct for a minute and then comes
   * apart. That is quiet, slow, and indistinguishable from a modelling mistake;
   * it is the bug report the stabilizer was written for. Stabilizing a scene
   * that did not need it costs a solve per step and is visible in a profile.
   *
   * The argument for defaulting off was that the unstabilized behaviour is a
   * *diagnostic* -- it is what tells a drift caused by inconsistent initial
   * velocities apart from one caused by integration error. That is true and the
   * diagnostic is worth keeping, but a default is the wrong place to keep it:
   * the tests that rely on it say `stabilize: false` in as many words, which is
   * both more legible and immune to the default moving again.
   *
   * The deciding case is the one that does not exist yet. An interactive scene
   * builder assembles rigs with nobody to know this flag exists -- and "the
   * author must opt in to the constraints holding" is a worse contract than
   * "the author must opt out to measure the drift".
   *
   * Settled in `docs/issues/0013.md`; see `Scene.getStabilizedState`.
   */
  readonly stabilize: boolean;

  constructor(scene: Scene, { stabilize = true }: SolverOptions = {}) {
    this.scene = scene;
    this.stabilize = stabilize;
  }

  /**
   * Apply the stabilizer, if this solver has one.
   *
   * Here rather than in each integrator because it needs only `getStateMap` and
   * `setStateMap`, which every solver has -- so the JavaScript and Rust
   * integrators get the same correction from the same code, rather than two
   * implementations that could disagree.
   */
  applyStabilization(): void {
    if (this.stabilize) {
      this.setStateMap(this.scene.getStabilizedState(this.getStateMap()));
    }
  }

  dispose(): void {}

  getStateMap(): StateMap {
    throw new NotImplementedError('abstract method');
  }

  setStateMap(_stateMap: StateMap): void {
    throw new NotImplementedError('abstract method');
  }

  resetStateMap(): void {
    this.setStateMap(this.scene.getInitialStateMap());
  }

  tick(
    _deltaTime: number,
    _tickCount = 1,
    _externalForceMap: ExternalForceMap = null,
  ): void {
    throw new NotImplementedError('abstract method');
  }
}
