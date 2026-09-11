import placeGizmos, { ARM_LENGTH } from './placeGizmos';
import type CoreScene from './../Scene';
import type { GizmoPlacement } from './placeGizmos';
import type { Mat3 } from './../Mat3';
import type { ReactElement } from 'react';
import type { StateMap } from './../Frame';

export interface GizmosProps {
  scene: CoreScene;
  stateMap: StateMap;
  xformMatrix: Mat3;
}

/**
 * A cross at the frame's origin, turned with its axes, and a line to its
 * parent's. The +x arm runs on as far again, so which way the frame's x axis
 * points can be read off the picture: a plain cross looks the same after a
 * quarter turn, and a `position` is read along its parent's axes.
 */
function GizmoView({ placement }: { placement: GizmoPlacement }): ReactElement {
  const [x, y] = placement.origin;
  const [parentX, parentY] = placement.parentOrigin;
  const [[pointX, pointY]] = placement.axes;

  return (
    <g className="editor__gizmo" data-frame-id={placement.frame.id}>
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
      <line
        className="editor__gizmo-pointer"
        x1={x + pointX * ARM_LENGTH}
        y1={y + pointY * ARM_LENGTH}
        x2={x + 2 * pointX * ARM_LENGTH}
        y2={y + 2 * pointY * ARM_LENGTH}
      />
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
      {placeGizmos(scene, stateMap, xformMatrix).map((placement) => (
        <GizmoView placement={placement} key={placement.frame.id} />
      ))}
    </g>
  );
}
