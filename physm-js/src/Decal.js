import { NotImplementedError } from './utils';
import { required } from './utils';

export default class Decal {
  dispose() {}

  xform(xformMatrix = required('xformMatrix')) {
    throw new NotImplementedError('abstract method');
  }

  getDomElement(
    xformMatrix = required('xformMatrix'),
    { key = undefined } = {},
  ) {
    throw new NotImplementedError('abstract method');
  }
}
