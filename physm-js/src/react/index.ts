/**
 * `physm/react` — the React binding.
 *
 * Two halves that meet at `Scene`. The **authoring** components (`TrackFrame`,
 * `BoxDecal`, `Weight`, the constraints) describe a rig as JSX and render
 * nothing themselves; the **view** components (`SceneView` and below) draw an
 * already-assembled scene. `Scene` does both: it collects what its children
 * registered, builds a `physm` scene from them, and renders it.
 *
 * Nothing in `physm-js/src` outside this directory imports React, so the
 * scene graph and the solvers remain usable with no renderer present.
 */
export { default as Scene } from './Scene';
export { default as SceneView } from './SceneView';
export { default as FrameView } from './FrameView';
export { default as DecalView } from './DecalView';

export { default as RotationalFrame } from './RotationalFrame';
export { default as TrackFrame } from './TrackFrame';

export { default as BoxDecal } from './BoxDecal';
export { default as CircleDecal } from './CircleDecal';
export { default as LineDecal } from './LineDecal';
export { default as Weight } from './Weight';

export { default as CoincidenceConstraint } from './CoincidenceConstraint';
export { default as DistanceConstraint } from './DistanceConstraint';
