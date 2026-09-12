import * as mat3 from './../Mat3';
import * as vec3 from './../Vec3';
import { poseIn } from './../Scene';
import type CoreScene from './../Scene';
import type Frame from './../Frame';
import type { Mat3 } from './../Mat3';
import type { PoseMap } from './../Scene';
import type { Vec3 } from './../Vec3';

/** How far each arm of a gizmo's cross reaches from its origin, in pixels. */
export const ARM_LENGTH = 6;

/**
 * How far a handle's square reaches from the point it marks, in pixels.
 *
 * Here beside the placement, as `ARM_LENGTH` is, so that what is drawn and
 * what can be grabbed cannot drift apart: `Handles` draws to it and the pane
 * takes hold within `HANDLE_REACH` of it.
 */
export const HANDLE_SIZE = 4;

/**
 * How near a press must land to a handle to take hold of it, in pixels.
 *
 * A shade beyond the square's corner, which sits `HANDLE_SIZE * √2` out, so
 * that every part of the mark is grabbable and little else is.
 */
export const HANDLE_REACH = Math.ceil(HANDLE_SIZE * Math.SQRT2);

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

/**
 * Where a point written in `frame`'s coordinates lands on screen -- or in the
 * world's, for no frame.
 *
 * Here rather than in the editor's pane, which holds no matrix maths of its
 * own: this is the same composition `placeAll` makes, the view transform over
 * the pose the scene computed.
 */
export function placePoint(
  poses: PoseMap,
  frame: Frame | null,
  viewXform: Mat3,
  point: Vec3,
): ScreenPoint {
  const xform = frame
    ? mat3.multiply(viewXform, poseIn(poses, frame.id))
    : viewXform;

  return vec3.toPlanar(mat3.apply(xform, point));
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
 * The poses rather than the state they were made from, so that one call
 * cannot say where the frames are twice and disagree with itself -- and so
 * that a map made from another scene is not a thing this can be handed.
 *
 * Its own module because two things need it -- `Gizmos`, which draws them, and
 * `hitsAt`, which finds the ones under a click.
 */
export default function placeGizmos(
  scene: CoreScene,
  poses: PoseMap,
  xformMatrix: Mat3,
): GizmoPlacement[] {
  return placeAll(scene.frames, poses, xformMatrix, xformMatrix);
}
