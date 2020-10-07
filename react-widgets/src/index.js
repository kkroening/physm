import './index.css';
import * as serviceWorker from './serviceWorker';
import App from './App';
import React from 'react';
import ReactDOM from 'react-dom';
import * as immer from 'immer';
import * as tf from '@tensorflow/tfjs';

tf.setBackend('cpu');
immer.enableMapSet();

window.tf = tf; // (for debugging)

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById('root'),
);

serviceWorker.unregister();
