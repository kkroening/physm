import './App.css';
import 'normalize.css';
import BoxDecal from './BoxDecal';
import CircleDecal from './CircleDecal';
import LineDecal from './LineDecal';
import producer from 'immer';
import React from 'react';
import RotationalFrame from './RotationalFrame';
import Scene from './Scene';
import Solver from './Solver';
import TrackFrame from './TrackFrame';
import Weight from './Weight';
import { getScaleMatrix } from './utils';
import { getTranslationMatrix } from './utils';
import { useEffect } from 'react';
import { useRef } from 'react';
import { useState } from 'react';

const poiMass = 40;
const poiDrag = 12;
const ropeSegmentLength = 6;
const ropeSegmentDrag = 5;
const ropeSegmentMass = 1;
const ropeSegmentResistance = 30;
const ropeSegmentCount = 2;
const cartForce = 5000;
const cartResistance = 5;
const rungeKutta = false;

const MIN_ANIMATION_FPS = 1;
const TARGET_ANIMATION_FPS = 30;
const TARGET_PHYSICS_FPS = 80;

const poi = new RotationalFrame({
  id: 'poi',
  initialState: [0, 0],
  decals: [
    new LineDecal({ endPos: [ropeSegmentLength, 0], lineWidth: 0.2 }),
    new CircleDecal({
      position: [ropeSegmentLength, 0],
      radius: 1,
    }),
  ],
  position: [ropeSegmentLength, 0],
  weights: [
    new Weight(poiMass, { position: [ropeSegmentLength, 0], drag: poiDrag }),
  ],
  resistance: ropeSegmentResistance,
});

const isLastRopeSegment = (segmentIndex) =>
  segmentIndex === ropeSegmentCount - 2;

const segments = Array(ropeSegmentCount - 1)
  .fill()
  .map((x, index) => index)
  .reduce(
    (childFrames, index) => [
      new RotationalFrame({
        id: `segment${index}`,
        initialState: isLastRopeSegment(index) ? [Math.PI * -0.3, 0] : [0, 0],
        decals: [
          new LineDecal({ endPos: [ropeSegmentLength, 0], lineWidth: 0.2 }),
          new CircleDecal({
            position: [ropeSegmentLength, 0],
            radius: 0.4,
          }),
        ],
        frames: childFrames,
        position: isLastRopeSegment(index) ? [0, 0] : [ropeSegmentLength, 0],
        weights: [
          new Weight(ropeSegmentMass, {
            position: [ropeSegmentLength, 0],
            drag: ropeSegmentDrag,
          }),
        ],
        resistance: ropeSegmentResistance,
      }),
    ],
    [poi],
  );

const cart = new TrackFrame({
  id: 'cart',
  decals: [
    new BoxDecal({
      width: 3,
      height: 3 / 1.618,
      //color: 'blue',
      lineWidth: 0.2,
    }),
  ],
  frames: segments,
  weights: [new Weight(150)],
  resistance: cartResistance,
});

const scene = new Scene({
  frames: [cart],
  decals: [
    new LineDecal({
      startPos: [-300, 0],
      endPos: [300, 0],
      color: 'gray',
      lineWidth: 0.1,
    }),
  ],
});
const solver = new Solver(scene);

function useKeyboard(callback) {
  const [pressedKeys, setPressedKeys] = useState(new Set());
  const callbackRef = useRef();
  callbackRef.current = callback;

  useEffect(() => {
    function handleKeyDown({ code, keyCode }) {
      setPressedKeys((pressedKeys) => {
        if (!pressedKeys.has(code)) {
          pressedKeys = producer(pressedKeys, (draft) => {
            draft.add(code);
          });
          callbackRef.current &&
            callbackRef.current({
              keyName: code,
              keyId: keyCode,
              pressed: true,
            });
        }
        return pressedKeys;
      });
    }
    function handleKeyUp({ code, keyCode }) {
      setPressedKeys((pressedKeys) => {
        if (pressedKeys.has(code)) {
          pressedKeys = producer(pressedKeys, (draft) => {
            draft.delete(code);
          });
          callbackRef.current &&
            callbackRef.current({
              keyName: code,
              keyId: keyCode,
              pressed: false,
            });
        }
        return pressedKeys;
      });
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return pressedKeys;
}

const useAnimationFrame = (callback, { fps = TARGET_ANIMATION_FPS } = {}) => {
  const state = React.useRef({ prevTime: 0 });
  const requestRef = React.useRef();
  const timerRef = React.useRef();
  state.current.callback = callback;

  React.useEffect(() => {
    function animate(time) {
      const deltaTime = (time - state.current.prevTime) / 1000;
      const delay = Math.max(1000 / fps - deltaTime, 0);
      state.current.callback(deltaTime);
      state.current.prevTime = time;
      timerRef.current = setTimeout(() => {
        requestRef.current = requestAnimationFrame(animate);
      }, delay);
    }

    requestRef.current = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(requestRef.current);
      timerRef.current && clearTimeout(timerRef.current);
    };
  }, [fps]);
};

function isValidStateMap(stateMap) {
  return [...stateMap].every(([frameId, [q, qd]]) => !isNaN(q) && !isNaN(qd));
}

function handleViewControls(
  pressedKeys,
  deltaTime,
  scale,
  translation,
  setScale,
  setTranslation,
) {
  Object.entries({
    Minus: () => setScale(scale * Math.exp(-deltaTime)),
    Equal: () => setScale(scale * Math.exp(deltaTime)),
    ArrowLeft: () => setTranslation(([x, y]) => [x + deltaTime * 20, y]),
    ArrowRight: () => setTranslation(([x, y]) => [x - deltaTime * 20, y]),
    ArrowUp: () => setTranslation(([x, y]) => [x, y - deltaTime * 20]),
    ArrowDown: () => setTranslation(([x, y]) => [x, y + deltaTime * 20]),
  }).forEach(([keyName, func]) => pressedKeys.has(keyName) && func());
}

function getExternalForceMap(pressedKeys, deltaTime) {
  let cartForceValue = 0;
  Object.entries({
    KeyA: () => {
      cartForceValue -= cartForce;
    },
    KeyD: () => {
      cartForceValue += cartForce;
    },
  }).forEach(([keyName, func]) => pressedKeys.has(keyName) && func());
  return new Map([[cart.id, cartForceValue]]);
}

function simulatePhysics(stateMap, externalForceMap, animationDeltaTime) {
  const startTime = new Date().getTime();
  const deadline = startTime + 1000 / MIN_ANIMATION_FPS;
  const tickCount = Math.ceil(TARGET_PHYSICS_FPS * animationDeltaTime);
  const deltaTime = animationDeltaTime / tickCount;
  for (let timeIndex = 0; timeIndex < tickCount; timeIndex++) {
    if (new Date().getTime() > deadline) {
      console.warn(
        'Deadline exceeded for physics computation; ' +
          `skipping ${tickCount - timeIndex} ticks`,
      );
      break;
    }
    stateMap = solver.tick(stateMap, deltaTime, externalForceMap, {
      rungeKutta: rungeKutta,
    });
  }
  if (!isValidStateMap(stateMap)) {
    console.warn(
      'Encountered invalid state map; resetting to initial state...',
    );
    stateMap = scene.getInitialStateMap();
  }
  return stateMap;
}

function getViewXformMatrix(translation, scale) {
  return getTranslationMatrix([300, 300])
    .matMul(getScaleMatrix(scale, -scale))
    .matMul(getTranslationMatrix(translation));
}

function App() {
  const [translation, setTranslation] = useState([0, 0]);
  const [scale, setScale] = useState(10);
  const pressedKeys = useKeyboard();
  const [stateMap, setStateMap] = useState(scene.getInitialStateMap());
  const viewXformMatrix = getViewXformMatrix(translation, scale);

  useAnimationFrame((deltaTime) => {
    handleViewControls(
      pressedKeys,
      deltaTime,
      scale,
      translation,
      setScale,
      setTranslation,
    );
    const externalForceMap = getExternalForceMap(pressedKeys, deltaTime);
    const newStateMap = simulatePhysics(stateMap, externalForceMap, deltaTime);
    setStateMap(newStateMap);
  });

  return (
    <div className="app__main">
      <div className="plot">
        <h2 className="plot__title">CartPoi</h2>
        {
          //<p>Keys: {[...pressedKeys].join(', ')}</p>
        }
        {
          //<p>Scale: {scale.toFixed(2)}</p>
        }
        <div className="plot__main">
          <svg className="plot__svg">
            {scene.getDomElement(stateMap, viewXformMatrix)}
          </svg>
        </div>
      </div>
    </div>
  );
}

export default App;
