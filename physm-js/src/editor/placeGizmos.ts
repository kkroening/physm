import * as mat3 from './../Mat3';
import * as vec3 from './../Vec3';
import { poseIn } from './../Scene';
import type CoreScene from './../Scene';
import type Frame from './../Frame';
import type { Mat3 } from './../Mat3';
import type { PoseMap } from './../Scene';
import type { StateMap } from './../Frame';
import type { Vec3 } from './../Vec3';

/** How far each arm of a gizmo's cross reaches from its origin, in pixels. */
export const ARM_LENGTH = 6;

export type ScreenPoint = readonly [number, number];

/** One frame's gizmo, placed on screen. */
export interface GizmoPlacement {
  readonly frame: Frame;
  readonly origin: ScreenPoint;
  readonly parentOrigin: ScreenPoint;

  /** The transform the frame's parent is drawn under, which its `position` is read in. */
  readonly parentXform: Mat3;

  /** Which way the frame's own axes point on screen, as unit vectors. */
  readonly axes: readonly [ScreenPoint, ScreenPoint];

  /** Which way its parent's axes point on screen, as unit vectors: the ones its `position` is read along. */
  readonly parentAxes: readonly [ScreenPoint, ScreenPoint];

  /** Where the +x pointer ends: along +x, twice as far out as the cross's arm. */
  readonly pointerEnd: ScreenPoint;
}

/**
 * Which way `axis` points on screen under a transform, as a unit vector.
 *
 * Unit length rather than the transformed axis itself, which carries the view's
 * scale: a gizmo marks a place, it is not a shape in the scene, so it stays the
 * same size whatever the zoom.
 */
function screenAxis(xformMatrix: Mat3, axis: Vec3): ScreenPoint {
  const onScreen = mat3.apply(xformMatrix, axis);

  return vec3.toPlanar(vec3.scale(onScreen, 1 / vec3.planarLength(onScreen)));
}

/** Every frame from `frames` down, placed, each before its children. */
function placeAll(
  frames: readonly Frame[],
  poses: PoseMap,
  viewXform: Mat3,
  parentXform: Mat3,
): GizmoPlacement[] {
  return frames.flatMap((frame) => {
    const xform = mat3.multiply(viewXform, poseIn(poses, frame.id));
    const origin = mat3.translationOf(xform);
    const x = screenAxis(xform, vec3.direction(1, 0));
    const placement: GizmoPlacement = {
      frame,
      origin,
      parentOrigin: mat3.translationOf(parentXform),
      parentXform,
      axes: [x, screenAxis(xform, vec3.direction(0, 1))],
      parentAxes: [
        screenAxis(parentXform, vec3.direction(1, 0)),
        screenAxis(parentXform, vec3.direction(0, 1)),
      ],
      pointerEnd: [
        origin[0] + 2 * ARM_LENGTH * x[0],
        origin[1] + 2 * ARM_LENGTH * x[1],
      ],
    };

    return [placement, ...placeAll(frame.frames, poses, viewXform, xform)];
  });
}

/**
 * Where every frame's gizmo goes on screen, each frame before its children:
 * the order they are drawn in, so the last is on top.
 *
 * Its own module because two things need it -- `Gizmos`, which draws them, and
 * `hitsAt`, which finds the ones under a click.
 */
export default function placeGizmos(
  scene: CoreScene,
  stateMap: StateMap,
  xformMatrix: Mat3,
  poses: PoseMap = scene.getPosMatrixMap(stateMap),
): GizmoPlacement[] {
  return placeAll(scene.frames, poses, xformMatrix, xformMatrix);
}
