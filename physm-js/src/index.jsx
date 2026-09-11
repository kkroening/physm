import './index.css';
import * as immer from 'immer';
import App from './App';
import Editor from './editor/Editor';
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
  // `#editor` opens the scene editor; anything else, the demo.
  // Read at load, so a change of hash reloads the page to switch.
  window.addEventListener('hashchange', () => window.location.reload());
  createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      {window.location.hash === '#editor' ? (
        <Editor />
      ) : (
        <App rsWasmModule={rsWasmModule} />
      )}
    </React.StrictMode>,
  );
}

init().then((rsWasmModule) => main(rsWasmModule));
