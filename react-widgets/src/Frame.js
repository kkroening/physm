import * as tf from '@tensorflow/tfjs';
import React from 'react';
import { coercePositionVector } from './utils';
import { coerceStateTuple } from './utils';
import { generateRandomId } from './utils';
import { ZERO_POS } from './utils';
import { ZERO_STATE } from './utils';

export default class Frame {
  constructor({
    position = ZERO_POS,
    decals = [],
    masses = [],
    frames = [],
    resistance = 0,
    initialState = ZERO_STATE,
    id,
  } = {}) {
    this.id = id != null ? id : generateRandomId();
    this.position = coercePositionVector(position);
    this.decals = decals;
    this.masses = masses;
    this.frames = frames;
    this.resistance = resistance;
    this.initialState = coerceStateTuple(initialState);
  }

  getPosMatrix(q) {
    return tf.eye(3);
  }

  getVelMatrix(q) {
    return tf.zeros([3, 3]);
  }

  getAccelMatrix(q) {
    return tf.zeros((3, 3));
  }

  getDomElement(stateMap, xformMatrix, { key } = {}) {
    const [positionState, _] = this.id in stateMap ? stateMap[this.id] : ZERO_STATE;
    xformMatrix = xformMatrix.matMul(this.getPosMatrix(positionState));
    return (
      <g className="frame" key={key}>
        {this.decals.map((decal, index) =>
          decal.getDomElement(xformMatrix, { key: index }),
        )}
        {this.frames.map((frame, index) =>
          frame.getDomElement(stateMap, xformMatrix, { key: index }),
        )}
      </g>
    );
  }
}
