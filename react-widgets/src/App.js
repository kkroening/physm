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

const pendulum1Length = 5;
const pendulum2Length = 5;

const pendulum2 = new RotationalFrame({
  id: 'pendulum2',
  initialState: [0, 0],
  decals: [
    new LineDecal({ endPos: [pendulum2Length, 0], lineWidth: 0.2 }),
    new CircleDecal({
      position: [pendulum2Length, 0],
      radius: 1,
      //color: 'green',
    }),
  ],
  position: [pendulum1Length, 0],
  weights: [new Weight(10, { position: [pendulum2Length, 0] })],
  resistance: 4,
});

const pendulum1 = new RotationalFrame({
  id: 'pendulum1',
  initialState: [Math.PI * -0.3, 0],
  decals: [
    new LineDecal({ endPos: [pendulum1Length, 0], lineWidth: 0.2 }),
    new CircleDecal({
      position: [pendulum1Length, 0],
      radius: 1,
    }),
  ],
  frames: [pendulum2],
  weights: [new Weight(5, { position: [pendulum1Length, 0] })],
  resistance: 4,
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
  frames: [pendulum1],
  weights: [new Weight(100)],
  resistance: 10,
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

const useAnimationFrame = (callback, params) => {
  const fps = (params && params.fps) || 60;
  const state = React.useRef({ prevTime: 0 });
  const requestRef = React.useRef();
  const timerRef = React.useRef();
  state.current.callback = callback;

  React.useEffect(() => {
    function animate(time) {
      const deltaTime = (time - state.current.prevTime) / 1000;
      state.current.callback(deltaTime);
      state.current.prevTime = time;
      timerRef.current = setTimeout(() => {
        requestRef.current = requestAnimationFrame(animate);
      }, 1000 / fps - deltaTime);
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

function App() {
  const [[translationX, translationY], setTranslation] = useState([300, 300]);
  const [scale, setScale] = useState(15);
  const pressedKeys = useKeyboard();
  const xformMatrix = getTranslationMatrix([translationX, translationY]).matMul(
    getScaleMatrix(scale, -scale),
  );
  const [stateMap, setStateMap] = useState(scene.getInitialStateMap());

  useAnimationFrame((deltaTime) => {
    let cartForce = 0;
    Object.entries({
      KeyA: () => {
        cartForce -= 2000;
      },
      KeyD: () => {
        cartForce += 2000;
      },
      Minus: () => setScale(scale * Math.exp(-deltaTime)),
      Equal: () => setScale(scale * Math.exp(deltaTime)),
      ArrowLeft: () => setTranslation(([x, y]) => [x + deltaTime * 150, y]),
      ArrowRight: () => setTranslation(([x, y]) => [x - deltaTime * 150, y]),
      ArrowUp: () => setTranslation(([x, y]) => [x, y + deltaTime * 150]),
      ArrowDown: () => setTranslation(([x, y]) => [x, y - deltaTime * 150]),
    }).forEach(([keyName, func]) => pressedKeys.has(keyName) && func());
    const externalForceMap = new Map([[cart.id, cartForce]]);
    let newStateMap = stateMap;
    for (let i = 0; i < 10; i++) {
      newStateMap = solver.tick(newStateMap, deltaTime / 10, externalForceMap);
    }
    if (!isValidStateMap(newStateMap)) {
      console.warn(
        'Encountered invalid state map; resetting to initial state...',
      );
      newStateMap = scene.getInitialStateMap();
    }
    setStateMap(newStateMap);
  });

  return (
    <div className="app__main">
      <div className="plot">
        <h2 className="plot__title">Poi-bot</h2>
        {
          //<p>Keys: {[...pressedKeys].join(', ')}</p>
        }
        {
          //<p>Scale: {scale.toFixed(2)}</p>
        }
        <div className="plot__main">
          <svg className="plot__svg">
            {scene.getDomElement(stateMap, xformMatrix)}
          </svg>
        </div>
      </div>
    </div>
  );
}

export default App;
