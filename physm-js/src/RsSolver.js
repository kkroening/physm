import Solver from './Solver';
import { required } from './utils';

export default class RsSolver extends Solver {
  constructor(scene = required('scene'), rsWasmModule = required('rsWasmModule')) {
    super(scene);
    // TODO: serialize scene as json and create rs scene.
    const sceneJson = JSON.stringify(scene.toJsonObj());
    console.log('[js] Creating solver context');
    this.context = new rsWasmModule.SolverContext(sceneJson);
    console.log('[js] Created solver context:', this.context);
  }

  dispose() {
    console.log('[js] Disposing solver context');
    this.context.dispose();
    console.log('[js] Disposed solver context');
    this.context = null;
  }

  tick(
    stateMap = required('stateMap'),
    deltaTime = required('deltaTime'),
    externalForceMap = null,
  ) {
    console.log(`[js] RsSolver.tick: deltaTime=${deltaTime}`);
    this.context.tick(deltaTime);
    return stateMap;
  }
}
