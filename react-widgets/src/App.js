import './App.css';
import 'normalize.css';
import * as tf from '@tensorflow/tfjs';
import CircleDecal from './CircleDecal';
import LineDecal from './LineDecal';
import logo from './logo.svg';
import producer from 'immer';
import React from 'react';
import RotationalFrame from './RotationalFrame';
import { getTranslationMatrix } from './utils';
import { useEffect } from 'react';
import { useRef } from 'react';
import { useState } from 'react';


const frame2 = new RotationalFrame({
  decals: [
    new LineDecal({ endPos: [80, 0] }),
    new CircleDecal({ position: [80, 0], radius: 15, color: 'green' }),
  ],
  position: [60, 0],
});

const frame1 = new RotationalFrame({
  decals: [
    new LineDecal({ endPos: [60, 0] }),
    new CircleDecal({ position: [60, 0], radius: 15, color: 'red' }),
  ],
  frames: [frame2],
});


function VBox({ children }) {
  return <div className="vbox">{children}</div>;
}

function Slider({ name, value }) {
  return (
    <div className="slider">
      <label className="slider__label">{name}</label>
      <div className="slider__container">
        <div className="slider__track">
          <span className="slider__knob" />
        </div>
      </div>
      <div className="slider__readout">{value}</div>
    </div>
  );
}

function ControlPanel() {
  return (
    <div className="control-panel">
      <p>Control panel</p>
      <VBox>
        <Slider name="slider1" value={1} />
        <Slider name="slider2" value={3.14} />
        <Slider name="slider with long name" value={123.456} />
      </VBox>
    </div>
  );
}

function Plot({ x, y }) {
  const stateMap = {[frame1.id]: [x, 0], [frame2.id]: [y, 0]};
  const xformMatrix = getTranslationMatrix([150, 150]);
  return (
    <div className="plot">
      <p className="plot__title">This is a plot.</p>
      <div className="plot__main">
        <svg className="plot__svg">
          {frame1.getDomElement(stateMap, xformMatrix)}
        </svg>
      </div>
    </div>
  );
}

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
  const pressedKeys = useKeyboard();
  const [count, setCount] = useState(0);
  useAnimationFrame((deltaTime) => {
    setCount((count) => count + deltaTime);
    if (pressedKeys.has('KeyD')) {
      setXY(([x, y]) => [x + deltaTime * 3, y]);
    }
    if (pressedKeys.has('KeyA')) {
      setXY(([x, y]) => [x - deltaTime * 3, y]);
    }
    if (pressedKeys.has('KeyW')) {
      setXY(([x, y]) => [x, y - deltaTime * 3]);
    }
    if (pressedKeys.has('KeyS')) {
      setXY(([x, y]) => [x, y + deltaTime * 3]);
    }
  });
  const debug = tf.add(tf.tensor1d([1, 2]), tf.tensor1d([3, 4])).toString();
  return (
    <div className="app__main">
      <img src={logo} className="app__logo" alt="logo" />
      <h2>{Math.round(count * 10) / 10}</h2>
      <p>{debug}</p>
      {
        //<p>{[...pressedKeys].join(', ')}</p>
      }
      <ControlPanel />
      <Plot x={x} y={y} />
    </div>
  );
}

export default App;
