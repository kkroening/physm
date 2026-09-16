/**
 * `physm/react` — the React binding.
 *
 * Two halves that meet at `Scene`. The **authoring** components (`TrackFrame`,
 * `Box`, `Weight`, the constraints) describe a rig as JSX and render
 * nothing themselves; the **view** components (`SceneView` and below) draw an
 * already-assembled scene. `Scene` does both: it collects what its children
 * registered, builds a `physm` scene from them, and renders it.
 * `buildScene` builds the same scene from the same JSX without mounting it:
 * it walks the element tree and returns a `Scene` synchronously.
 *
 * The scene graph and the solvers import nothing from here: a `Scene`, `Frame`
 * or `Decal` builds, steps and serializes with no renderer present. The app
 * shell (`App.jsx`, `index.jsx`) is a React app and imports React freely --
 * the boundary is about what the core depends on, not about which files
 * mention React.
 */
export { default as Scene } from './Scene';
export { default as buildScene } from './buildScene';
export { default as SceneView } from './SceneView';
export { default as FrameView } from './FrameView';
export { default as DecalView } from './DecalView';

export { default as FixedFrame } from './FixedFrame';
export { default as RotationalFrame } from './RotationalFrame';
export { default as TrackFrame } from './TrackFrame';

export { default as Box } from './Box';
export { default as Circle } from './Circle';
export { default as Line } from './Line';
export { default as WorldLine } from './WorldLine';
export { default as Weight } from './Weight';
export { default as Spring } from './Spring';

export { default as Anchor } from './Anchor';
export { default as Coincidence } from './Coincidence';
export { default as Distance } from './Distance';

/**
 * Expression constructors, re-exported so one import serves a whole module.
 *
 * A prop can be computed rather than stated, and the emitted module writes
 * `position={mul(halfLength, 2)}` against this binding -- so what a person
 * hand-writes and what the editor writes import from the same place.
 */
export {
  add,
  div,
  dot,
  mul,
  neg,
  scale,
  sqrt,
  sub,
  vec,
  worldPoint,
  xOf,
  yOf,
} from './../expression';
