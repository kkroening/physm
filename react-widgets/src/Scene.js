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

    const visitFramePath = (frame, paths) => [
      ...paths.reduce((x, y) => [...x, ...y], []),
      frame,
    ];
    const getFrameParents = (frame) => frames.frames;
    const getFrameId = (frame) => frame.id;
    this.sortedFrames = daglet
      .toposort(this.frames, {
        getNodeParents: getFrameParents,
        getNodeKey: getFrameId,
      })
      .reverse();
    this.frameParentsMap = daglet.getChildMap(this.sortedFrames, {
      getNodeParents: getFrameParents,
      getNodeKey: getFrameId,
    });
    if (Object.values(this.frameParentsMap).some((x) => len(x) > 1)) {
      throw new Error('Frames should only have one parent'); // TODO: use AssertionError?
    }
    this.frameParentMap = Object.fromEntries(
      [...this.frameParentsMap].map(([frame, parents]) => [frame, parents[0]]),
    );
    this.framePathMap = daglet.transformNodes(this.sortedFrames, {
      getNodeParents: (frame) => this.frameParentsMap.get(frame),
      getNodeKey: getFrameId,
      visitNode: visitFramePath,
    });
  }

  getDomElement(
    stateMap = required('stateMap'),
    xformMatrix = tf.eye(3),
    { key = undefined } = {},
  ) {
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

  getInitialStateMap({ randomize = false } = {}) {
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
