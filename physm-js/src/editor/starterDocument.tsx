import Box from './../react/Box';
import Circle from './../react/Circle';
import FixedFrame from './../react/FixedFrame';
import Line from './../react/Line';
import RotationalFrame from './../react/RotationalFrame';
import TrackFrame from './../react/TrackFrame';
import Weight from './../react/Weight';
import { nodesFrom } from './sceneDocument';
import type { DocNode, SceneDocument } from './sceneDocument';

/** How long the pendulum's rod is, and where its bob sits along it. */
const ROD_LENGTH = 4;
const BOB = [ROD_LENGTH, 0] as const;

/** Where the pendulum hangs from the cart: the bottom edge of its box. */
const CART_MOUNT = [0, -0.5] as const;

/** An instance of a component the document defines. */
function instanceOf(name: string): DocNode {
  return { type: { kind: 'defined', name }, props: {}, children: [] };
}

/**
 * What the editor opens with: a cart on a track, carrying a pendulum.
 *
 * Small on purpose: building blocks, and a component the document defines.
 * The ground and the cart are building blocks placed directly; the pendulum is a
 * component this document *defines*, so there is a second definition to open in
 * a tab and an instance of it to find in the scene's tree. It keeps a place for
 * children at its bob and pivots at its own origin, so a pendulum added to its
 * instance pivots on the ball, and every one after that on the ball before it.
 */
export default function starterDocument(): SceneDocument {
  // The pendulum pivots at its own origin, and keeps the place for its
  // children at its bob, so one hung in another pivots on the ball.
  const [frame] = nodesFrom(
    <RotationalFrame initialState={[-0.6, 0]} resistance={0.4}>
      <Line endPos={BOB} lineWidth={0.15} />
      <Circle position={BOB} radius={0.5} />
      <Weight mass={10} position={BOB} />
      <FixedFrame position={BOB} />
    </RotationalFrame>,
  );

  // The place for the pendulum's children, which no JSX can write: in the
  // fixed frame at its bob. Only that node is named, so a child added to the
  // JSX above still reaches the document.
  const [mount] = frame!.children.slice(-1);
  const pendulum: DocNode[] = [
    {
      ...frame!,
      children: frame!.children.map((child) =>
        child === mount
          ? {
              ...child,
              children: [
                { type: { kind: 'children' }, props: {}, children: [] },
              ],
            }
          : child,
      ),
    },
  ];

  // The pendulum hangs from a fixed frame on the cart, so where it hangs is
  // the cart's business rather than the pendulum's.
  const [ground, cart] = nodesFrom(
    <>
      <Line startPos={[-12, -0.5]} endPos={[12, -0.5]} lineWidth={0.05} />
      <TrackFrame id="cart" resistance={5}>
        <Box width={2} height={1} />
        <Weight mass={50} />
        <FixedFrame position={CART_MOUNT} />
      </TrackFrame>
    </>,
  );

  const [cartMount] = cart!.children.slice(-1);

  return {
    root: 'Scene',
    definitions: [
      { name: 'Pendulum', body: pendulum },
      {
        name: 'Scene',
        body: [
          ground!,
          {
            ...cart!,
            children: cart!.children.map((child) =>
              child === cartMount
                ? { ...child, children: [instanceOf('Pendulum')] }
                : child,
            ),
          },
        ],
      },
    ],
  };
}
