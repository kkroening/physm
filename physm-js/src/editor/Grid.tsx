import gridLines from './gridLines';
import type { Mat3 } from './../Mat3';
import type { ReactElement } from 'react';

/** How a line of the grid is drawn: the world's own axes a shade darker than the rest. */
function classOf(unit: number): string {
  return unit === 0 ? 'editor__grid-axis' : 'editor__grid-line';
}

/**
 * A faint line at every whole unit of the world, across the scene pane and
 * under the scene, so a position can be read off the picture -- and the
 * world's own axes a shade darker, so its origin can be found.
 *
 * Like a gizmo, it belongs to the editor: the scene and the code written from
 * it never mention one.
 */
export default function Grid({
  xformMatrix,
  size,
}: {
  xformMatrix: Mat3;
  size: readonly [number, number];
}): ReactElement {
  const [width, height] = size;
  const { vertical, horizontal } = gridLines(xformMatrix, size);

  return (
    <g className="editor__grid">
      {vertical.map(({ unit, at }) => (
        <line
          className={classOf(unit)}
          data-x={unit}
          x1={at}
          y1={0}
          x2={at}
          y2={height}
          key={`x${unit}`}
        />
      ))}
      {horizontal.map(({ unit, at }) => (
        <line
          className={classOf(unit)}
          data-y={unit}
          x1={0}
          y1={at}
          x2={width}
          y2={at}
          key={`y${unit}`}
        />
      ))}
    </g>
  );
}
