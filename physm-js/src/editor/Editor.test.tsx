import Box from './../react/Box';
import Coincidence from './../react/Coincidence';
import Editor from './Editor';
import Line from './../react/Line';
import RotationalFrame from './../react/RotationalFrame';
import Weight from './../react/Weight';
import coreComponents from './../react/coreComponents';
import { documentFrom } from './sceneDocument';
import { render, screen, within } from '@testing-library/react';

describe('Editor', () => {
  test('opens on the starter scene, with every pane showing it', () => {
    const { container } = render(<Editor />);

    expect(screen.getByRole('tab', { name: 'Scene' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // The code pane holds the whole module -- the defined component as well
    // as the scene that uses it.
    const code = screen.getByRole('region', { name: 'Code' }).textContent!;

    expect(code).toContain('function Pendulum(): ReactElement');
    expect(code).toContain('export default function Scene(): ReactElement');

    // The tree shows the scene's authored nodes, the defined component's
    // instance among them -- not the pendulum's own internals, which belong to
    // its definition.
    const tree = screen.getByRole('tree', { name: 'Scene' });

    expect(within(tree).getByText('TrackFrame')).toBeInTheDocument();
    expect(within(tree).getByText('Pendulum')).toBeInTheDocument();
    expect(within(tree).queryByText('Circle')).toBeNull();
    expect(within(tree).getByText('id="cart"')).toBeInTheDocument();

    // The scene was built and drawn, the pendulum's bob included -- the one part
    // of it the tree above leaves inside its definition.
    expect(container.querySelectorAll('.editor__scene circle')).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();

    // The library offers every building block, and the component this
    // document defines.
    const library = screen.getByRole('region', { name: 'Library' });
    for (const { meta } of coreComponents) {
      expect(within(library).getByText(meta.name)).toBeInTheDocument();
    }
    expect(within(library).getByText('Pendulum')).toBeInTheDocument();
  });

  test('a scene with no consistent start says why, and the editor stays up', () => {
    // The same pin added twice. The rig builds, but solving for velocities
    // consistent with its constraints finds four rows against two coordinates
    // -- a failure from computing the starting state, not from building it.
    const pin = (
      <Coincidence
        frame1="a"
        frame2="b"
        position1={[1, 1]}
        position2={[0, 1]}
      />
    );
    render(
      <Editor
        initialDocument={documentFrom(
          <>
            <RotationalFrame id="a" initialState={[0, 1]}>
              <Weight mass={1} position={[1, 0]} />
            </RotationalFrame>
            <RotationalFrame id="b" position={[1, 0]}>
              <Weight mass={1} position={[1, 0]} />
            </RotationalFrame>
            {pin}
            {pin}
          </>,
        )}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/over-determined/);
    expect(screen.getByRole('tree', { name: 'Scene' })).toBeVisible();
  });

  test('a scene that cannot be written says why, and the editor stays up', () => {
    // The builder never reads a definition's name, so this scene builds and
    // draws -- but no module can declare a component called `scene`.
    render(
      <Editor
        initialDocument={documentFrom(<Line endPos={[1, 0]} />, 'scene')}
      />,
    );

    expect(screen.getByRole('region', { name: 'Code' })).toHaveTextContent(
      /cannot be a component name/,
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('an unkeyed row and a sibling keyed with the same digits stay two rows', () => {
    // React holds keys as strings, so index 0 and key "0" must not meet.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(
        <Editor
          initialDocument={documentFrom(
            <>
              <Line endPos={[1, 0]} />
              <Box key="0" />
            </>,
          )}
        />,
      );

      expect(
        error.mock.calls.some(([message]) =>
          String(message).includes('same key'),
        ),
      ).toBe(false);
      expect(screen.getAllByRole('treeitem')).toHaveLength(2);
    } finally {
      error.mockRestore();
    }
  });

  test('a scene that does not build says why, and the editor stays up', () => {
    // A weight at the root has nowhere to go -- a half-made rig like this is
    // the normal state of a document being edited.
    render(<Editor initialDocument={documentFrom(<Weight mass={1} />)} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      /must be inside a frame/,
    );
    expect(screen.getByRole('region', { name: 'Code' }).textContent).toContain(
      '<Weight mass={1} />',
    );
  });
});
