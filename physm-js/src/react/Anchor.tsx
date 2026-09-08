import * as vec3 from './../Vec3';
import FrameIdContext from './FrameIdContext';
import { useContext, useId, useImperativeHandle } from 'react';
import { useSceneNode } from './sceneNodes';
import type { AnchorPoint } from './sceneNodes';
import type { PositionLike } from './../Scene';
import type { Ref } from 'react';

export interface AnchorProps {
  position?: PositionLike;
  ref?: Ref<AnchorPoint>;
}

/**
 * A named point on the enclosing frame, handed out by ref.
 *
 * What a constraint is wired from when the frames were *generated* rather than
 * written. A `RopeChain` produces five frames and names none of them, so
 * nothing outside it can say `frame1="chainL4"` -- and asking the author to
 * predict a generated id is the problem the JSX authoring was meant to remove,
 * reappearing one level up. An anchor lets the chain mark its own tip and hand
 * the mark out:
 *
 * ```jsx
 * <RopeChain segments={5}>
 *   <Anchor ref={leftTip} position={[1.4, 0]} />
 * </RopeChain>
 *
 * <Coincidence frame1={leftTip} frame2={rightTip} />
 * ```
 *
 * It draws nothing and contributes nothing to the scene. It registers only so
 * that mounting one bumps the registry's version: the point travels by ref, and
 * a ref does not re-render anybody, so without the bump a constraint assembled
 * before the anchor mounted would stay unresolved with nothing to retry it.
 */
export default function Anchor({
  position = vec3.ORIGIN,
  ref,
}: AnchorProps): null {
  const frameId = useContext(FrameIdContext);

  if (!frameId) {
    throw new Error(
      'An <Anchor> must be inside a frame: it marks a point on one, and there ' +
        'is no frame at the root of a <Scene> for it to mark.',
    );
  }

  useImperativeHandle(ref, () => ({ frameId, position }), [frameId, position]);
  useSceneNode(
    useId(),
    { slot: 'anchor', build: () => ({ frameId, position }) },
    [frameId, JSON.stringify(position)],
  );

  return null;
}
