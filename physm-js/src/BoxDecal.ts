import * as mat3 from './Mat3';
import * as vec3 from './Vec3';
import Decal from './Decal';
import type { DecalKind } from './Decal';
import type { Mat3 } from './Mat3';
import type { Vec3 } from './Vec3';

/** The four corners of a unit square, centred on the origin. */
const CENTERED_CORNERS: readonly Vec3[] = [
  [-0.5, -0.5, 1],
  [0.5, -0.5, 1],
  [0.5, 0.5, 1],
  [-0.5, 0.5, 1],
];

/** The same square with its lower-left corner at the origin. */
const QUAD1_CORNERS: readonly Vec3[] = [
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
];

export interface BoxDecalOptions {
  width?: number;
  height?: number;
  position?: number | readonly number[] | Vec3;
  angle?: number;
  centered?: boolean;
  solid?: boolean;
  lineWidth?: number;
  color?: string;
}

/**
 * A rectangle, drawn filled or as four edges.
 *
 * The corners are computed once at construction, in the decal's own frame; the
 * render carries them through the view transform.
 */
export default class BoxDecal extends Decal {
  override readonly kind: DecalKind = 'box';
  readonly width: number;
  readonly height: number;
  readonly position: Vec3;
  readonly angle: number;
  readonly centered: boolean;
  readonly solid: boolean;
  readonly lineWidth: number;
  readonly color: string;
  /**
   * The four corners in the decal's own frame, computed once at construction.
   *
   * Public because drawing an outlined box means transforming these, and the
   * renderer lives outside this class now. Deriving them from `width`,
   * `height` and `angle` at render time instead would agree only for a
   * transform that is a rotation and a uniform scale -- a reflected view
   * transform composes into `angle` wrongly, while carrying the corners
   * through is exact for any transform at all.
   */
  readonly corners: readonly Vec3[];

  constructor({
    width = 1,
    height = 1,
    position = vec3.ORIGIN,
    angle = 0,
    centered = true,
    solid = true,
    lineWidth = 1,
    color = 'black',
  }: BoxDecalOptions = {}) {
    super();
    this.width = width;
    this.height = height;
    this.position = vec3.coerce(position);
    this.angle = angle;
    this.centered = centered;
    this.solid = solid;
    this.lineWidth = lineWidth;
    this.color = color;

    const [x, y] = vec3.toPlanar(this.position);
    const placement = mat3.multiply(
      // The negated angle is the convention `utils.js` used here, and the
      // rendered scene is calibrated against it.
      mat3.multiply(mat3.translation(x, y), mat3.rotation(-angle)),
      mat3.scaling(width, height),
    );

    this.corners = (centered ? CENTERED_CORNERS : QUAD1_CORNERS).map((corner) =>
      mat3.apply(placement, corner),
    );
  }

  override xform(xformMatrix: Mat3): BoxDecal {
    const scale = mat3.scaleFactor(xformMatrix);

    return new BoxDecal({
      width: this.width * scale,
      height: this.height * scale,
      position: mat3.apply(xformMatrix, this.position),
      angle: this.angle + mat3.rotationAngle(xformMatrix),
      centered: this.centered,
      solid: this.solid,
      lineWidth: this.lineWidth * scale,
      color: this.color,
    });
  }
}
