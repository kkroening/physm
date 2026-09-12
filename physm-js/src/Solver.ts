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
function isValidStateMap(stateMap: StateMap): boolean {
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
   * On by default. Unstabilized, this formulation *conserves* a violation
   * exactly -- `C(t) = C₀ + Ċ₀t` -- so a rig looks correct for a minute and
   * then comes apart, quietly and in a way that looks like a modelling
   * mistake. The opposite error costs a solve per step and shows up in a
   * profile.
   *
   * Turn it off to observe that conservation, which is what distinguishes a
   * drift caused by inconsistent initial velocities from one caused by
   * integration error. Each solver runs its own projection: `Scene.getStabilizedState`
   * for `JsSolver`, `stabilize_mut` inside the wasm tick loop for `RsSolver`.
   */
  readonly stabilize: boolean;

  constructor(scene: Scene, { stabilize = true }: SolverOptions = {}) {
    this.scene = scene;
    this.stabilize = stabilize;
  }

  /**
   * Apply the stabilizer, for a solver that integrates on this side.
   *
   * `JsSolver` calls this per step. `RsSolver` does not: `physm-rs` runs the
   * same projection inside its own tick loop, so its `tickCount` still crosses
   * the wasm boundary once. The two are held to the same trajectory by
   * cross-validation rather than by sharing code.
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
