import * as tf from './tfjs';
import Frame from './Frame';
import { getTranslationMatrix } from './utils';
import { getXformMatrixRotationAngle } from './utils';
import { required } from './utils';
import { ZERO_POS } from './utils';
import { ZERO_STATE } from './utils';

export default class TrackFrame extends Frame {
  constructor({
    position = ZERO_POS,
    angle = 0,
    decals = [],
    weights = [],
    frames = [],
    resistance = 0,
    initialState = ZERO_STATE,
    id = undefined,
  } = {}) {
    super({
      angle: angle,
      decals: decals,
      weights: weights,
      frames: frames,
      resistance: resistance,
      initialState: initialState,
      position: position,
      id: id,
    });
    this.angle = angle;
  }

  xform(
    xformMatrix = required('xformMatrix'),
    { decals = undefined, weights = undefined, frames = undefined } = {},
  ) {
    return new TrackFrame({
      position: xformMatrix.matMul(this.position),
      angle: this.angle + getXformMatrixRotationAngle(xformMatrix),
      decals: decals != null ? decals : this.decals,
      weights: weights != null ? weights : this.weights,
      frames: frames != null ? frames : this.frames,
      resistance: this.resistance,
      initialState: this.initialState,
    });
  }

  getLocalPosMatrix(q = required('q')) {
    const position = this.position.dataSync();
    return getTranslationMatrix([
      position[0] + q * Math.cos(this.angle),
      position[1] + q * Math.sin(this.angle),
    ]);
  }

  getLocalVelMatrix(q = required('q')) {
    return tf.tensor2d([
      [0, 0, Math.cos(this.angle)],
      [0, 0, Math.sin(this.angle)],
      [0, 0, 0],
    ]);
  }

  toJsonObj(options = {}) {
    return { angle: this.angle, ...super.toJsonObj(options) };
  }
}
