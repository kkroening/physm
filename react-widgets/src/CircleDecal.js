import Decal from './Decal';
import React from 'react';
import { coercePositionVector } from './utils';
import { getXformMatrixScaleFactor } from './utils';
import { ZERO_POS } from './utils';

export default class CircleDecal extends Decal {
  constructor({ position = ZERO_POS, radius = 1, color = 'green' } = {}) {
    super();
    this.position = coercePositionVector(position);
    this.radius = radius;
    this.color = color;
  }

  xform(xformMatrix) {
    const scale = getXformMatrixScaleFactor(xformMatrix);
    return CircleDecal({
      position: xformMatrix.matMul(this.position),
      radius: this.radius * scale,
    });
  }

  getDomElement(xformMatrix, { key }) {
    const xformed = xformMatrix.matMul(this.position).dataSync();
    const scale = getXformMatrixScaleFactor(xformMatrix);
    return (
      <circle
        className="plot__circle"
        cx={xformed[0]}
        cy={xformed[1]}
        r={this.radius * scale}
        fill={this.color}
        key={key}
      />
    );
  }
}
