import Decal from './Decal';
import React from 'react';
import { coercePositionVector } from './utils';
import { ZERO_POS } from './utils';

export default class LineDecal extends Decal {
  constructor({ endPos, startPos = ZERO_POS, lineWidth = 2, color = 'k' }) {
    super()
    this.startPos = coercePositionVector(startPos);
    this.endPos = coercePositionVector(endPos);
    this.lineWidth = lineWidth;
    this.color = color;
  }

  xform(xformMatrix) {
    return LineDecal({
      endPos: xformMatrix.matMul(this.endPos),
      startPos: xformMatrix.matMul(this.startPos),
      lineWidth: this.lineWidth, // TODO: transform using xformMatrix.
      color: this.color,
    });
  }

  getDomElement(xformMatrix, { key }) {
    const startPos = xformMatrix.matMul(this.startPos).dataSync();
    const endPos = xformMatrix.matMul(this.endPos).dataSync();
    return (
      <line
        className="plot__line"
        x1={startPos[0]}
        y1={startPos[1]}
        x2={endPos[0]}
        y2={endPos[1]}
        strokeWidth={this.lineWidth}
        stroke={this.color}
        key={key}
      />
    );
  }
}
