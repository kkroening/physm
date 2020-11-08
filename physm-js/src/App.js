import './App.css';
import 'normalize.css';
import * as tf from './tfjs';
import BoxDecal from './BoxDecal';
import CircleDecal from './CircleDecal';
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
const ropeSegmentLength = 1.6;
const ropeSegmentDrag = 8;
const ropeSegmentMass = 1;
const ropeSegmentResistance = 10;
const ropeSegmentCount = 5;
const cartMass = 250;
const maxCartForce = 8500;
const cartResistance = 5;

const initialScale = 12;
const MIN_ANIMATION_FPS = 5;
const TARGET_ANIMATION_FPS = 60;
const TIME_SCALE = 1.5;
const TARGET_PHYSICS_FPS = 400 * TIME_SCALE;

const stickLength = 8;
const segments = [0, 1].map((ropeNum) =>
  Array(ropeSegmentCount)
    .fill()
    .map((x, index) => index)
    .reduce((childSegment, index) => {
      const length = ropeSegmentLength * (1 + ropeNum * 0.02);
      const first = index === 0;
      const last = index === ropeSegmentCount - 1;
      const radius = first ? 1 : 0.3 / 2;
      const mass = first ? poiMass : ropeSegmentMass;
      const drag = first ? poiDrag : ropeSegmentDrag;
      const weights = [
        new Weight(mass, {
          position: [length, 0],
          drag: drag,
        }),
      ];
      const decals = [
        new LineDecal({
          endPos: [length * 1.03, 0],
          lineWidth: 0.3,
        }),
      ];
      if (first || true) {
        decals.push(
          new CircleDecal({
            position: [length, 0],
            radius: radius,
          }),
        );
      }
      return new RotationalFrame({
        id: `segment${ropeNum}-${index}`,
        initialState: last ? [Math.PI * 0.3 * (2 * ropeNum + 1), 0] : [0, 0],
        decals: decals,
        frames: childSegment ? [childSegment] : [],
        position: [last ? stickLength : length, 0],
        weights: weights,
        resistance: ropeSegmentResistance,
      });
    }, null),
);

const stick = new RotationalFrame({
  id: 'stick',
  decals: [
    new LineDecal({
      endPos: [stickLength * 1.02, 0],
      lineWidth: 0.45,
    }),
    new CircleDecal({ position: [stickLength, 0], radius: 0.5 }),
  ],
  weights: [new Weight(40, { position: [stickLength, 0], drag: 15 })],
  frames: segments,
});

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
  frames: [stick],
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

function useMouse(elementRef = required('elementRef')) {
  const [startLocation, setStartLocation] = useState(null);
  const [endLocation, setEndLocation] = useState(null);

  useEffect(() => {
    function handleMouseDown(event) {
      console.log('start', event);
      setStartLocation([event.x, event.y]);
      setEndLocation(null);
    }
    function handleMouseMove(event) {
      setEndLocation([event.x, event.y]);
    }
    function handleMouseUp(event) {
      console.log('end');
      setStartLocation(null);
      setEndLocation(null);
    }
    const element = elementRef.current;
    element.addEventListener('mousedown', handleMouseDown);
    element.addEventListener('mousemove', handleMouseMove);
    element.addEventListener('mouseup', handleMouseUp);
    return () => {
      element.removeEventListener('mousedown', handleMouseDown);
      element.removeEventListener('mousemove', handleMouseMove);
      element.removeEventListener('mouseup', handleMouseUp);
    };
  }, [elementRef]);

  const locationDelta =
    startLocation && endLocation
      ? [endLocation[0] - startLocation[0], endLocation[1] - startLocation[1]]
      : null;
  return locationDelta;
}

function useTouch(elementRef = required('elementRef')) {
  const [startLocation, setStartLocation] = useState(null);
  const [endLocation, setEndLocation] = useState(null);

  useEffect(() => {
    function handleTouchStart(event) {
      if (event.which === 0 && event.touches.length > 0) {
        setStartLocation([event.touches[0].clientX, event.touches[0].clientY]);
        setEndLocation(null);
      }
      event.preventDefault();
    }
    function handleTouchMove(event) {
      if (event.which === 0 && event.touches.length > 0) {
        setEndLocation([event.touches[0].clientX, event.touches[0].clientY]);
      }
      event.preventDefault();
    }
    function handleTouchEnd(event) {
      if (event.which === 0) {
        setStartLocation(null);
        setEndLocation(null);
      }
      event.preventDefault();
    }
    const element = elementRef.current;
    element.addEventListener('touchstart', handleTouchStart);
    element.addEventListener('touchmove', handleTouchMove);
    element.addEventListener('touchend', handleTouchEnd);
    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [elementRef]);

  const locationDelta =
    startLocation && endLocation
      ? [endLocation[0] - startLocation[0], endLocation[1] - startLocation[1]]
      : null;
  return locationDelta;
}

const useAnimationFrame = (
  callback = required('callback'),
  { fps = TARGET_ANIMATION_FPS } = {},
) => {
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

function getExternalForceMap(
  pressedKeys = required('pressedKeys'),
  clickLocationDelta = required('clickLocationDelta'),
  touchLocationDelta = required('touchLocationDelta'),
  deltaTime = required('deltaTime'),
) {
  let cartForce = 0;
  if (pressedKeys.has('KeyA') || pressedKeys.has('ArrowLeft')) {
    cartForce -= maxCartForce;
  } else if (pressedKeys.has('KeyD') || pressedKeys.has('ArrowRight')) {
    cartForce += maxCartForce;
  }
  if (clickLocationDelta) {
    cartForce += (clickLocationDelta[0] / 200) * maxCartForce;
  }
  if (touchLocationDelta) {
    cartForce += (touchLocationDelta[0] / 60) * maxCartForce;
  }
  if (Math.abs(cartForce) > maxCartForce) {
    cartForce = Math.sign(cartForce) * maxCartForce;
  }
  return new Map([[cart.id, cartForce]]);
}

function simulate(
  solver = required('solver'),
  externalForceMap = required('externalForceMap'),
  animationDeltaTime = required('animationDeltaTime'),
) {
  const deltaTime = TIME_SCALE / TARGET_PHYSICS_FPS;
  let tickCount = Math.floor(
    Math.min(animationDeltaTime / deltaTime, TARGET_PHYSICS_FPS),
  );
  if (animationDeltaTime > 1 / MIN_ANIMATION_FPS) {
    tickCount = Math.floor(
      Math.min(tickCount, TARGET_PHYSICS_FPS / MIN_ANIMATION_FPS),
    );
    console.warn(
      `Falling below minimum desired animation FPS; limiting simulation to ${tickCount} ticks`,
    );
  }
  try {
    solver.tick(
      deltaTime,
      Math.min(tickCount, TARGET_PHYSICS_FPS),
      externalForceMap,
    );
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

function MatrixViewer({ aMat, bVec }) {
  return (
    <table>
      {aMat.map((row, rowIndex) => (
        <tr key={rowIndex}>
          {[...row, bVec[rowIndex]].map((value, colIndex) => (
            <td key={colIndex}>{value}</td>
          ))}
        </tr>
      ))}
    </table>
  );
}

function App({ rsWasmModule }) {
  const [paused, setPaused] = useState(true);
  const [translation, setTranslation] = useState([0, 0]);
  const [scale, setScale] = useState(initialScale);
  const svgRef = React.useRef();
  const pressedKeys = useKeyboard();
  const clickLocationDelta = useMouse(svgRef);
  const touchLocationDelta = useTouch(svgRef);
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
      const externalForceMap = getExternalForceMap(
        pressedKeys,
        clickLocationDelta,
        touchLocationDelta,
        deltaTime,
      );
      const newStateMap = simulate(solver.current, externalForceMap, deltaTime);
      setStateMap(newStateMap);
    }
  });

  const togglePaused = () => {
    setPaused(!paused);
  };

  const aMat = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ];
  const bVec = [10, 11, 12];
  return (
    <div className="app__main">
      <div className="plot">
        <h2 className="plot__title">Double CartPoi</h2>
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
          <svg className="plot__svg" ref={svgRef}>
            {sceneDomElement}
          </svg>
        </div>
        <button onClick={togglePaused}>{paused ? 'Unpause' : 'Pause'}</button>
      </div>
      <MatrixViewer aMat={aMat} bVec={bVec} />
    </div>
  );
}

export default App;
