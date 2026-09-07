import * as tf from './tfjs';
import Decal from './Decal';
import React from 'react';
import { coercePositionVector } from './utils';
import { getXformMatrixScaleFactor } from './utils';
import { required } from './utils';
import { ZERO_POS } from './utils';

export default class LineDecal extends Decal {
  constructor({
    endPos = required('endPos'),
    startPos = ZERO_POS,
    lineWidth = 1,
    color = 'black',
  } = {}) {
    super();
    this.startPos = coercePositionVector(startPos);
    this.endPos = coercePositionVector(endPos);
    this.lineWidth = lineWidth;
    this.color = color;
  }

  dispose() {
    this.startPos.dispose();
    this.endPos.dispose();
  }

  xform(xformMatrix = required('xformMatrix')) {
    const scale = getXformMatrixScaleFactor(xformMatrix);
    return LineDecal({
      endPos: xformMatrix.matMul(this.endPos),
      startPos: xformMatrix.matMul(this.startPos),
      lineWidth: this.lineWidth * scale,
      color: this.color,
    });
  }

  getDomElement(
    xformMatrix = required('xformMatrix'),
    { key = undefined } = {},
  ) {
    const startPos = tf.tidy(() => xformMatrix.matMul(this.startPos).dataSync());
    const endPos = tf.tidy(() => xformMatrix.matMul(this.endPos).dataSync());
    const scale = getXformMatrixScaleFactor(xformMatrix);
    return (
      <line
        className="plot__line"
        x1={startPos[0]}
        y1={startPos[1]}
        x2={endPos[0]}
        y2={endPos[1]}
        strokeWidth={this.lineWidth * scale}
        stroke={this.color}
        key={key}
      />
    );
  }
}
