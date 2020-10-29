import * as tf from './tfjs';
import { coercePositionVector } from './utils';
import { ZERO_POS } from './utils';

export default class Weight {
  constructor(mass = 1, { position = ZERO_POS, drag = 0 } = {}) {
    this.mass = mass;
    this.position = coercePositionVector(position);
    this.drag = drag;
  }

  dispose() {
    this.position.dispose();
  }

  xform(xformMatrix) {
    return new Weight({
      mass: this.mass,
      position: xformMatrix.matMul(this.position),
      drag: this.drag,
    });
  }

  toJsonObj() {
    return {
      mass: this.mass,
      position: tf.tidy(() => [...this.position.dataSync().slice(0, 2)]),
      drag: this.drag,
    }
  }
}
