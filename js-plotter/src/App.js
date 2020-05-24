import React, { useState } from "react";
import "./App.css";

function Plot({ xScale, yScale }) {
  const width = 500;
  const height = 320;
  let points = [];
  let lines = [];
  for (let i = 0; i < 100; i++) {
    const x = i / 5;
    const y = Math.sin(x);
    points.push([x, y]);
  }
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    const viewX1 = x1 * xScale;
    const viewX2 = x2 * xScale;
    const viewY1 = height / 2 - y1 * yScale;
    const viewY2 = height / 2 - y2 * yScale;
    lines.push(
      <line x1={viewX1} y1={viewY1} x2={viewX2} y2={viewY2} key={i} className="Plot__line" />
    );
  }
  return (
    <svg width={width} height={height}>
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        className="Plot__background"
      />
      {lines}
    </svg>
  );
}

function App() {
  const [xScale, setXScale] = useState(50);
  const [yScale, setYScale] = useState(160);
  const handleXScaleChange = (event) => {
    setXScale(parseInt(event.target.value));
  };
  const handleYScaleChange = (event) => {
    setYScale(parseInt(event.target.value));
  };
  return (
    <div className="App">
      <header className="App-header">
        <input
          type="range"
          min="0"
          max="100"
          value={xScale}
          onChange={handleXScaleChange}
        />
        <input
          type="range"
          min="0"
          max="320"
          value={yScale}
          onChange={handleYScaleChange}
        />
        <Plot xScale={xScale} yScale={yScale} />
      </header>
    </div>
  );
}

export default App;
