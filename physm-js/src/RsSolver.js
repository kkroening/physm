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
    this.extForceBuffer = new Float64Array(this.scene.sortedFrames.length);
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
    this.stateBuffer.set(
      this.scene.sortedFrames.flatMap(
        (frame) => stateMap.get(frame.id) || [0, 0],
      ),
    );
    this.extForceBuffer.set(
      this.scene.sortedFrames.map((frame) =>
        externalForceMap ? externalForceMap.get(frame.id) || 0 : 0,
      ),
    );
    this.context.tick(this.stateBuffer, deltaTime, this.extForceBuffer);
    return new Map(
      this.scene.sortedFrames.map((frame, index) => [
        frame.id,
        [this.stateBuffer[index * 2], this.stateBuffer[index * 2 + 1]],
      ]),
    );
  }
}
