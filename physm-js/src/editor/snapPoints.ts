import * as mat3 from './../Mat3';
import * as vec3 from './../Vec3';
import placeGizmos from './placeGizmos';
import type BoxDecal from './../BoxDecal';
import type CircleDecal from './../CircleDecal';
import { poseIn } from './../Scene';
import type CoreScene from './../Scene';
import type Decal from './../Decal';
import type Frame from './../Frame';
import type LineDecal from './../LineDecal';
import type { Mat3 } from './../Mat3';
import type { PoseMap } from './../Scene';
import type { ScreenPoint } from './placeGizmos';
import type { StateMap } from './../Frame';
import type { Vec3 } from './../Vec3';

/** How near a dragged origin has to come to a point to snap to it, in pixels. */
const SNAP_REACH = 8;

/** A frame and every frame under it: all of them move when it does. */
function movingWith(frame: Frame): Set<Frame> {
  return new Set([
    frame,
    ...frame.frames.flatMap((child) => [...movingWith(child)]),
  ]);
}

/** The points a decal offers on screen: a line's ends, and a circle's centre. */
function decalPoints(decal: Decal, xformMatrix: Mat3): ScreenPoint[] {
  const shape = decal as BoxDecal | CircleDecal | LineDecal;
  const onScreen = (point: Vec3): ScreenPoint =>
    vec3.toPlanar(mat3.apply(xformMatrix, point));

  switch (shape.kind) {
    case 'line':
      return [onScreen(shape.startPos), onScreen(shape.endPos)];
    case 'circle':
      return [onScreen(shape.position)];
    case 'box':
      return [];
  }
}

/** The points of every decal from `frames` down, but for what `skip` moves. */
function decalPointsUnder(
  frames: readonly Frame[],
  poses: PoseMap,
  viewXform: Mat3,
  skip: Frame,
): ScreenPoint[] {
  return frames.flatMap((frame) => {
    if (frame === skip) {
      return [];
    }

    const xformMatrix = mat3.multiply(viewXform, poseIn(poses, frame.id));

    return [
      ...frame.decals.flatMap((decal) => decalPoints(decal, xformMatrix)),
      ...decalPointsUnder(frame.frames, poses, viewXform, skip),
    ];
  });
}

/** The nearest of `points` to `point`, if any is in reach. */
export function nearestSnap(
  points: readonly ScreenPoint[],
  point: ScreenPoint,
): ScreenPoint | null {
  let nearest: ScreenPoint | null = null;
  let reach = SNAP_REACH;
  for (const candidate of points) {
    const distance = Math.hypot(
      candidate[0] - point[0],
      candidate[1] - point[1],
    );
    if (distance <= reach) {
      nearest = candidate;
      reach = distance;
    }
  }

  return nearest;
}

/**
 * Where a dragged frame's origin can snap to, on screen: every other frame's
 * origin, each line's ends and each circle's centre. What moves with the
 * dragged frame is left out, since it would only follow the drag.
 *
 * Points, and exactly: a drag rounded to a hundredth leaves frames that were
 * meant to meet a few thousandths apart, and a constraint refuses a supplied
 * point further from its other end than `consistencyTolerance` -- a
 * hundred-thousandth of the scene's scale. Frames snapped together meet that;
 * frames dragged together do not.
 *
 * A box's corners and centre are not targets, nor the world's origin unless
 * something else sits there: which of them should be is still open.
 */
export default function snapPoints(
  scene: CoreScene,
  stateMap: StateMap,
  xformMatrix: Mat3,
  dragged: Frame,
): ScreenPoint[] {
  const moving = movingWith(dragged);
  const poses = scene.getPosMatrixMap(stateMap);

  return [
    ...placeGizmos(scene, stateMap, xformMatrix, poses)
      .filter(({ frame }) => !moving.has(frame))
      .map(({ origin }) => origin),
    ...scene.decals.flatMap((decal) => decalPoints(decal, xformMatrix)),
    ...decalPointsUnder(scene.frames, poses, xformMatrix, dragged),
  ];
}
