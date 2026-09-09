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
   * Off by default, and that is deliberate rather than cautious. Unstabilized,
   * this formulation *conserves* a constraint violation exactly -- `C(t) = C₀ +
   * Ċ₀t` -- which is a documented, tested property and the diagnostic that
   * tells a drift caused by inconsistent initial velocities apart from one
   * caused by integration error. Stabilizing by default would erase the
   * distinction and leave no way to measure whether the stabilizer works.
   *
   * ⚠️ **The default is a decision deferred, not one made** -- see
   * `docs/issues/0013.md`. Nothing currently depends on it: every test passes
   * this flag explicitly in both directions, and the demo passes `true`. The
   * argument against it is that a forgotten `stabilize` fails quietly -- the rig
   * looks right for a minute and then comes apart, which is the bug the
   * stabilizer was added to remove.
   *
   * See `Scene.getStabilizedState`.
   */
  readonly stabilize: boolean;

  constructor(scene: Scene, { stabilize = false }: SolverOptions = {}) {
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
