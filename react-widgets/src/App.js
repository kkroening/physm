import './App.css';
import 'normalize.css';
import BoxDecal from './BoxDecal';
import CircleDecal from './CircleDecal';
import LineDecal from './LineDecal';
import producer from 'immer';
import React from 'react';
import RotationalFrame from './RotationalFrame';
import TrackFrame from './TrackFrame';
import Weight from './Weight';
import { getScaleMatrix } from './utils';
import { getTranslationMatrix } from './utils';
import { useEffect } from 'react';
import { useRef } from 'react';
import { useState } from 'react';

const ball1Position = [60, 0];
const ball2Position = [80, 0];

const frame2 = new RotationalFrame({
  decals: [
    new LineDecal({ endPos: ball2Position }),
    new CircleDecal({ position: ball2Position, radius: 15, color: 'green' }),
  ],
  position: [60, 0],
  weights: [new Weight(10, { position: ball2Position })],
});

const frame1 = new RotationalFrame({
  decals: [
    new LineDecal({ endPos: ball1Position }),
    new CircleDecal({ position: ball1Position, radius: 15, color: 'red' }),
  ],
  frames: [frame2],
  weights: [new Weight(5, { position: ball1Position })],
});

const frame0 = new TrackFrame({
  decals: [
    new LineDecal({ startPos: [-300, 0], endPos: [300, 0], color: 'gray' }), // TODO: move to scene.
    new BoxDecal({
      width: 40,
      height: 40 / 1.618,
      color: 'blue',
      lineWidth: 6,
    }),
  ],
  frames: [frame1],
  weights: [new Weight(20)],
});

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

function App() {
  const [[x, y], setXY] = useState([0, 0]);
  const [[translationX, translationY], setTranslation] = useState([300, 300]);
  const [scale, setScale] = useState(1);
  const pressedKeys = useKeyboard();
  const stateMap = {
    [frame0.id]: [x, 0],
    [frame1.id]: [y, 0],
    [frame2.id]: [y * -1.73, 0],
  };
  const xformMatrix = getTranslationMatrix([translationX, translationY]).matMul(
    getScaleMatrix(scale),
  );

  useAnimationFrame((deltaTime) => {
    Object.entries({
      KeyA: () => setXY(([x, y]) => [x - deltaTime * 150, y]),
      KeyD: () => setXY(([x, y]) => [x + deltaTime * 150, y]),
      KeyW: () => setXY(([x, y]) => [x, y - deltaTime * 4]),
      KeyS: () => setXY(([x, y]) => [x, y + deltaTime * 4]),
      Minus: () => setScale(scale * Math.exp(-deltaTime)),
      Equal: () => setScale(scale * Math.exp(deltaTime)),
      BracketLeft: () => setTranslation(([x, y]) => [x + deltaTime * 150, y]),
      BracketRight: () => setTranslation(([x, y]) => [x - deltaTime * 150, y]),
    }).forEach(([keyName, func]) => pressedKeys.has(keyName) && func());
  });

  return (
    <div className="app__main">
      <div className="plot">
        <h2 className="plot__title">Smashteroids</h2>
        {
          //<p>Keys: {[...pressedKeys].join(', ')}</p>
        }
        {
          //<p>Scale: {scale.toFixed(2)}</p>
        }
        <div className="plot__main">
          <svg className="plot__svg">
            {frame0.getDomElement(stateMap, xformMatrix)}
          </svg>
        </div>
      </div>
    </div>
  );
}

export default App;
