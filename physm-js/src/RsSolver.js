import Solver from './Solver';
import { required } from './utils';

export default class RsSolver extends Solver {
  constructor(scene = required('scene'), rsWasmModule = required('rsWasmModule')) {
    super(scene);
    // TODO: serialize scene as json and create rs scene.
    const sceneJson = JSON.stringify(scene.toJsonObj());
    console.log('[js] Creating solver context');
    this.context = rsWasmModule.create_solver_context(
      JSON.stringify(scene.toJsonObj()),
    );
    console.log('[js] Created solver context:', this.context);
  }

  dispose() {
    // TODO: free rs scene.
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
