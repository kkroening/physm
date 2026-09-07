import './App.css';
import 'normalize.css';
import * as tf from './tfjs';
import BoxDecal from './BoxDecal';
import CircleDecal from './CircleDecal';
import LineDecal from './LineDecal';
import { produce as producer } from 'immer';
import React from 'react';
import RotationalFrame from './RotationalFrame';
import RsSolver from './RsSolver';
import Scene from './Scene';
import TrackFrame from './TrackFrame';
import Weight from './Weight';
import { CoincidenceConstraint } from './Constraint';
import { getScaleMatrix } from './utils';
import { getTranslationMatrix } from './utils';
import { required } from './utils';
import { useEffect } from 'react';
import { useRef } from 'react';
import { useState } from 'react';
import { InvalidStateMapError } from './Solver';

// A rope slung between two poles on a rolling cart.
//
// The rope is two chains, one hanging from each pole, and they have to meet in
// the middle. No frame tree can say that: a frame has one parent, so the point
// where the chains join would need two. It is not a frame at all -- it is a
// coincidence constraint, adding two rows to the saddle-point system the solver
// assembles. See `docs/constraints.md`.
//
// The poles are rigid parts of the cart rather than jointed frames, because a
// pole hinged at its base is an inverted pendulum: whatever it starts at, it
// falls, and the rig is on the ground within seconds. Joint resistance only
// slows that down -- nothing in the model restores a frame toward an angle.
const cartMass = 250;
const cartResistance = 5;
const maxCartForce = 8500;
const cartWidth = 4;

const poleHeight = 8;
const poleMass = 30;
const poleBaseOffset = cartWidth / 3;

const chainSegmentCount = 5;
const chainSegmentLength = 1.4;
const chainSegmentMass = 2;
const chainSegmentDrag = 6;
const chainSegmentResistance = 1.5;

// Each chain starts on a circular arc -- every segment turns by the same amount
// -- running from steeply-downward at the pole to horizontal where the two meet.
// The arc keeps the initial shape exact rather than eyeballed, and it sags
// rather than pulling straight: a taut chain is a kinematic singularity, where
// every segment is collinear and the constraint Jacobian loses rank.
const chainSweep = 1.15;
const chainTurn = chainSweep / (chainSegmentCount - 1);
const chainSegmentAngles = Array.from(
  { length: chainSegmentCount },
  (unused, index) => -chainSweep + index * chainTurn,
);

const initialScale = 12;
const MIN_ANIMATION_FPS = 5;
const TARGET_ANIMATION_FPS = 60;
const TIME_SCALE = 1.5;
const TARGET_PHYSICS_FPS = 400 * TIME_SCALE;

function advance([x, y], angle, length) {
  return [x + length * Math.cos(angle), y + length * Math.sin(angle)];
}

// How far a chain reaches from the pole it hangs off. The poles are then placed
// exactly that far to either side of the cart's centreline, so the two chains
// meet on it -- the loop closes at `t = 0`, which is what this formulation
// needs: it holds `C̈` at zero, which leaves `C` free to keep whatever value it
// starts with, forever.
const chainReach = chainSegmentAngles.reduce(
  (point, angle) => advance(point, angle, chainSegmentLength),
  [0, 0],
);
const poleTips = [-1, 1].map((side) => [side * chainReach[0], poleHeight]);

// Built leaf-first, so each segment can be handed to its parent as a child.
function getChain(side) {
  return Array.from({ length: chainSegmentCount }, (unused, index) => index)
    .reverse()
    .reduce((childSegment, index) => {
      const first = index === 0;
      // A frame's coordinate is its angle relative to its parent. The cart does
      // not rotate, so the first segment's coordinate is just its arc angle;
      // every one after that is the arc's shared turn.
      const angle = first ? chainSegmentAngles[0] : chainTurn;
      // Mirroring about the cart's centreline sends an *absolute* angle `φ` to
      // `π − φ`, which is the first segment; the relative turns that follow are
      // differences of absolute angles, so for them the mirror is just a
      // negation.
      const mirrored = first ? Math.PI - angle : -angle;
      return new RotationalFrame({
        id: `chain${side < 0 ? 'L' : 'R'}${index}`,
        initialState: [side < 0 ? angle : mirrored, 0],
        position: first ? poleTips[side < 0 ? 0 : 1] : [chainSegmentLength, 0],
        decals: [
          new LineDecal({ endPos: [chainSegmentLength, 0], lineWidth: 0.18 }),
          new CircleDecal({ position: [chainSegmentLength, 0], radius: 0.16 }),
        ],
        weights: [
          new Weight(chainSegmentMass, {
            position: [chainSegmentLength, 0],
            drag: chainSegmentDrag,
          }),
        ],
        frames: childSegment ? [childSegment] : [],
        resistance: chainSegmentResistance,
      });
    }, null);
}

const cart = new TrackFrame({
  id: 'cart',
  decals: [
    new BoxDecal({
      width: cartWidth,
      height: cartWidth / 1.618,
      lineWidth: 0.2,
    }),
    ...poleTips.map(
      (tip, index) =>
        new LineDecal({
          startPos: [index === 0 ? -poleBaseOffset : poleBaseOffset, 0],
          endPos: tip,
          lineWidth: 0.35,
        }),
    ),
    ...poleTips.map((tip) => new CircleDecal({ position: tip, radius: 0.3 })),
  ],
  frames: [getChain(-1), getChain(1)],
  initialState: [0, 0],
  weights: [
    new Weight(cartMass),
    ...poleTips.map((tip) => new Weight(poleMass, { position: tip })),
  ],
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
}).addConstraint(
  new CoincidenceConstraint({
    frame1: `chainL${chainSegmentCount - 1}`,
    frame2: `chainR${chainSegmentCount - 1}`,
    position1: [chainSegmentLength, 0],
    position2: [chainSegmentLength, 0],
  }),
);

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
      <tbody>
        {aMat.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {[...row, bVec[rowIndex]].map((value, colIndex) => (
              <td key={colIndex}>{value}</td>
            ))}
          </tr>
        ))}
      </tbody>
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
    // React 18+ StrictMode mounts, unmounts and remounts in development, so
    // without this the Rust-side SolverContext from the first mount is orphaned.
    return () => {
      solver.current?.dispose();
      solver.current = null;
    };
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
        <h2 className="plot__title">Cart, Poles &amp; Rope</h2>
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
