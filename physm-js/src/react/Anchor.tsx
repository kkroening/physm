import FrameIdContext from './FrameIdContext';
import { useContext, useId, useImperativeHandle } from 'react';
import { useSceneNode } from './sceneNodes';
import type { AnchorPoint } from './sceneNodes';
import type { PositionLike } from './../Scene';
import type { Ref } from 'react';

export interface AnchorProps {
  id?: string;
  position?: PositionLike;
  ref?: Ref<AnchorPoint>;
}

/**
 * A named point on the enclosing frame.
 *
 * What a constraint is wired from when the frames were *generated* rather than
 * written. A `RopeChain` produces five frames and names none of them, so
 * nothing outside it can say `frame1="chainL4"` -- and asking the author to
 * predict a generated id is the problem the JSX authoring was meant to remove,
 * reappearing one level up. An anchor lets the chain mark its own tip, and a
 * constraint names the mark:
 *
 * ```jsx
 * <RopeChain segments={5}>
 *   <Anchor id="left-tip" position={[1.4, 0]} />
 * </RopeChain>
 *
 * <Coincidence frame1="left-tip" frame2="right-tip" />
 * ```
 *
 * **Prefer `id` to `ref`.** Both work, and a ref is still accepted, but a ref
 * is a cell a hook creates: the component holding it cannot be evaluated
 * outside a render, and nothing can serialize it. An id is a string, so a rig
 * written with ids is plain data all the way down.
 *
 * **Omitting `position` is meaningful**, not merely a default. A
 * `CoincidenceConstraint` solves for the attachment it is not given, which is
 * what closes the demo's rope loop across a gap nobody measured -- so
 * `<Anchor ref={tip} />` names the frame and leaves the point to be solved,
 * while `<Anchor ref={tip} position={[1.4, 0]} />` states it and gets the
 * check instead.
 *
 * It draws nothing and contributes nothing to the scene. It registers only so
 * that mounting one bumps the registry's version: the point travels by ref, and
 * a ref does not re-render anybody, so without the bump a constraint assembled
 * before the anchor mounted would stay unresolved with nothing to retry it.
 */
export default function Anchor({ id, position, ref }: AnchorProps): null {
  const frameId = useContext(FrameIdContext);

  if (!frameId) {
    throw new Error(
      'An <Anchor> must be inside a frame: it marks a point on one, and there ' +
        'is no frame at the root of a <Scene> for it to mark.',
    );
  }

  // `exactOptionalPropertyTypes` distinguishes an absent key from a present
  // `undefined`, and the absence is what means "solve for this point" -- so the
  // point is built by omitting the key rather than by setting it to undefined.
  const makePoint = (): AnchorPoint =>
    position === undefined ? { frameId } : { frameId, position };

  // The handle must not update *less* often than the node. A constraint reads
  // `ref.current` during assembly, which runs inside `Scene`'s `useMemo` -- and
  // only the node's registration bumps the version that re-runs it. So a change
  // that moved the point without re-registering would leave the memo serving a
  // scene built from the old one.
  //
  // Here the handle's deps compare `position` by identity and the node's by
  // value, so the handle re-runs at least as often: safe in the direction that
  // matters, wasteful in the other, and cheap either way.
  useImperativeHandle(ref, makePoint, [frameId, position]);
  useSceneNode(
    useId(),
    {
      slot: 'anchor',
      ...(id === undefined ? {} : { id }),
      build: makePoint,
    },
    [id, frameId, JSON.stringify(position)],
  );

  return null;
}
