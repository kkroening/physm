import * as tf from '@tensorflow/tfjs';
import Frame from './Frame';
import { getTranslationMatrix } from './utils';
import { ZERO_POS } from './utils';
import { ZERO_STATE } from './utils';

export default class TrackFrame extends Frame {
  constructor({
    position = ZERO_POS,
    angle = 0,
    decals = [],
    masses = [],
    frames = [],
    resistance = 0,
    initialState = ZERO_STATE,
    id = null,
  } = {}) {
    super({
      angle: angle,
      decals: decals,
      masses: masses,
      frames: frames,
      resistance: resistance,
      initialState: initialState,
      position: position,
      id: id,
    });
    this.angle = angle;
  }

  xform(xformMatrix, { decals = null, masses = null, frames = null }) {
    return new TrackFrame({
      position: xformMatrix.matMul(this.position),
      angle: this.angle, // TODO: transform using xformMatrix.
      decals: decals != null ? decals : this.decals,
      masses: masses != null ? masses : this.masses,
      frames: frames != null ? frames : this.frames,
      resistance: this.resistance,
      initialState: this.initialState,
    });
  }

  getPosMatrix(q) {
    const position = this.position.dataSync();
    return getTranslationMatrix([
      position[0] + q * Math.cos(this.angle),
      position[1] + q * Math.sin(this.angle),
    ]);
  }

  getVelMatrix(q) {
    return tf.tensor2d([
      [0, 0, Math.cos(this.angle)],
      [0, 0, Math.sin(this.angle)],
      [0, 0, 0],
    ]);
  }
}
