import { NotImplementedError } from './utils';
import { required } from './utils';

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
