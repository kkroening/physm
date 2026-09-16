import CoreLineDecal from './../LineDecal';
import FrameIdContext from './FrameIdContext';
import { computed } from './../expression';
import { useContext, useId } from 'react';
import { refuseChildren, useSceneNode } from './sceneNodes';
import type { Computable } from './../expression';
import type { ComponentMeta } from './componentMeta';
import type { PositionLike } from './../Scene';
import type { SceneNode, SceneNodeContext } from './sceneNodes';

interface WorldLineValues {
  startPos: PositionLike;
  endPos: PositionLike;
  lineWidth?: number;
  color?: string;
}

/**
 * What an element may be given: any of them may be computed.
 *
 * And unlike every other building block, an endpoint may be computed from
 * something only the running scene knows -- which is the point of it.
 */
export type WorldLineProps = Computable<WorldLineValues>;

function describeWorldLine(
  props: WorldLineProps,
  { frameId }: SceneNodeContext,
): SceneNode {
  if (frameId) {
    throw new Error(
      `A <WorldLine> is drawn in world coordinates, and this one is inside ` +
        `the frame '${frameId}', whose coordinates move with it. Put it at ` +
        'the root of the <Scene>, or use a <Line> if the geometry really does ' +
        'belong to the frame.',
    );
  }

  // Folded per tick rather than where the props were handed over, because an
  // endpoint may be a value nothing can work out until the scene is posed.
  // This is the one building block that does its own folding; everything else
  // is handed values. See `buildScene`.
  return {
    slot: 'worldDecal',
    build: (tick) => new CoreLineDecal(computed<WorldLineValues>(props, tick)),
  };
}

/**
 * A straight segment between two points in the world.
 *
 * The wish list's own example, by way of
 * [0016 page 2](../../../docs/issues/0016/02-values.md): a line between two
 * points on *different* bodies. Those two points have no common frame, and
 * their separation is a function of the pose, so there is no frame in which
 * this line has fixed endpoints and no `<Line>` prop that could express it.
 *
 * ```jsx
 * <WorldLine
 *   startPos={worldPoint('cart', [0, 0])}
 *   endPos={worldPoint('ball', [0.5, 0])}
 * />
 * ```
 *
 * **It is drawn over the rig rather than under it.** A world-space decal is
 * produced *after* the pose walk rather than during assembly, so paint order
 * against a frame's own decals is a decision rather than something to inherit
 * ([page 9](../../../docs/issues/0016/09-elements.md)) -- and drawing it last
 * is the answer that keeps it visible, since a line exists to show a
 * relationship between bodies and would otherwise disappear behind them.
 *
 * Both endpoints are required. A world line from the origin is a plausible
 * thing to want and an implausible thing to have meant by omission.
 */
export default function WorldLine(props: WorldLineProps): null {
  refuseChildren('WorldLine', (props as { children?: unknown }).children);
  const key = useId();
  const frameId = useContext(FrameIdContext);

  // `frameId` joins the signature because the describer reads it: a signature
  // that has fallen behind its describer leaves the memo serving a scene built
  // from the old node.
  useSceneNode(key, describeWorldLine(props, { key, frameId }), {
    ...props,
    frameId,
  });

  return null;
}

WorldLine.sceneNode = describeWorldLine;

WorldLine.meta = {
  name: 'WorldLine',
  category: 'Shapes',
  slot: 'worldDecal',
  description: 'A straight segment between two points in the world.',
  props: {
    startPos: {
      kind: 'point',
      label: 'Start',
      required: true,
      initial: [0, 0],
    },
    endPos: { kind: 'point', label: 'End', required: true, initial: [1, 0] },
    lineWidth: { kind: 'length', label: 'Line width', default: 1 },
    color: { kind: 'color', label: 'Colour', default: 'black' },
  },
} satisfies ComponentMeta<WorldLineValues>;
