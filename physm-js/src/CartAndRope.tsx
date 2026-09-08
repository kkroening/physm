import Anchor from './react/Anchor';
import Box from './react/Box';
import Circle from './react/Circle';
import Coincidence from './react/Coincidence';
import Line from './react/Line';
import RotationalFrame from './react/RotationalFrame';
import TrackFrame from './react/TrackFrame';
import Weight from './react/Weight';
import { useRef } from 'react';
import type { AnchorPoint } from './react/sceneNodes';
import type { ReactElement, ReactNode } from 'react';

/**
 * The one written id in the rig, and the reason it is written.
 *
 * Every other frame here is generated and named by its component key, which is
 * the point -- a `RopeChain` names none of what it produces. But the controls
 * push the cart from *outside* the scene, and `<Anchor>` only wires one part of
 * a scene to another. So the cart needs a name something else can hold, and
 * this is it: exported rather than duplicated, because a literal on each side
 * would diverge silently -- an external force keyed to no frame contributes
 * zero and reports nothing, leaving the arrow keys quietly dead.
 */
export const CART_FRAME_ID = 'cart';

const CART_MASS = 250;
const CART_RESISTANCE = 5;
const CART_WIDTH = 4;

// The poles are rigid parts of the cart rather than jointed frames, because a
// pole hinged at its base is an inverted pendulum: whatever it starts at, it
// falls, and the rig is on the ground within seconds. Joint resistance only
// slows that down -- nothing in the model restores a frame toward an angle.
const POLE_HEIGHT = 1;
const POLE_MASS = 30;
const POLE_BASE_OFFSET = CART_WIDTH / 3;

const SEGMENT_COUNT = 5;
const SEGMENT_LENGTH = 1.4;
const SEGMENT_MASS = 2;
const SEGMENT_DRAG = 6;
const SEGMENT_RESISTANCE = 1.5;

// Each chain starts on a circular arc -- every segment turns by the same amount
// -- running from steeply-downward at the pole to horizontal where the two meet.
// The arc keeps the initial shape exact rather than eyeballed, and it sags
// rather than pulling straight: a taut chain is a kinematic singularity, where
// every segment is collinear and the constraint Jacobian loses rank.
const SWEEP = 1.15;
const TURN = SWEEP / (SEGMENT_COUNT - 1);

// Round numbers, chosen to look right. They are *not* required to make the two
// chains meet, and they don't: at this spacing the left chain's end lands some
// way from the right one's. The constraint solves for where on the right chain
// the left one attaches, so the loop closes exactly whatever these are set to.
//
// That is the difference between a rig that has to be derived and one that can
// be dragged around. Nothing here has to be recomputed when the segment count,
// the sag angle or the pole height changes.
const POLE_TIPS = [-1, 1].map((side): readonly [number, number] => [
  side * 5,
  -POLE_HEIGHT,
]);

const TIP = [SEGMENT_LENGTH, 0] as const;

interface RopeSegmentProps {
  position: readonly [number, number];
  angle: number;
  children?: ReactNode;
}

/** One link: a hinge, the line and bob that draw it, and its mass. */
function RopeSegment({
  position,
  angle,
  children,
}: RopeSegmentProps): ReactElement {
  return (
    <RotationalFrame
      position={position}
      initialState={[angle, 0]}
      resistance={SEGMENT_RESISTANCE}
    >
      <Line endPos={TIP} lineWidth={0.18} />
      <Circle position={TIP} radius={0.16} />
      <Weight mass={SEGMENT_MASS} position={TIP} drag={SEGMENT_DRAG} />
      {children}
    </RotationalFrame>
  );
}

interface RopeChainProps {
  anchor: readonly [number, number];
  mirror?: boolean;
  index?: number;
  children?: ReactNode;
}

/**
 * A chain of `SEGMENT_COUNT` links, hung from `anchor`.
 *
 * Recursion, where the imperative version folded an array leaf-first with
 * `reduce` so that each segment could be handed to its parent as a
 * constructor argument. Nesting is what that was imitating.
 *
 * `children` lands on the *tip*, so "what hangs off the end" is just nesting
 * too -- which is how the loop-closing `<Anchor>` gets there without this
 * component knowing anything about constraints.
 */
function RopeChain({
  anchor,
  mirror = false,
  index = 0,
  children,
}: RopeChainProps): ReactNode {
  // `>=`, not `===`: the counter is an internal accumulator, but it is a
  // declared prop, so an `index` past the end would otherwise recurse without
  // bound rather than terminating.
  if (index >= SEGMENT_COUNT) {
    return children;
  }

  // A frame's coordinate is its angle relative to its parent. The cart does not
  // rotate, so the first segment's coordinate is just its arc angle; every one
  // after that is the arc's shared turn.
  const first = index === 0;
  const angle = first ? -SWEEP : TURN;

  // Mirroring about the cart's centreline sends an *absolute* angle `φ` to
  // `π − φ`, which is the first segment; the relative turns that follow are
  // differences of absolute angles, so for them the mirror is a negation.
  const mirrored = first ? Math.PI - angle : -angle;

  return (
    <RopeSegment
      position={first ? anchor : TIP}
      angle={mirror ? mirrored : angle}
    >
      <RopeChain anchor={anchor} mirror={mirror} index={index + 1}>
        {children}
      </RopeChain>
    </RopeSegment>
  );
}

/**
 * The demo rig: a cart on a track, two rigid poles, and a rope slung between
 * them and closed by a constraint.
 *
 * The rope is two chains, one hanging from each pole, and they have to meet in
 * the middle. **No frame tree can say that**: a frame has one parent, so the
 * point where the chains join would need two. It is not a frame at all -- it is
 * a coincidence constraint, adding two rows to the saddle-point system the
 * solver assembles. See `docs/constraints.md`.
 *
 * The two chains are wired together through anchors rather than frame ids,
 * because `RopeChain` generates its frames and names none of them. The right
 * anchor deliberately states no point: `<Coincidence>` solves for the
 * attachment it is not given, which is what closes the loop across the gap the
 * round numbers above leave.
 */
export default function CartAndRope(): ReactElement {
  const leftTip = useRef<AnchorPoint>(null);
  const rightTip = useRef<AnchorPoint>(null);

  return (
    <>
      <Line
        startPos={[-300, 0]}
        endPos={[300, 0]}
        lineWidth={0.1}
        color="gray"
      />

      <TrackFrame id={CART_FRAME_ID} resistance={CART_RESISTANCE}>
        <Box width={CART_WIDTH} height={CART_WIDTH / 1.618} lineWidth={0.2} />
        <Weight mass={CART_MASS} />

        {POLE_TIPS.map((tip, index) => (
          <Line
            key={`pole${index}`}
            startPos={[index === 0 ? -POLE_BASE_OFFSET : POLE_BASE_OFFSET, 0]}
            endPos={tip}
            lineWidth={0.35}
          />
        ))}
        {POLE_TIPS.map((tip, index) => (
          <Circle key={`cap${index}`} position={tip} radius={0.3} />
        ))}
        {POLE_TIPS.map((tip, index) => (
          <Weight key={`poleMass${index}`} mass={POLE_MASS} position={tip} />
        ))}

        <RopeChain anchor={POLE_TIPS[0]!}>
          <Anchor ref={leftTip} position={TIP} />
        </RopeChain>
        <RopeChain anchor={POLE_TIPS[1]!} mirror>
          {/* No position: this is the attachment the constraint solves for. */}
          <Anchor ref={rightTip} />
        </RopeChain>
      </TrackFrame>

      <Coincidence frame1={leftTip} frame2={rightTip} />
    </>
  );
}
