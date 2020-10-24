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

function initCpu() {
  tf.setBackend('cpu');
}

function initWebGL() {
  tf.env().set('WEBGL_CPU_FORWARD', false);
  tf.setBackend('webgl');
}

async function initWasm() {
  tfWasm.setWasmPaths('/');
  await tf.setBackend('wasm');
}

async function init() {
  tf.enableProdMode();
  initCpu();
  //initWebGL();
  //await initWasm();
}

function main() {
  ReactDOM.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
    document.getElementById('root'),
  );
}

init().then(() => main());

serviceWorker.unregister();
