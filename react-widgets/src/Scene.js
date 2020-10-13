import * as daglet from './daglet';

const DEFAULT_GRAVITY = 10;

export default class Scene {
  constructor({
    decals = [],
    frames = [],
    springs = [],
    constraints = [],
    gravity = DEFAULT_GRAVITY,
  } = {}) {
    this.decals = decals;
    this.frames = frames;
    this.springs = springs;
    this.constraints = constraints;
    this.gravity = gravity;

    // TODO: clean this up:
    visitPath = (frame, paths) => [
      ...paths.reduce((x, y) => [...x, ...y], []),
      frame,
    ];
    getChildren = (frame) => frames.frames;
    this.sortedFrames = daglet.toposort(this.frames, getChildren).reverse();
    this.frameParentsMap = daglet.getChildMap(this.sortedFrames, getChildren);
    if (Object.values(this.frameParentsMap).some((x) => len(x) > 1)) {
      throw new Error('Frames should only have one parent'); // TODO: use AssertionError?
    }
    this.frameParentMap = Object.fromEntries(
      Object.entries(this.frameParentsMap).map(([frame, parents]) => [
        frame,
        parents[0],
      ]),
    );
    this.framePathMap = daglet.transformVertices(
      this.sortedFrames,
      this.frameParentsMap.get,
      visitPath,
    );
  }

  getDomElement(stateMap, xformMatrix = tf.eye(3), { key }) {
    return (
      <g className="scene" key={key}>
        {this.decals.map((decal, index) =>
          decal.getDomElement(xformMatrix, { key: 'decal' + index }),
        )}
        {this.frames.map((frame, index) =>
          frame.getDomElement(stateMap, xformMatrix, { key: 'frame' + index }),
        )}
      </g>
    );
  }

  getInitialStateMap(randomize = False) {
    const frames = daglet.toposort(this.frames, (frame) => frame.frames);
    let getInitialState;
    if (randomize) {
      const randPi = () => (Math.random() - 0.5) * Math.PI * 2; // TBD
      getInitialState = (frame) => [randPi(), randPi()];
    } else {
      getInitialState = (frame) => frame.initialState;
    }
    stateMap = Object.fromEntries(frames.map(getInitialState));
    let stateMap;
    return state_map;
  }
}
