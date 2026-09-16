import * as mat3 from './Mat3';
import * as vec3 from './Vec3';
import type { Mat3 } from './Mat3';
import type { State } from './State';
import type { Vec3 } from './Vec3';
import Decal from './Decal';
import Spring from './Spring';
import WorldSpring from './WorldSpring';
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
  springs?: Spring[];
  worldSprings?: WorldSpring[];
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

  /**
   * Springs acting on this frame's own coordinate -- see `Spring`.
   *
   * A list rather than a number, because a spring is a thing a person adds
   * rather than a property the frame has. Several of them add up, which while
   * each is linear is the same as one of their summed stiffness, and stops
   * being so the moment one is not.
   */
  readonly springs: Spring[];

  /**
   * Springs between this frame and the world -- see `WorldSpring`.
   *
   * Kept apart from `springs` because they are different devices rather than
   * two settings of one: a joint spring acts on this frame's coordinate, and
   * one anchored to the world resists any rotation of this frame, including
   * rotation inherited from above. Their generalised forces land in different
   * rows, which is the difference a shared list would hide.
   */
  readonly worldSprings: WorldSpring[];

  readonly frames: Frame[];
  readonly resistance: number;

  initialState: State;

  constructor({
    position = vec3.ORIGIN,
    decals = [],
    weights = [],
    springs = [],
    worldSprings = [],
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
    this.springs = springs;
    this.worldSprings = worldSprings;

    // Refused here rather than in the binding, so that every route in --
    // JSX, the walk, a document, a constructor called by hand -- meets the
    // same rule. A spring anchored to the world applies a *torque*, and a
    // coordinate that slides or moves nothing has no torque to receive: the
    // force would enter a row where it means nothing, silently.
    // Checked here rather than omitted from each non-turning frame's options,
    // the way `resistance` is from a fixed frame's. That omit works because
    // nothing checks resistance at run time; this rule is about `turnRate`,
    // which the *base* frame also answers zero to -- so the run-time check has
    // to exist whatever the subclass types say, and a second statement of it
    // would only be a second thing to keep in step.
    if (worldSprings.length && !this.turnRate()) {
      throw new Error(
        `A spring anchored to the world is on ${this.typeName} '${this.id}', ` +
          'whose coordinate does not turn -- so the torque it applies would ' +
          'act on nothing. It belongs on a frame that rotates.',
      );
    }
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

  /**
   * Whether the frame's coordinate moves it: true for a joint, false for a
   * frame whose transform is the same whatever `q` is -- this class, and
   * `FixedFrame`. Nothing gives such a coordinate any inertia, so the mass
   * matrix gives it some of its own (`Scene.getMassMatrix`).
   */
  isJoint(): boolean {
    return false;
  }

  /**
   * What this frame's springs contribute to its generalised force, together.
   *
   * They add, which is what makes several of them meaningful: while every one
   * is linear their sum is one spring of the summed stiffness, and the moment
   * one is not -- a stop that engages past a threshold, a stiffness that rises
   * with the angle -- the sum is the only thing that expresses it.
   *
   * Asked of the frame so the solver adds a term without knowing what is in
   * it, which is the seam a spring slack toward something other than zero
   * arrives through.
   */
  springForce(q: number): number {
    return this.springs.reduce((total, spring) => total + spring.force(q), 0);
  }

  /**
   * The torque this frame's world-anchored springs apply, at the given pose.
   *
   * Separate from `springForce` because it does not belong to this frame's row
   * alone: a spring anchored to the world resists rotation from wherever it
   * comes, so this torque enters the row of every rotational frame above this
   * one as well. The solver sums it over a subtree rather than reading it per
   * row, exactly as it already sums the weights.
   */
  worldSpringTorque(pose: Mat3): number {
    return this.worldSprings.reduce(
      (total, spring) => total + spring.torque(pose),
      0,
    );
  }

  /**
   * How much a unit of this frame's coordinate turns everything below it.
   *
   * `d(theta_world)/dq` for the subtree: one for a revolute joint, zero for a
   * frame whose coordinate slides or moves nothing. It is what decides whether
   * a world-anchored spring below this frame appears in its row at all, and it
   * is a property of the joint rather than something the solver can infer --
   * a sliding joint carries a frame without turning it.
   */
  turnRate(): number {
    return 0;
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
      springs: this.springs.map((spring) => spring.toJsonObj()),
      worldSprings: this.worldSprings.map((spring) => spring.toJsonObj()),
      type: this.typeName,
      weights: this.weights.map((weight) => weight.toJsonObj()),
    };

    if (includeDecals) {
      obj.decals = this.decals.map((decal) => decal.toJsonObj());
    }

    return obj;
  }
}
