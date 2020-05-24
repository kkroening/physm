import React, { useEffect, useRef } from 'react';
import logo from './logo.svg';
import 'normalize.css';
import './App.css';

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

function VBox({children}) {
  return (
    <div className="vbox">
      {children}
    </div>
  )
}

function Slider({name, value}) {
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
        <canvas width={400} height={400} className="plot__canvas" ref={canvasRef} />
        <svg className="plot__svg">
          <line className="plot__line" x1={20} y1={30} x2={200} y2={220} strokeWidth={3} />
          <circle className="plot__circle" cx="50" cy="50" r="20" fill="blue"/>
        </svg>
      </div>
    </div>
  );
}

function App() {
  return (
    <div className="app__main">
      <img src={logo} className="app__logo" alt="logo" />
      <ControlPanel />
      <Plot />
    </div>
  );
}

export default App;
