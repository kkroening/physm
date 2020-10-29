import './index.css';
import * as immer from 'immer';
import * as serviceWorker from './serviceWorker';
import * as tf from '@tensorflow/tfjs';
import * as tfWasm from '@tensorflow/tfjs-backend-wasm';
import App from './App';
import React from 'react';
import ReactDOM from 'react-dom';

immer.enableMapSet();

window.tf = tf; // (for debugging)

function initTfCpuBackend() {
  tf.setBackend('cpu');
}

function initTfWebGLBackend() {
  tf.env().set('WEBGL_CPU_FORWARD', false);
  tf.setBackend('webgl');
}

async function initTfWasmBackend() {
  tfWasm.setWasmPaths('/');
  await tf.setBackend('wasm');
}

async function initWasm() {
  const wasm = await import('physm-rs');
  window.wasm = wasm; // (for debugging)
  return wasm;
}

async function init() {
  tf.enableProdMode();
  initTfCpuBackend();
  //initTfWebGLBackend();
  //await initTfWasmBackend();
  return await initWasm();
}

function main(wasm) {
  ReactDOM.render(
    <React.StrictMode>
      <App wasm={wasm} />
    </React.StrictMode>,
    document.getElementById('root'),
  );
}

init().then((wasm) => main(wasm));

serviceWorker.unregister();
