import Solver from './Solver';
import { required } from './utils';

export default class RsSolver extends Solver {
  constructor(
    scene = required('scene'),
    rsWasmModule = required('rsWasmModule'),
    { rungeKutta = true } = {},
  ) {
    super(scene);
    this.stateBuffer = new Float64Array(this.scene.sortedFrames.length * 2);
    this.extForceBuffer = new Float64Array(this.scene.sortedFrames.length);
    this.resetStateMap();
    console.log('[js] Creating solver context');
    const sceneJson = JSON.stringify(scene.toJsonObj());
    this.context = new rsWasmModule.SolverContext(sceneJson);
    this.context.setRungeKutta(rungeKutta);
    console.log('[js] Created solver context:', this.context);
  }

  dispose() {
    console.log('[js] Disposing solver context');
    this.context.dispose();
    console.log('[js] Disposed solver context');
    this.context = null;
  }

  getStateMap() {
    return new Map(
      this.scene.sortedFrames.map((frame, index) => [
        frame.id,
        [this.stateBuffer[index * 2], this.stateBuffer[index * 2 + 1]],
      ]),
    );
  }

  setStateMap(stateMap = required('stateMap')) {
    this.stateBuffer.set(
      this.scene.sortedFrames.flatMap(
        (frame) => stateMap.get(frame.id) || [0, 0],
      ),
    );
  }

  tick(
    deltaTime = required('deltaTime'),
    tickCount = 1,
    externalForceMap = null,
  ) {
    this.extForceBuffer.set(
      this.scene.sortedFrames.map((frame) =>
        externalForceMap ? externalForceMap.get(frame.id) || 0 : 0,
      ),
    );
    for (let i = 0; i < tickCount; i++) {
      this.context.tick(this.stateBuffer, deltaTime, this.extForceBuffer);
    }
  }
}
