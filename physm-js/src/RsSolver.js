import Solver from './Solver';
import { required } from './utils';

export default class RsSolver extends Solver {
  constructor(scene = required('scene')) {
    super();
    // TODO: create wasm scene.
  }

  dispose() {
    // TODO: free rs scene.
  }
}
