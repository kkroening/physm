import { NotImplementedError } from './utils';
import { required } from './utils';

export class InvalidStateMapError extends Error {
  constructor(message) {
    super('Encountered invalid state map');
    this.name = 'InvalidStateMapError';
  }
}

export function isValidStateMap(stateMap = required('stateMap')) {
  return [...stateMap].every(([frameId, [q, qd]]) => !isNaN(q) && !isNaN(qd));
}

export function checkStateMapValid(stateMap = required('stateMap')) {
  if (!isValidStateMap(stateMap)) {
    throw new InvalidStateMapError();
  }
}

export default class Solver {
  constructor(scene = required('scene')) {
    this.scene = scene;
  }

  dispose() {}

  getStateMap() {
    throw new NotImplementedError('abstract method');
  }

  setStateMap(stateMap = required('stateMap')) {
    throw new NotImplementedError('abstract method');
  }

  resetStateMap() {
    this.setStateMap(this.scene.getInitialStateMap());
  }

  tick(
    deltaTime = required('deltaTime'),
    tickCount = 1,
    externalForceMap = null,
  ) {
    throw new NotImplementedError('abstract method');
  }
}
