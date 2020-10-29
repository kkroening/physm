import './App.css';
import 'normalize.css';
import * as tf from './tfjs';
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

const poiMass = 60;
const poiDrag = 20;
const ropeSegmentLength = 4;
const ropeSegmentDrag = 8;
const ropeSegmentMass = 1;
const ropeSegmentResistance = 20;
const ropeSegmentCount = 4;
const cartMass = 250;
const cartForce = 7000;
const cartResistance = 5;

const initialScale = 10;
const rungeKutta = true;
const MIN_ANIMATION_FPS = 5;
const TARGET_ANIMATION_FPS = 60;
const TARGET_PHYSICS_FPS = 120;

const segments = Array(ropeSegmentCount)
  .fill()
  .map((x, index) => index)
  .reduce((childFrames, index) => {
    const first = index === 0;
    const last = index === ropeSegmentCount - 1;
    const radius = first ? 1 : 0.4;
    const mass = first ? poiMass : ropeSegmentMass;
    const drag = first ? poiDrag : ropeSegmentDrag;
    const weights = [
      new Weight(mass, {
        position: [ropeSegmentLength, 0],
        drag: drag,
      }),
    ];
    return [
      new RotationalFrame({
        id: `segment${index}`,
        initialState: last ? [Math.PI * -0.3, 0] : [0, 0],
        decals: [
          new LineDecal({
            endPos: [ropeSegmentLength, 0],
            lineWidth: 0.2,
          }),
          new CircleDecal({
            position: [ropeSegmentLength, 0],
            radius: radius,
          }),
        ],
        frames: childFrames,
        position: [last ? 0 : ropeSegmentLength, 0],
        weights: weights,
        resistance: ropeSegmentResistance,
      }),
    ];
  }, []);

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
  weights: [new Weight(cartMass)],
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
    KeyA: () => setTranslation(([x, y]) => [x + deltaTime * 20, y]),
    KeyD: () => setTranslation(([x, y]) => [x - deltaTime * 20, y]),
    KeyW: () => setTranslation(([x, y]) => [x, y - deltaTime * 20]),
    KeyS: () => setTranslation(([x, y]) => [x, y + deltaTime * 20]),
  }).forEach(([keyName, func]) => pressedKeys.has(keyName) && func());
}

function getExternalForceMap(pressedKeys, deltaTime) {
  let cartForceValue = 0;
  Object.entries({
    ArrowLeft: () => {
      cartForceValue -= cartForce;
    },
    ArrowRight: () => {
      cartForceValue += cartForce;
    },
  }).forEach(([keyName, func]) => pressedKeys.has(keyName) && func());
  return new Map([[cart.id, cartForceValue]]);
}

function simulatePhysics(
  context,
  stateMap,
  externalForceMap,
  animationDeltaTime,
) {
  if (context) {
    console.log(`[js] Ticking; animationDeltaTime=${animationDeltaTime}`);
    context.tick(animationDeltaTime);
    return stateMap; // TODO: remove; temporary.
  }
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
  return tf.tidy(() =>
    getTranslationMatrix([300, 300])
      .matMul(getScaleMatrix(scale, -scale))
      .matMul(getTranslationMatrix(translation)),
  );
}

function App({ wasm }) {
  const [paused, setPaused] = useState(true);
  const [translation, setTranslation] = useState([0, 0]);
  const [scale, setScale] = useState(initialScale);
  const pressedKeys = useKeyboard();
  const [stateMap, setStateMap] = useState(scene.getInitialStateMap());
  const viewXformMatrix = getViewXformMatrix(translation, scale);
  const sceneDomElement = scene.getDomElement(stateMap, viewXformMatrix);
  viewXformMatrix.dispose();
  const context = useRef(null);

  useEffect(() => {
    //console.log('wasm:', wasm);
    console.log('[js] Creating context');
    context.current = wasm.create_context();
    window.context = context.current; // (for debugging)
    console.log('[js] context:', context.current);
  }, [wasm]);

  useAnimationFrame((deltaTime) => {
    handleViewControls(
      pressedKeys,
      deltaTime,
      scale,
      translation,
      setScale,
      setTranslation,
    );
    if (!paused) {
      const externalForceMap = getExternalForceMap(pressedKeys, deltaTime);
      const newStateMap = simulatePhysics(
        context.current,
        stateMap,
        externalForceMap,
        deltaTime,
      );
      setStateMap(newStateMap);
    }
  });

  const togglePaused = () => {
    setPaused(!paused);
  };

  return (
    <div className="app__main">
      <div className="plot">
        <h2 className="plot__title">CartPoi</h2>
        {<p>Number of tensors: {tf.memory().numTensors}</p>}
        {
          //<p>Keys: {[...pressedKeys].join(', ')}</p>
        }
        {
          //<p>Scale: {scale.toFixed(2)}</p>
        }
        <div className="plot__main">
          <svg className="plot__svg">{sceneDomElement}</svg>
        </div>
        <button onClick={togglePaused}>
          {paused ? 'Resume melting of CPU' : 'Pause'}
        </button>
      </div>
    </div>
  );
}

export default App;
