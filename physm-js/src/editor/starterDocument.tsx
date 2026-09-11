import Box from './../react/Box';
import Circle from './../react/Circle';
import FixedFrame from './../react/FixedFrame';
import Line from './../react/Line';
import RotationalFrame from './../react/RotationalFrame';
import TrackFrame from './../react/TrackFrame';
import Weight from './../react/Weight';
import { nodesFrom } from './sceneDocument';
import type { DocNode, SceneDocument } from './sceneDocument';

/** Where the pendulum hangs from, on the cart, and how long its rod is. */
const PIVOT = [0, -0.5] as const;
const ROD_LENGTH = 4;

/**
 * Where the pendulum's children hang: its bob, raised by the drop to its own
 * pivot, so that another pendulum hung there pivots on the bob.
 */
const BOB_MOUNT = [ROD_LENGTH, -PIVOT[1]] as const;

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
 * children at its bob, so a pendulum added to its instance hangs from the bob.
 */
export default function starterDocument(): SceneDocument {
  const [frame] = nodesFrom(
    <RotationalFrame position={PIVOT} initialState={[-0.6, 0]} resistance={0.4}>
      <Line endPos={[ROD_LENGTH, 0]} lineWidth={0.15} />
      <Circle position={[ROD_LENGTH, 0]} radius={0.5} />
      <Weight mass={10} position={[ROD_LENGTH, 0]} />
      <FixedFrame position={BOB_MOUNT} />
    </RotationalFrame>,
  );

  // The place for the pendulum's children, which no JSX can write: in the
  // fixed frame at its bob.
  const [line, circle, weight, mount] = frame!.children;
  const pendulum: DocNode[] = [
    {
      ...frame!,
      children: [
        line!,
        circle!,
        weight!,
        {
          ...mount!,
          children: [{ type: { kind: 'children' }, props: {}, children: [] }],
        },
      ],
    },
  ];

  const [ground, cart] = nodesFrom(
    <>
      <Line startPos={[-12, -0.5]} endPos={[12, -0.5]} lineWidth={0.05} />
      <TrackFrame id="cart" resistance={5}>
        <Box width={2} height={1} />
        <Weight mass={50} />
      </TrackFrame>
    </>,
  );

  return {
    root: 'Scene',
    definitions: [
      { name: 'Pendulum', body: pendulum },
      {
        name: 'Scene',
        body: [
          ground!,
          { ...cart!, children: [...cart!.children, instanceOf('Pendulum')] },
        ],
      },
    ],
  };
}
