import * as mat3 from './../Mat3';
import * as vec3 from './../Vec3';
import type BoxDecal from './../BoxDecal';
import type CircleDecal from './../CircleDecal';
import type Decal from './../Decal';
import type LineDecal from './../LineDecal';
import type { Mat3 } from './../Mat3';
import type { ReactElement } from 'react';

export interface DecalViewProps {
  decal: Decal;
  xformMatrix: Mat3;
}

/**
 * Every decal there is.
 *
 * The switch below narrows over this rather than over `kind` alone, so each
 * branch is type-checked instead of asserted -- and so *adding a class* is the
 * compile error, not merely adding a `kind` string. A new subclass reusing an
 * existing kind would otherwise satisfy the exhaustiveness check, be cast to
 * the wrong class, and draw `NaN` coordinates: the silent omission this whole
 * arrangement exists to prevent, by the one route a `kind`-only check misses.
 */
type AnyDecal = BoxDecal | CircleDecal | LineDecal;

function BoxDecalView({
  decal,
  xformMatrix,
}: {
  decal: BoxDecal;
  xformMatrix: Mat3;
}): ReactElement {
  const scale = mat3.scaleFactor(xformMatrix);
  const corners = decal.corners.map((corner) =>
    mat3.apply(xformMatrix, corner),
  );

  if (decal.solid) {
    // The fourth corner is the upper-left one, which is where an SVG `rect`
    // wants its origin.
    const [x, y] = corners[3] ?? vec3.ORIGIN;

    return (
      <rect
        x={x}
        y={y}
        width={decal.width * scale}
        height={decal.height * scale}
      />
    );
  }

  return (
    <g>
      {corners.map((from, index) => {
        const to = corners[(index + 1) % corners.length] ?? from;

        return (
          <line
            className="plot__line"
            x1={from[0]}
            y1={from[1]}
            x2={to[0]}
            y2={to[1]}
            strokeWidth={decal.lineWidth * scale}
            stroke={decal.color}
            key={index}
          />
        );
      })}
    </g>
  );
}

function CircleDecalView({
  decal,
  xformMatrix,
}: {
  decal: CircleDecal;
  xformMatrix: Mat3;
}): ReactElement {
  const centre = mat3.apply(xformMatrix, decal.position);

  return (
    <circle
      className="plot__circle"
      cx={centre[0]}
      cy={centre[1]}
      r={decal.radius * mat3.scaleFactor(xformMatrix)}
      fill={decal.color}
    />
  );
}

function LineDecalView({
  decal,
  xformMatrix,
}: {
  decal: LineDecal;
  xformMatrix: Mat3;
}): ReactElement {
  const start = mat3.apply(xformMatrix, decal.startPos);
  const end = mat3.apply(xformMatrix, decal.endPos);

  return (
    <line
      className="plot__line"
      x1={start[0]}
      y1={start[1]}
      x2={end[0]}
      y2={end[1]}
      strokeWidth={decal.lineWidth * mat3.scaleFactor(xformMatrix)}
      stroke={decal.color}
    />
  );
}

/**
 * One decal, drawn under a transform.
 *
 * The `kind` switch is what replaced `Decal.getDomElement`. It puts the
 * knowledge of how to draw a shape in the renderer rather than on the shape,
 * so a decal stays plain data and a second renderer -- canvas, a headless
 * exporter -- needs no cooperation from the core.
 *
 * The cost is that this file has to change when a decal kind is added, which
 * `DecalKind` makes a compile error here rather than a shape silently missing
 * from the picture.
 */
export default function DecalView({
  decal,
  xformMatrix,
}: DecalViewProps): ReactElement {
  // The one remaining cast. `Frame.decals` is `Decal[]`, and closing that set
  // would put the list of every decal into `Decal.ts` -- a call that belongs
  // with the description/instance split rather than here.
  const shape = decal as AnyDecal;

  switch (shape.kind) {
    case 'box':
      return <BoxDecalView decal={shape} xformMatrix={xformMatrix} />;
    case 'circle':
      return <CircleDecalView decal={shape} xformMatrix={xformMatrix} />;
    case 'line':
      return <LineDecalView decal={shape} xformMatrix={xformMatrix} />;
  }
}
