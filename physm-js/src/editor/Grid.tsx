import gridLines from './gridLines';
import type { GridLine } from './gridLines';
import type { Mat3 } from './../Mat3';
import type { ReactElement } from 'react';

/** A line of the grid, its own axes a shade darker than the rest. */
function GridLineView({
  line: { unit, from, to },
  axis,
}: {
  line: GridLine;
  axis: 'x' | 'y';
}): ReactElement {
  return (
    <line
      className={unit === 0 ? 'editor__grid-axis' : 'editor__grid-line'}
      data-x={axis === 'x' ? unit : undefined}
      data-y={axis === 'y' ? unit : undefined}
      x1={from[0]}
      y1={from[1]}
      x2={to[0]}
      y2={to[1]}
    />
  );
}

/**
 * A faint line at every multiple of the grid's step -- a whole unit while the
 * lines are far enough apart to read, and a rung of the 1-2-5 ladder above it
 * once they are not -- across the scene pane and under the scene, so a
 * position can be read
 * off the picture. The grid's own axes are a shade darker, so its origin can be
 * found. `lattice` takes its units to the screen: the view, for the world's
 * grid.
 *
 * Like a gizmo, it belongs to the editor: the scene and the code written from
 * it never mention one.
 */
export default function Grid({
  lattice,
  size,
}: {
  lattice: Mat3;
  size: readonly [number, number];
}): ReactElement {
  const { xLines, yLines } = gridLines(lattice, size);

  return (
    <g className="editor__grid">
      {xLines.map((line) => (
        <GridLineView line={line} axis="x" key={`x${line.unit}`} />
      ))}
      {yLines.map((line) => (
        <GridLineView line={line} axis="y" key={`y${line.unit}`} />
      ))}
    </g>
  );
}
