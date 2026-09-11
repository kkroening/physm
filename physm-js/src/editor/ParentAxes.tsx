import { ARM_LENGTH } from './placeGizmos';
import type { GizmoPlacement } from './placeGizmos';
import type { ReactElement } from 'react';

/** How far the parent's axes reach from a dragged frame's origin, each way, in pixels. */
const PARENT_AXIS_LENGTH = 5 * ARM_LENGTH;

/** How far past the end of each of the parent's axes its name sits, in pixels. */
const NAME_GAP = 7;

/**
 * A frame's parent's axes, through its origin: the axes its `position` is read
 * along, and so the ones a drag writes along. The frame's own gizmo shows its
 * own axes, which for a rotational frame are turned by its angle, so the
 * editor draws these while the frame is dragged -- each named at its positive
 * end, since a plain cross would not say which way is which.
 */
export default function ParentAxes({
  placement,
}: {
  placement: GizmoPlacement;
}): ReactElement {
  const [x, y] = placement.origin;

  return (
    <g className="editor__parent-axes" data-frame-id={placement.frame.id}>
      {placement.parentAxes.map(([dx, dy], index) => (
        <g className="editor__parent-axis" key={index}>
          <line
            x1={x - dx * PARENT_AXIS_LENGTH}
            y1={y - dy * PARENT_AXIS_LENGTH}
            x2={x + dx * PARENT_AXIS_LENGTH}
            y2={y + dy * PARENT_AXIS_LENGTH}
          />
          <text
            x={x + dx * (PARENT_AXIS_LENGTH + NAME_GAP)}
            y={y + dy * (PARENT_AXIS_LENGTH + NAME_GAP)}
          >
            {index === 0 ? 'x' : 'y'}
          </text>
        </g>
      ))}
    </g>
  );
}
