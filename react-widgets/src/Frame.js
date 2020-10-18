import * as tf from './tfjs';
import React from 'react';
import { coercePositionVector } from './utils';
import { coerceStateTuple } from './utils';
import { generateRandomId } from './utils';
import { required } from './utils';
import { ZERO_POS } from './utils';
import { ZERO_STATE } from './utils';

export default class Frame {
  constructor({
    position = ZERO_POS,
    decals = [],
    weights = [],
    frames = [],
    resistance = 0,
    initialState = ZERO_STATE,
    id = null,
  } = {}) {
    this.id = id != null ? id : generateRandomId();
    this.position = coercePositionVector(position);
    this.decals = decals;
    this.weights = weights;
    this.frames = frames;
    this.resistance = resistance;
    this.initialState = coerceStateTuple(initialState);
  }

  getPosMatrix(q = required('q')) {
    return tf.eye(3);
  }

  getVelMatrix(q = required('q')) {
    return tf.zeros([3, 3]);
  }

  getAccelMatrix(q = required('q')) {
    return tf.zeros([3, 3]);
  }

  getDomElement(
    stateMap = required('stateMap'),
    xformMatrix = required('xformMatrix'),
    { key = undefined } = {},
  ) {
    const [q] = stateMap.has(this.id) ? stateMap.get(this.id) : ZERO_STATE;
    xformMatrix = xformMatrix.matMul(this.getPosMatrix(q));
    return (
      <g className="frame" key={key}>
        {this.decals.map((decal, index) =>
          decal.getDomElement(xformMatrix, { key: 'decal' + index }),
        )}
        {this.frames.map((frame, index) =>
          frame.getDomElement(stateMap, xformMatrix, { key: 'frame' + index }),
        )}
      </g>
    );
  }
}
