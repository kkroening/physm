import * as mat3 from './Mat3';
import * as vec3 from './Vec3';
import type { Mat3 } from './Mat3';
import type { State } from './State';
import type { Vec3 } from './Vec3';
import Decal from './Decal';
import Weight from './Weight';
import { ZERO_STATE, coerceState } from './State';
import { generateRandomId } from './utils';

export type FrameId = string;

/** Every frame's coordinate and velocity, indexed by frame id. */
export type StateMap = Map<FrameId, State>;

export interface FrameOptions {
  position?: number | readonly number[] | Vec3;
  decals?: Decal[];
  weights?: Weight[];
  frames?: Frame[];
  resistance?: number;
  initialState?: number | readonly number[] | null;
  id?: FrameId | null;
  typeName?: string | null;
}

export interface FrameJsonOptions {
  includeDecals?: boolean;
}

/**
 * A node of the scene tree: one generalized coordinate, and whatever hangs off
 * it.
 *
 * The base class has no degree of freedom of its own -- its local transform is
 * the identity regardless of `q` -- so it is a container rather than a joint.
 * `RotationalFrame` and `TrackFrame` are the joints.
 */
export default class Frame {
  readonly id: FrameId;
  readonly typeName: string;
  readonly position: Vec3;
  readonly decals: Decal[];
  readonly weights: Weight[];
  readonly frames: Frame[];
  readonly resistance: number;
  initialState: State;

  constructor({
    position = vec3.ORIGIN,
    decals = [],
    weights = [],
    frames = [],
    resistance = 0,
    initialState = ZERO_STATE,
    id = null,
    typeName = null,
  }: FrameOptions = {}) {
    this.id = id ?? generateRandomId();
    this.typeName = typeName ?? this.constructor.name;
    this.position = vec3.coerce(position);
    this.decals = decals;
    this.weights = weights;
    this.frames = frames;
    this.resistance = resistance;
    this.initialState = coerceState(initialState);
  }

  /**
   * The frame's own transform at coordinate `q`, in its parent's coordinates.
   *
   * `algorithm.md` §2 calls this `L_i(q)`; the pose `M_i` is the product of
   * these along the root path.
   */
  getLocalPosMatrix(_q: number): Mat3 {
    return mat3.IDENTITY;
  }

  /** `∂L_i/∂q`, which sweep 2 conjugates into the spatial generator `V_i`. */
  getLocalVelMatrix(_q: number): Mat3 {
    return mat3.ZERO;
  }

  /** `∂²L_i/∂q²`. Local, and so *not* the `𝒜_i = V_i²` of §4. */
  getLocalAccelMatrix(_q: number): Mat3 {
    return mat3.ZERO;
  }

  toJsonObj({ includeDecals = false }: FrameJsonOptions = {}): Record<
    string,
    unknown
  > {
    const obj: Record<string, unknown> = {
      frames: this.frames.map((frame) => frame.toJsonObj({ includeDecals })),
      id: this.id,
      initialState: this.initialState,
      position: vec3.toPlanar(this.position),
      resistance: this.resistance,
      type: this.typeName,
      weights: this.weights.map((weight) => weight.toJsonObj()),
    };

    if (includeDecals) {
      obj.decals = this.decals.map((decal) => decal.toJsonObj());
    }

    return obj;
  }
}
