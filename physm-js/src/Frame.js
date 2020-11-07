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
    typeName = null,
  } = {}) {
    this.id = id != null ? id : generateRandomId();
    this.typeName = typeName || this.constructor.name;
    this.position = coercePositionVector(position);
    this.decals = decals;
    this.weights = weights;
    this.frames = frames;
    this.resistance = resistance;
    this.initialState = coerceStateTuple(initialState);
  }

  dispose() {
    this.frames.forEach((frame) => frame.dispose());
    this.weights.forEach((weight) => weight.dispose());
    this.decals.forEach((decals) => decals.dispose());
    this.position.dispose();
  }

  getLocalPosMatrix(q = required('q')) {
    return tf.eye(3);
  }

  getLocalVelMatrix(q = required('q')) {
    return tf.zeros([3, 3]);
  }

  getLocalAccelMatrix(q = required('q')) {
    return tf.zeros([3, 3]);
  }

  getDomElement(
    stateMap = required('stateMap'),
    xformMatrix = required('xformMatrix'),
    { key = undefined } = {},
  ) {
    const [q] = stateMap.has(this.id) ? stateMap.get(this.id) : ZERO_STATE;
    xformMatrix = tf.tidy(() => xformMatrix.matMul(this.getLocalPosMatrix(q)));
    const domElement = (
      <g className="frame" key={key}>
        {this.decals.map((decal, index) =>
          decal.getDomElement(xformMatrix, { key: 'decal' + index }),
        )}
        {this.frames.map((frame, index) =>
          frame.getDomElement(stateMap, xformMatrix, {
            key: 'frame' + index,
          }),
        )}
      </g>
    );
    xformMatrix.dispose();
    return domElement;
  }

  toJsonObj({ includeDecals = false } = {}) {
    const obj = {
      frames: this.frames.map((frame) =>
        frame.toJsonObj({ includeDecals: includeDecals }),
      ),
      id: this.id,
      initialState: this.initialState,
      position: tf.tidy(() => [...this.position.dataSync().slice(0, -1)]),
      resistance: this.resistance,
      type: this.typeName,
      weights: this.weights.map((weight) => weight.toJsonObj()),
    };
    if (includeDecals) {
      obj.decals = this.decals.map((decal) => decal.toJsonObj());
    }
    return obj;
  }
}
