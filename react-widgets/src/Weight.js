import { coercePositionVector } from './utils';
import { ZERO_POS } from './utils';

export default class Weight {
  constructor(mass = 1, { position = ZERO_POS, drag = 0 }={}) {
    this.mass = mass;
    this.position = coercePositionVector(position);
    this.drag = drag;
  }

  xform(xformMatrix) {
    return new Weight({
      mass: this.mass,
      position: xformMatrix.matMul(this.position),
      drag: this.drag,
    });
  }
}
