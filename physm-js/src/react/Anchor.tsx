import FrameIdContext from './FrameIdContext';
import { useContext, useId, useImperativeHandle } from 'react';
import { useSceneNode } from './sceneNodes';
import type { AnchorNode, AnchorPoint, SceneNodeContext } from './sceneNodes';
import type { PositionLike } from './../Scene';
import type { Ref } from 'react';

export interface AnchorProps {
  id?: string;
  position?: PositionLike;
  ref?: Ref<AnchorPoint>;
}

function describeAnchor(
  { id, position }: AnchorProps,
  { frameId }: SceneNodeContext,
): AnchorNode {
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

  return {
    slot: 'anchor',
    ...(id === undefined ? {} : { id }),
    build: makePoint,
  };
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
 * `<Anchor id="tip" />` names the frame and leaves the point to be solved,
 * while `<Anchor id="tip" position={[1.4, 0]} />` states it and gets the
 * check instead.
 *
 * It draws nothing, and registers for two reasons. An id-named anchor's point
 * is read out of its registration by the assembly pass. And mounting one bumps
 * the registry's version, which is what retries a ref-named end: a ref does not
 * re-render anybody, so without the bump a constraint assembled before the
 * anchor mounted would stay unresolved with nothing to retry it.
 */
export default function Anchor(props: AnchorProps): null {
  const { id, position, ref } = props;
  const frameId = useContext(FrameIdContext);
  const key = useId();
  const node = describeAnchor(props, { key, frameId });

  // The handle must never be staler than the node. A constraint reads
  // `ref.current` during assembly, which runs inside `Scene`'s `useMemo` -- and
  // only the node's registration bumps the version that re-runs it. So a change
  // that moved the point without re-registering would leave the memo serving a
  // scene built from the old one.
  //
  // No dependency list, so the handle is refreshed on every render: more often
  // than the node re-registers, which is safe in the direction that matters and
  // cheap in the other.
  useImperativeHandle(ref, () => node.build());
  useSceneNode(key, node, [id, frameId, JSON.stringify(position)]);

  return null;
}

Anchor.sceneNode = describeAnchor;
