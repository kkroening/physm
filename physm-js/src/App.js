import './App.css';
import 'normalize.css';
import * as tf from './tfjs';
import BoxDecal from './BoxDecal';
import CircleDecal from './CircleDecal';
import JsSolver from './JsSolver';
import LineDecal from './LineDecal';
import producer from 'immer';
import React from 'react';
import RotationalFrame from './RotationalFrame';
import RsSolver from './RsSolver';
import Scene from './Scene';
import TrackFrame from './TrackFrame';
import Weight from './Weight';
import { getScaleMatrix } from './utils';
import { getTranslationMatrix } from './utils';
import { required } from './utils';
import { useEffect } from 'react';
import { useRef } from 'react';
import { useState } from 'react';
import { InvalidStateMapError } from './Solver';

const poiMass = 60;
const poiDrag = 20;
const ropeSegmentLength = 1.8;
const ropeSegmentDrag = 15;
const ropeSegmentMass = 1;
const ropeSegmentResistance = 20;
const ropeSegmentCount = 8;
const cartMass = 250;
const cartForce = 7000;
const cartResistance = 5;

const initialScale = 12;
const MIN_ANIMATION_FPS = 5;
const TARGET_ANIMATION_FPS = 60;
const TARGET_PHYSICS_FPS = 300;
const TIME_SCALE = 1;

const segments = Array(ropeSegmentCount)
  .fill()
  .map((x, index) => index)
  .reduce((childFrames, index) => {
    const first = index === 0;
    const last = index === ropeSegmentCount - 1;
    const radius = first ? 1 : 0.3;
    const mass = first ? poiMass : ropeSegmentMass;
    const drag = first ? poiDrag : ropeSegmentDrag;
    const weights = [
      new Weight(mass, {
        position: [ropeSegmentLength, 0],
        drag: drag,
      }),
    ];
    const decals = [
      new LineDecal({
        endPos: [ropeSegmentLength * 1.1, 0],
        lineWidth: 0.38,
      }),
    ];
    if (first || true) {
      decals.push(
        new CircleDecal({
          position: [ropeSegmentLength, 0],
          radius: radius,
        }),
      );
    }
    return [
      new RotationalFrame({
        id: `segment${index}`,
        initialState: last ? [Math.PI * 0.3, 0] : [0, 0],
        decals: decals,
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
  initialState: [0, 0],
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

function useKeyboard(callback = null) {
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
    function animate(time = required('time')) {
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

function handleViewControls({
  deltaTime = required('deltaTime'),
  pressedKeys = required('pressedKeys'),
  scale = required('scale'),
  setScale = required('setScale'),
  setTranslation = required('setTranslation'),
  translation = required('translation'),
} = {}) {
  Object.entries({
    Minus: () => setScale(scale * Math.exp(-deltaTime)),
    Equal: () => setScale(scale * Math.exp(deltaTime)),
    KeyH: () => setTranslation(([x, y]) => [x + deltaTime * 20, y]),
    KeyK: () => setTranslation(([x, y]) => [x - deltaTime * 20, y]),
    KeyU: () => setTranslation(([x, y]) => [x, y - deltaTime * 20]),
    KeyJ: () => setTranslation(([x, y]) => [x, y + deltaTime * 20]),
  }).forEach(([keyName, func]) => pressedKeys.has(keyName) && func());
}

function getExternalForceMap(pressedKeys, deltaTime) {
  let cartForceValue = 0;
  Object.entries({
    KeyA: () => {
      cartForceValue -= cartForce;
    },
    ArrowLeft: () => {
      cartForceValue -= cartForce;
    },
    KeyD: () => {
      cartForceValue += cartForce;
    },
    ArrowRight: () => {
      cartForceValue += cartForce;
    },
  }).forEach(([keyName, func]) => pressedKeys.has(keyName) && func());
  return new Map([[cart.id, cartForceValue]]);
}

function simulate(
  solver = required('solver'),
  externalForceMap = required('externalForceMap'),
  animationDeltaTime = required('animationDeltaTime'),
) {
  const startTime = new Date().getTime();
  const tickCount = Math.ceil(TARGET_PHYSICS_FPS * animationDeltaTime);
  const deltaTime = (animationDeltaTime / tickCount) * TIME_SCALE;
  try {
    solver.tick(deltaTime, tickCount, externalForceMap);
  } catch (error) {
    if (error instanceof InvalidStateMapError) {
      console.warn(
        'Encountered invalid state map; resetting to initial state...',
      );
      solver.resetStateMap();
    } else {
      throw error;
    }
  }
  const endTime = new Date().getTime();
  const realDeltaTime = (endTime - startTime) / 1000;
  if (realDeltaTime > MIN_ANIMATION_FPS) {
    console.warn(
      `Overshot physics computation deadline by ${realDeltaTime} seconds; unable ` +
        'to sustain desired animation FPS',
    );
  }
  return solver.getStateMap();
}

function getViewXformMatrix(translation, scale) {
  return tf.tidy(() =>
    getTranslationMatrix([300, 300])
      .matMul(getScaleMatrix(scale, -scale))
      .matMul(getTranslationMatrix(translation)),
  );
}

function createSolver(
  scene = required('scene'),
  rsWasmModule = required('rsWasmModule'),
) {
  //console.log('[js] Creating solver');
  //const solver = new JsSolver(scene, { rungeKutta: false });
  const solver = new RsSolver(scene, rsWasmModule, { rungeKutta: true });
  window.solver = solver; // (for debugging)
  //console.log('[js] Solver:', solver);
  return solver;
}

function App({ rsWasmModule }) {
  const [paused, setPaused] = useState(false);
  const [translation, setTranslation] = useState([0, 0]);
  const [scale, setScale] = useState(initialScale);
  const pressedKeys = useKeyboard();
  const [stateMap, setStateMap] = useState(scene.getInitialStateMap());
  const viewXformMatrix = getViewXformMatrix(translation, scale);
  const sceneDomElement = scene.getDomElement(stateMap, viewXformMatrix);
  viewXformMatrix.dispose();
  const solver = useRef(null);

  useEffect(() => {
    solver.current = createSolver(scene, rsWasmModule);
  }, [rsWasmModule]);

  useAnimationFrame((deltaTime) => {
    handleViewControls({
      deltaTime,
      pressedKeys,
      scale,
      setScale,
      setTranslation,
      translation,
    });
    if (!paused) {
      const externalForceMap = getExternalForceMap(pressedKeys, deltaTime);
      const newStateMap = simulate(solver.current, externalForceMap, deltaTime);
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
        {
          //<p>Number of tensors: {tf.memory().numTensors}</p>
        }
        {
          //<p>Keys: {[...pressedKeys].join(', ')}</p>
        }
        {
          //<p>Scale: {scale.toFixed(2)}</p>
        }
        <div className="plot__main">
          <svg className="plot__svg">{sceneDomElement}</svg>
        </div>
        <button onClick={togglePaused}>{paused ? 'Unpause' : 'Pause'}</button>
      </div>
    </div>
  );
}

export default App;
