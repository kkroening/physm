import * as tf from './tfjs';
import Decal from './Decal';
import React from 'react';
import { coercePositionVector } from './utils';
import { getRotationTranslationMatrix } from './utils';
import { getScaleMatrix } from './utils';
import { getXformMatrixRotationAngle } from './utils';
import { getXformMatrixScaleFactor } from './utils';
import { required } from './utils';
import { ZERO_POS } from './utils';

const CENTERED_SQUARE = tf
  .tensor2d([
    [-0.5, -0.5, 1],
    [0.5, -0.5, 1],
    [0.5, 0.5, 1],
    [-0.5, 0.5, 1],
  ])
  .transpose();

const QUAD1_SQUARE = tf
  .tensor2d([
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 1],
  ])
  .transpose();

export default class BoxDecal extends Decal {
  constructor({
    width = 1,
    height = 1,
    position = ZERO_POS,
    angle = 0,
    centered = true,
    solid = true,
    lineWidth = 1,
    color = 'black',
  } = {}) {
    super();
    this.width = width;
    this.height = height;
    this.position = coercePositionVector(position);
    this.angle = angle;
    this.centered = !!centered;
    this.solid = !!solid;
    this.lineWidth = lineWidth;
    this.color = color;
    this._cornerPositions = getRotationTranslationMatrix(-angle, this.position)
      .matMul(getScaleMatrix(width, height))
      .matMul(centered ? CENTERED_SQUARE : QUAD1_SQUARE);
  }

  xform(xformMatrix = required('xformMatrix')) {
    const scale = getXformMatrixScaleFactor(xformMatrix);
    return new BoxDecal({
      width: this.width * scale,
      height: this.height * scale,
      position: xformMatrix.matMul(this.position),
      angle: this.angle + getXformMatrixRotationAngle(xformMatrix),
      centered: this.centered,
      solid: this.solid,
      lineWidth: this.lineWidth * scale,
      color: this.color,
    });
  }

  getDomElement(
    xformMatrix = required('xformMatrix'),
    { key = undefined } = {},
  ) {
    let element;
    const scale = getXformMatrixScaleFactor(xformMatrix);
    const cornerPositions = xformMatrix.matMul(this._cornerPositions).arraySync();
    if (this.solid) {
      element = (
        <rect
          x={cornerPositions[0][3]}
          y={cornerPositions[1][3]}
          width={this.width * scale}
          height={this.height * scale}
          key={key}
        />
      );
    } else {
      const npoints = this._cornerPositions.shape[1];
      const lines = [];
      for (let i = 0; i < npoints; i++) {
        const j = (i + 1) % npoints;
        lines.push(
          <line
            className="plot__line"
            x1={cornerPositions[0][i]}
            y1={cornerPositions[1][i]}
            x2={cornerPositions[0][j]}
            y2={cornerPositions[1][j]}
            strokeWidth={this.lineWidth * scale}
            stroke={this.color}
            key={i}
          />,
        );
      }
      element = <g key={key}>{lines}</g>;
    }
    return element;
  }
}
