import Solver from './Solver';
import { required } from './utils';

export default class RsSolver extends Solver {
  constructor(
    scene = required('scene'),
    rsWasmModule = required('rsWasmModule'),
  ) {
    super(scene);
    // TODO: serialize scene as json and create rs scene.
    const sceneJson = JSON.stringify(scene.toJsonObj());
    console.log('[js] Creating solver context');
    this.context = new rsWasmModule.SolverContext(sceneJson);
    this.stateBuffer = new Float64Array(this.scene.sortedFrames.length * 2);
    console.log('[js] Created solver context:', this.context);
  }

  dispose() {
    console.log('[js] Disposing solver context');
    this.context.dispose();
    console.log('[js] Disposed solver context');
    this.context = null;
  }

  _flattenStateMap(stateMap = required('stateMap')) {
    this.stateBuffer.set(
      this.scene.sortedFrames.flatMap(
        (frame) => stateMap.get(frame.id) || [0, 0],
      ),
    );
  }

  _unflattenStateMap() {
    return new Map(
      this.scene.sortedFrames.map((frame, index) => [
        frame.id,
        [this.stateBuffer[index * 2], this.stateBuffer[index * 2 + 1]],
      ]),
    );
  }

  tick(
    stateMap = required('stateMap'),
    deltaTime = required('deltaTime'),
    externalForceMap = null,
  ) {
    //console.log(`[js] RsSolver.tick: deltaTime=${deltaTime}`);
    this._flattenStateMap(stateMap);
    //console.log('[js] stateBuffer before:', this.stateBuffer);
    this.context.tick(this.stateBuffer, deltaTime);
    //console.log('[js] stateBuffer after:', this.stateBuffer);
    return stateMap = this._unflattenStateMap();
  }
}
