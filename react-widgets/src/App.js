import './App.css';
import 'normalize.css';
import logo from './logo.svg';
import producer from 'immer';
import React from 'react';
import { useEffect } from 'react';
import { useRef } from 'react';
import { useState } from 'react';

function renderToCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.save();
  ctx.beginPath();
  ctx.clearRect(0, 0, width, height);
  ctx.translate(width / 2, height / 2);
  ctx.fillStyle = '#4397AC';
  ctx.fillRect(-width / 4, -height / 4, width / 2, height / 2);
  ctx.restore();
}

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

function Plot() {
  const canvasRef = useRef(null);
  useEffect(() => renderToCanvas(canvasRef.current));
  return (
    <div className="plot">
      <p className="plot__title">This is a plot.</p>
      <div className="plot__main">
        <canvas
          width={400}
          height={400}
          className="plot__canvas"
          ref={canvasRef}
        />
        <svg className="plot__svg">
          <line
            className="plot__line"
            x1={20}
            y1={30}
            x2={200}
            y2={220}
            strokeWidth={3}
          />
          <circle
            className="plot__circle"
            cx="50"
            cy="50"
            r="20"
            fill="green"
          />
        </svg>
      </div>
    </div>
  );
}

function useKeyboard(callback) {
  const [pressedKeys, setPressedKeys] = useState(new Set());

  useEffect(() => {
    function handleKeyDown({ code, keyCode }) {
      setPressedKeys((pressedKeys) => {
        if (!pressedKeys.has(keyCode)) {
          pressedKeys = producer(pressedKeys, (draft) => {
            draft.add(keyCode);
          });
          callback && callback({ name: code, id: keyCode, pressed: true });
        }
        return pressedKeys;
      });
    }
    function handleKeyUp({ code, keyCode }) {
      setPressedKeys((pressedKeys) => {
        if (pressedKeys.has(keyCode)) {
          pressedKeys = producer(pressedKeys, (draft) => {
            draft.delete(keyCode);
          });
          callback && callback({ name: code, id: keyCode, pressed: false });
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
  }, [callback]);

  return pressedKeys;
}

function App() {
  const pressedKeys = useKeyboard();
  return (
    <div className="app__main">
      <img src={logo} className="app__logo" alt="logo" />
      <p>{[...pressedKeys].join(', ')}</p>
      <ControlPanel />
      <Plot />
    </div>
  );
}

export default App;
