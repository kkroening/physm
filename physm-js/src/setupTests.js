import '@testing-library/jest-dom/vitest';
import * as immer from 'immer';

// Immer's Map/Set support is opt-in, and `Scene` keys frames by id in a `Map`
// that key handling drives through `produce`. Nothing here is tfjs's -- this
// file lost it once to a sweep looking for tfjs setup, and without it the first
// test to drive a key event fails on immer's "MapSet plugin not loaded".
immer.enableMapSet();

// jsdom implements no `ResizeObserver`, and `App` uses one to centre the view
// on the plot's rendered size. A stub rather than a polyfill: nothing under
// test asserts anything about resizing, and a real implementation would need a
// layout engine jsdom does not have. Elements therefore stay at zero size,
// which is a case `getViewXformMatrix.test.ts` pins directly.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
