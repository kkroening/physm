import './App.css';
import 'normalize.css';
import { produce as producer } from 'immer';
import React from 'react';
import CartAndRope from './CartAndRope';
import { CART_FRAME_ID } from './CartAndRope';
import RsSolver from './RsSolver';
import Scene from './react/Scene';
import getViewXformMatrix from './getViewXformMatrix';
import { required } from './utils';
import { useEffect } from 'react';
import { useRef } from 'react';
import { useLayoutEffect } from 'react';
import { useState } from 'react';
import { InvalidStateMapError } from './Solver';

// How hard the arrow keys, a drag or a swipe push the cart. A control-input
// scale rather than scene geometry, which is why it stays here while the rig
// itself lives in `CartAndRope`.
const maxCartForce = 8500;

// Built once, at module scope, rather than as `<CartAndRope />` inline.
//
// `stateMap` changes sixty times a second, which re-renders `App` and every
// child element it rebuilds -- and the authoring components are children. They
// draw nothing, but each decal and weight computes a `JSON.stringify` of its
// props during render to build its dependency array, so an inline element would
// spend about twenty-five of those per frame concluding that nothing moved.
//
// A stable element lets React bail out of the whole subtree on identity. The
// bailout is safe here because everything under it reads only the registry and
// parent-key contexts, and `<Scene>` provides an identity-stable registry and a
// constant `null` to those.
const RIG = <CartAndRope />;

const initialScale = 12;
const MIN_ANIMATION_FPS = 5;
const TARGET_ANIMATION_FPS = 60;
const TIME_SCALE = 1.5;
const TARGET_PHYSICS_FPS = 400 * TIME_SCALE;

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
  return new Map([[CART_FRAME_ID, cartForce]]);
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

/**
 * Track an element's rendered size.
 *
 * The plot is `width: 100%; height: 100%` of a flex item, so its size is the
 * window's, not a constant -- and the view transform has to centre on it. A
 * `ResizeObserver` rather than a `resize` listener because the element also
 * changes size when the surrounding layout does, with no window event to hear.
 *
 * `useLayoutEffect`, not `useEffect`, and the first measurement is taken
 * synchronously rather than waited for. An effect runs *after* the browser
 * paints, so an observer started there cannot report until the second frame --
 * which would make the first painted frame a view centred on `(0, 0)`, the
 * element's own corner, with half the scene clipped away. A layout effect runs
 * before paint and its `setSize` is flushed before paint, so that frame never
 * reaches the screen.
 *
 * No guard on a null ref: `useMouse` and `useTouch` take this same ref and
 * dereference it bare, so an unmounted element already fails loudly here. A
 * guard would turn "not mounted yet" into a permanent zero -- the effect runs
 * once, since a ref's identity never changes -- which renders as a corner-
 * centred view rather than as an error.
 */
function useElementSize(ref) {
  const [size, setSize] = useState([0, 0]);

  useLayoutEffect(() => {
    const element = ref.current;
    const update = (width, height) =>
      setSize((current) =>
        // The *same array* when nothing moved, not an equal one: React skips a
        // re-render only on `Object.is`, so returning a fresh pair here would
        // re-render the whole scene on every observer delivery.
        width === current[0] && height === current[1]
          ? current
          : [width, height],
      );

    update(element.clientWidth, element.clientHeight);

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      update(width, height);
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, [ref]);

  return size;
}

function createSolver(
  scene = required('scene'),
  rsWasmModule = required('rsWasmModule'),
) {
  //console.log('[js] Creating solver');
  //const solver = new JsSolver(scene, { rungeKutta: false });
  // Stabilization is on by default and this demo is why: driven at the
  // frequency that walks the pendulum in circles, the two rope chains visibly
  // come apart within a minute without it. It costs a wasm boundary crossing
  // per step, since `RsSolver` cannot batch `tickCount` while the correction
  // runs on this side. See `docs/constraints.md` §7.
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
  // Both arrive on the second render: `<Scene>` assembles from what its
  // children registered, so there is no scene during the first one. `null`
  // until then, which `<Scene>` reads as "draw the initial pose".
  const [scene, setScene] = useState(null);
  const [stateMap, setStateMap] = useState(null);
  const plotSize = useElementSize(svgRef);
  const viewXformMatrix = getViewXformMatrix(translation, scale, plotSize);
  const solver = useRef(null);

  useEffect(() => {
    if (!scene) {
      return undefined;
    }

    solver.current = createSolver(scene, rsWasmModule);
    setStateMap(scene.getInitialStateMap());

    // React 18+ StrictMode mounts, unmounts and remounts in development, so
    // without this the Rust-side SolverContext from the first mount is orphaned.
    return () => {
      solver.current?.dispose();
      solver.current = null;
    };
  }, [scene, rsWasmModule]);

  useAnimationFrame((deltaTime) => {
    handleViewControls({
      deltaTime,
      pressedKeys,
      scale,
      setScale,
      setTranslation,
      translation,
    });
    if (!paused && solver.current) {
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
        {}
        {
          //<p>Keys: {[...pressedKeys].join(', ')}</p>
        }
        {
          //<p>Scale: {scale.toFixed(2)}</p>
        }
        <div className="plot__main">
          <svg className="plot__svg" ref={svgRef}>
            <Scene
              onSceneChange={setScene}
              stateMap={stateMap ?? undefined}
              xformMatrix={viewXformMatrix}
            >
              {RIG}
            </Scene>
          </svg>
        </div>
        <button onClick={togglePaused}>{paused ? 'Unpause' : 'Pause'}</button>
      </div>
      <MatrixViewer aMat={aMat} bVec={bVec} />
    </div>
  );
}

export default App;
