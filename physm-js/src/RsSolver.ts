import Solver from './Solver';
import { InvalidStateMapError } from './Solver';
import type { ExternalForceMap, SolverOptions } from './Solver';
import type { FrameId, StateMap } from './Frame';
import type Scene from './Scene';
import type { State } from './State';

/**
 * The wasm surface this solver drives.
 *
 * Written out here rather than imported: the generated bindings live outside
 * this package, under `physm-rs/nodepkg`, and are built by a separate cargo
 * step -- so a type that reached across would make `tsc` depend on a wasm build
 * having happened. What this declares is the contract the binding must meet,
 * which is the part worth checking anyway.
 */
export interface RsWasmModule {
  SolverContext: new (sceneJson: string) => SolverContext;
}

export interface SolverContext {
  setRungeKutta(rungeKutta: boolean): void;
  tick(
    stateBuffer: Float64Array,
    deltaTime: number,
    tickCount: number,
    extForceBuffer: Float64Array,
  ): void;
  dispose(): void;
}

export interface RsSolverOptions extends SolverOptions {
  rungeKutta?: boolean;
}

export default class RsSolver extends Solver {
  stateBuffer: Float64Array;
  extForceBuffer: Float64Array;
  context: SolverContext | null;

  constructor(
    scene: Scene,
    rsWasmModule: RsWasmModule,
    { rungeKutta = true, ...solverOptions }: RsSolverOptions = {},
  ) {
    super(scene, solverOptions);
    this.stateBuffer = new Float64Array(this.scene.sortedFrames.length * 2);
    this.extForceBuffer = new Float64Array(this.scene.sortedFrames.length);
    this.resetStateMap();
    const sceneJson = JSON.stringify(scene.toJsonObj());
    this.context = new rsWasmModule.SolverContext(sceneJson);
    this.context.setRungeKutta(rungeKutta);
  }

  /**
   * The wasm context, or a throw naming what happened to it.
   *
   * `dispose` frees memory on the Rust side, so a call afterwards is a
   * use-after-free reaching into wasm rather than a null dereference in JS.
   */
  private get liveContext(): SolverContext {
    if (!this.context) {
      throw new Error('Solver context has been disposed');
    }

    return this.context;
  }

  override dispose(): void {
    this.liveContext.dispose();
    this.context = null;
  }

  override getStateMap(): StateMap {
    return new Map(
      this.scene.sortedFrames.map((frame, index): [FrameId, State] => [
        frame.id,
        [this.stateBuffer[index * 2]!, this.stateBuffer[index * 2 + 1]!],
      ]),
    );
  }

  override setStateMap(stateMap: StateMap): void {
    this.stateBuffer.set(
      this.scene.sortedFrames.flatMap(
        (frame) => stateMap.get(frame.id) ?? [0, 0],
      ),
    );
  }

  override tick(
    deltaTime: number,
    tickCount = 1,
    externalForceMap: ExternalForceMap = null,
  ): void {
    this.extForceBuffer.set(
      this.scene.sortedFrames.map(
        (frame) => externalForceMap?.get(frame.id) ?? 0,
      ),
    );

    // Unstabilized, `tickCount` goes straight to wasm and the whole batch
    // integrates without crossing back. The stabilizer lives in TypeScript, so
    // stabilizing means stepping one at a time and paying a boundary crossing
    // per step -- worth it because the alternative is correcting once per batch
    // and letting drift accumulate across however many steps a caller passed,
    // which is a different amount of stabilization for the same physics.
    const batchSize = this.stabilize ? 1 : tickCount;
    let done = 0;
    // `do`, not `while`: `tickCount` of zero still crosses into wasm and still
    // validates, which is what this did before it had a loop at all.
    do {
      const size = Math.min(batchSize, tickCount - done);
      this.liveContext.tick(
        this.stateBuffer,
        deltaTime,
        size,
        this.extForceBuffer,
      );
      for (const entry of this.stateBuffer) {
        if (isNaN(entry)) {
          throw new InvalidStateMapError();
        }
      }
      done += size;
      if (size > 0) {
        this.applyStabilization();
      }
    } while (done < tickCount);
  }
}
