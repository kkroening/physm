import * as mat3 from './../Mat3';
import * as vec3 from './../Vec3';
import type CoreScene from './../Scene';
import type Frame from './../Frame';
import type { FrameId, StateMap } from './../Frame';
import type { Mat3 } from './../Mat3';
import type { ReactElement } from 'react';
import type { Vec3 } from './../Vec3';

export interface GizmosProps {
  scene: CoreScene;
  stateMap: StateMap;
  xformMatrix: Mat3;
}

/** How far each arm of a gizmo's cross reaches from its origin, in pixels. */
const ARM_LENGTH = 6;

type ScreenPoint = readonly [number, number];

/** One frame's gizmo, placed on screen. */
interface Placement {
  id: FrameId;
  origin: ScreenPoint;
  parentOrigin: ScreenPoint;

  /** Which way the frame's own axes point on screen, as unit vectors. */
  axes: readonly [ScreenPoint, ScreenPoint];
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
 * Every frame from `frames` down, placed, each before its children.
 *
 * The pose is the one `FrameView` draws -- a frame's coordinate from
 * `stateMap`, or its `initialState` where the map has none -- so a gizmo sits
 * where its frame is drawn.
 */
function placeAll(
  frames: readonly Frame[],
  stateMap: StateMap,
  parentXform: Mat3,
): Placement[] {
  return frames.flatMap((frame) => {
    const [q] = stateMap.get(frame.id) ?? frame.initialState;
    const xform = mat3.multiply(parentXform, frame.getLocalPosMatrix(q));
    const placement: Placement = {
      id: frame.id,
      origin: mat3.translationOf(xform),
      parentOrigin: mat3.translationOf(parentXform),
      axes: [
        screenAxis(xform, vec3.direction(1, 0)),
        screenAxis(xform, vec3.direction(0, 1)),
      ],
    };

    return [placement, ...placeAll(frame.frames, stateMap, xform)];
  });
}

/** A cross at the frame's origin, turned with its axes, and a line to its parent's. */
function GizmoView({ placement }: { placement: Placement }): ReactElement {
  const [x, y] = placement.origin;
  const [parentX, parentY] = placement.parentOrigin;

  return (
    <g className="editor__gizmo" data-frame-id={placement.id}>
      <line
        className="editor__gizmo-link"
        x1={parentX}
        y1={parentY}
        x2={x}
        y2={y}
      />
      {placement.axes.map(([dx, dy], index) => (
        <line
          className="editor__gizmo-arm"
          x1={x - dx * ARM_LENGTH}
          y1={y - dy * ARM_LENGTH}
          x2={x + dx * ARM_LENGTH}
          y2={y + dy * ARM_LENGTH}
          key={index}
        />
      ))}
    </g>
  );
}

/**
 * Every frame's origin, marked, in the editor's scene pane.
 *
 * A frame need not draw anything: one that only places its children has no
 * pixels at all. So in the editor each frame draws a small cross at its own
 * origin, turned with its axes, and a faint line back to its parent's origin --
 * the world's, for a frame at the top. A frame that draws nothing can still be
 * seen, and the frame tree can be read off the picture
 * ([0014 page 7](../../../docs/issues/0014/07-editing.md)).
 *
 * Drawn over the scene rather than in it. A gizmo belongs to the editor, so
 * `SceneView` draws none, and the document and the code written from it never
 * mention one.
 */
export default function Gizmos({
  scene,
  stateMap,
  xformMatrix,
}: GizmosProps): ReactElement {
  return (
    <g className="editor__gizmos">
      {placeAll(scene.frames, stateMap, xformMatrix).map((placement) => (
        <GizmoView placement={placement} key={placement.id} />
      ))}
    </g>
  );
}
