import * as tf from '@tensorflow/tfjs';
import Frame from './Frame';
import { coercePositionVector } from './utils';
import { ZERO_POS } from './utils';
import { ZERO_STATE } from './utils';

export default class RotationalFrame extends Frame {
  constructor({
    position = ZERO_POS,
    decals = [],
    masses = [],
    frames = [],
    resistance = 0,
    initialState = ZERO_STATE,
    id,
  } = {}) {
    super({
      decals: decals,
      masses: masses,
      frames: frames,
      resistance: resistance,
      initialState: initialState,
      position: position,
      id: id,
    });
  }

  xform(xformMatrix, { decals = null, masses = null, frames = null }) {
    decals = decals != null ? decals : this.decals;
    masses = masses != null ? masses : this.masses;
    frames = frames != null ? frames : this.frames;
    return new RotationalFrame({
      position: xformMatrix.dot(this.position),
      decals: decals,
      masses: masses,
      frames: frames,
      resistance: this.resistance,
      initialState: this.initialState,
    });
  }

  getPosMatrix(q) {
    const position = this.position.dataSync();
    const c = Math.cos(q);
    const s = Math.sin(q);
    return tf.tensor2d([
      [c, -s, position[0]],
      [s, c, position[1]],
      [0, 0, 1],
    ]);
  }

  getVelMatrix(q) {
    const c = Math.cos(q);
    const s = Math.sin(q);
    return tf.tensor2d([
      [-s, -c, 0],
      [c, -s, 0],
      [0, 0, 0],
    ]);
  }

  getAccelMatrix(q) {
    const c = Math.cos(q);
    const s = Math.sin(q);
    return tf.tensor2d([
      [-c, s, 0],
      [-s, -c, 0],
      [0, 0, 0],
    ]);
  }
}
