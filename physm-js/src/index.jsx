import './index.css';
import * as immer from 'immer';
import * as tf from '@tensorflow/tfjs';
import App from './App';
import React from 'react';
import { createRoot } from 'react-dom/client';

immer.enableMapSet();

window.tf = tf; // (for debugging)

function initTfCpuBackend() {
  tf.setBackend('cpu');
}

function initTfWebGLBackend() {
  tf.env().set('WEBGL_CPU_FORWARD', false);
  tf.setBackend('webgl');
}

async function initRsWasmModule() {
  const rsWasmModule = await import('physm-rs');
  window.wasm = rsWasmModule; // (for debugging)
  return rsWasmModule;
}

async function init() {
  tf.enableProdMode();
  initTfCpuBackend();
  //initTfWebGLBackend();
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
