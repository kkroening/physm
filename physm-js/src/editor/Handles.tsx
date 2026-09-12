import type { ReactElement } from 'react';
import type { ScreenPoint } from './placeGizmos';

/** How far a handle reaches from the point it marks, in pixels. */
const HANDLE_SIZE = 4;

export interface HandlesProps {
  readonly handles: readonly { prop: string; at: ScreenPoint }[];
}

/**
 * A mark on every point the selected shape can be dragged by.
 *
 * A frame says where it is with a gizmo; a shape has none, so before this
 * there was nothing on screen saying a box could be moved at all, or that a
 * line is moved an end at a time rather than bodily. A weight is the sharpest
 * case: it draws nothing whatever, so its handle is the only thing there is to
 * take hold of.
 *
 * Drawn over the scene rather than in it, like the gizmos: a handle belongs to
 * the editor, and never reaches the document or the code written from it.
 */
export default function Handles({ handles }: HandlesProps): ReactElement {
  return (
    <g className="editor__handles">
      {handles.map(({ prop, at: [x, y] }) => (
        <rect
          className="editor__handle"
          data-prop={prop}
          x={x - HANDLE_SIZE}
          y={y - HANDLE_SIZE}
          width={HANDLE_SIZE * 2}
          height={HANDLE_SIZE * 2}
          key={prop}
        />
      ))}
    </g>
  );
}
