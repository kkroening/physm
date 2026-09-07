import '@testing-library/jest-dom/vitest';
import * as immer from 'immer';
import * as tf from '@tensorflow/tfjs';

// Immer's Map/Set support is opt-in, and Scene keys frames by id in a Map.
immer.enableMapSet();

// The pure-JS CPU backend. Tests used to swap in `@tensorflow/tfjs-node` via a
// manual mock for speed; that package is a native addon with no darwin-arm64
// build, so it is gone and `src/tfjs.js` now resolves to plain tfjs everywhere.
await tf.setBackend('cpu');
await tf.ready();
