import './index.css';
import * as immer from 'immer';
import * as serviceWorker from './serviceWorker';
import * as tf from '@tensorflow/tfjs';
import App from './App';
import React from 'react';
import ReactDOM from 'react-dom';

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
