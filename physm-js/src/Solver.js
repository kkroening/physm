import { NotImplementedError } from './utils';
import { required } from './utils';

export default class Solver {
  constructor(scene = required('scene')) {
    this.scene = scene;
  }

  dispose() {}

  tick(
    stateMap = required('stateMap'),
    deltaTime = required('deltaTime'),
    externalForceMap = null,
  ) {
    throw new NotImplementedError('abstract method');
  }
}
