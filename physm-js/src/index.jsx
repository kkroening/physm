import './index.css';
import * as immer from 'immer';
import App from './App';
import React from 'react';
import { createRoot } from 'react-dom/client';

immer.enableMapSet();

async function initRsWasmModule() {
  const rsWasmModule = await import('physm-rs');
  window.wasm = rsWasmModule; // (for debugging)
  return rsWasmModule;
}

async function init() {
  return await initRsWasmModule();
}

function main(rsWasmModule) {
  createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App rsWasmModule={rsWasmModule} />
    </React.StrictMode>,
  );
}

init().then((rsWasmModule) => main(rsWasmModule));
