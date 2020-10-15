import * as daglet from './daglet';
import React from 'react';

export const DEFAULT_GRAVITY = 10;

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

    const getFrameChildren = (frame) => frame.frames;
    const getFrameId = (frame) => frame.id;
    this.sortedFrames = daglet
      .toposort(this.frames, {
        getNodeParents: getFrameChildren,
        getNodeKey: getFrameId,
      })
      .reverse();
    this.frameMap = new Map(
      this.sortedFrames.map((frame) => [frame.id, frame]),
    );
    const frameIdParentsMap = daglet.getChildMap(this.sortedFrames, {
      getNodeParents: getFrameChildren,
      getNodeKey: getFrameId,
    });
    if ([...frameIdParentsMap.values()].some((parents) => parents.size > 1)) {
      throw new Error('Frames should only have one parent'); // TODO: use AssertionError?
    }
    this.frameIdParentMap = new Map(
      [...frameIdParentsMap].map(([frameId, parents]) => [
        frameId,
        parents.size ? [...parents][0].id : null,
      ]),
    );
    this.frameIdPathMap = daglet.transformNodes(this.sortedFrames, {
      getNodeParents: (frame) => [...frameIdParentsMap.get(frame.id)],
      getNodeKey: getFrameId,
      visitNode: (frame, parentPaths) =>
        parentPaths.length ? [...parentPaths[0], frame.id] : [frame.id],
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
    let getInitialState;
    if (randomize) {
      const randPi = () => (Math.random() - 0.5) * Math.PI * 2; // TBD
      getInitialState = (frame) => [randPi(), randPi()];
    } else {
      getInitialState = (frame) => frame.initialState;
    }
    return new Map(
      this.sortedFrames.map((frame) => [frame.id, getInitialState(frame)]),
    );
  }
}
