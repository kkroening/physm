import React, { useState } from 'react';
import './App.css';

function App() {
  const [value, setValue] = useState(false);
  return (
    <div className="App">
      <header className="App-header">
        <button onClick={() => setValue(!value)}>Click me</button>
        <p>{value ? "Clicked" : "Not clicked"}</p>
      </header>
    </div>
  );
}

export default App;
