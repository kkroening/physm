import Decal from './Decal';
import React from 'react';
import { coercePositionVector } from './utils';
import { ZERO_POS } from './utils';

export default class CircleDecal extends Decal {
  constructor({ position = ZERO_POS, radius = 1, color = 'green' } = {}) {
    super();
    this.position = coercePositionVector(position);
    this.radius = radius;
    this.color = color;
  }

  xform(xform_matrix) {
    const scale = 1; // TODO: detect from xform_matrix.
    return CircleDecal({
      position: xform_matrix.matMul(this.position),
      radius: this.radius * scale,
    });
  }

  getDomElement(xform_matrix, { key }) {
    const xformed = xform_matrix.matMul(this.position).dataSync();
    return (
      <circle
        className="plot__circle"
        cx={xformed[0]}
        cy={xformed[1]}
        r={this.radius}
        fill={this.color}
        key={key}
      />
    );
  }
}
