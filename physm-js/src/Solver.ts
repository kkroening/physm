import type { FrameId, StateMap } from './Frame';
import type Scene from './Scene';
import { NotImplementedError } from './utils';

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

  constructor(scene: Scene) {
    this.scene = scene;
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
