import Anchor from './../react/Anchor';
import Box from './../react/Box';
import Circle from './../react/Circle';
import Coincidence from './../react/Coincidence';
import Editor from './Editor';
import JsSolver from './../JsSolver';
import Line from './../react/Line';
import RotationalFrame from './../react/RotationalFrame';
import TrackFrame from './../react/TrackFrame';
import Weight from './../react/Weight';
import coreComponents from './../react/coreComponents';
import emitScene, { rangeKey } from './emitScene';
import starterDocument from './starterDocument';
import { InvalidStateMapError } from './../Solver';
import { documentFrom, nodesFrom } from './sceneDocument';
import type { DocNode, SceneDocument } from './sceneDocument';
import { vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';

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

    expect(code).toContain(
      'function Pendulum({ children }: { children?: ReactNode }): ReactElement',
    );
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

  test('while an edit does not build, the last scene that built stays, dimmed', () => {
    const { container } = render(
      <Editor
        initialDocument={documentFrom(
          <>
            <RotationalFrame id="pole">
              <Circle position={[4, 0]} radius={0.5} />
              <Weight mass={10} position={[4, 0]} />
            </RotationalFrame>
            <TrackFrame id="cart">
              <Weight mass={50} />
            </TrackFrame>
          </>,
        )}
      />,
    );
    const id = (): HTMLElement =>
      within(select('TrackFrame')).getByLabelText('Id');

    // Two frames named `pole` do not build.
    fireEvent.change(id(), { target: { value: 'pole' } });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      container.querySelector('.editor__scene .editor__stale circle'),
    ).not.toBeNull();

    // Only the scene: no gizmo, which would make it look grabbable.
    expect(container.querySelector('.editor__gizmo')).toBeNull();

    fireEvent.change(id(), { target: { value: 'pole2' } });

    expect(screen.queryByRole('alert')).toBeNull();
    expect(container.querySelector('.editor__stale')).toBeNull();
    expect(container.querySelector('.editor__scene circle')).not.toBeNull();
  });

  test('the kept scene goes with its component, not to a later one of the name', () => {
    const { container } = render(<Editor />);
    const tree = (): HTMLElement => screen.getByRole('tree', { name: 'Scene' });
    const add = (name: string): void => {
      fireEvent.click(
        within(screen.getByRole('region', { name: 'Library' })).getByRole(
          'button',
          { name },
        ),
      );
    };

    // A frame holding a constraint with no ends: the scene stops building.
    add('TrackFrame');
    add('Coincidence');

    // The box alone builds, as `Foo`, and is drawn in its tab...
    select('Box');
    extract('Foo');

    // ...and undone, `Foo` is gone. A failing subtree then takes the name.
    fireEvent.click(undoButton());
    fireEvent.click(within(tree()).getAllByText('TrackFrame')[1]!);
    extract('Foo');

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(container.querySelector('.editor__stale')).toBeNull();
  });

  test("under an error, another tab's last scene is not shown", () => {
    const { container } = render(<Editor />);
    const svg = container.querySelector('.editor__scene svg')!;

    // A constraint with no ends does not build.
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Library' })).getByRole(
        'button',
        { name: 'Coincidence' },
      ),
    );

    expect(svg.querySelector('.editor__stale')).not.toBeNull();

    // The pendulum's tab builds, so it is the last scene drawn; back on the
    // scene's tab, it is not the one to show.
    fireEvent.doubleClick(
      within(screen.getByRole('tree', { name: 'Scene' })).getByText('Pendulum'),
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Scene' }));

    // Nothing but the grid, which is the editor's rather than the scene's.
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      [...svg.children].map((child) => child.getAttribute('class')),
    ).toEqual(['editor__grid']);
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

  test('a grid is drawn under the scene, whether it builds or not', () => {
    const { container, unmount } = render(<Editor />);

    // First, so the scene draws over it -- and drawn by the editor's pane
    // rather than by `SceneView`, which would put the scene's group first.
    expect(
      container.querySelector('.editor__scene svg')!.firstElementChild,
    ).toHaveClass('editor__grid');

    unmount();
    const failing = render(
      <Editor
        initialDocument={documentFrom(
          <>
            <TrackFrame id="a" />
            <TrackFrame id="a" />
          </>,
        )}
      />,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      failing.container.querySelector('.editor__scene svg')!.firstElementChild,
    ).toHaveClass('editor__grid');
  });
});

/** The code pane's text: the whole module, as it would be written to a file. */
function code(): string {
  return screen.getByRole('region', { name: 'Code' }).textContent!;
}

/** Click the scene tree's row for `tag`, and return the properties pane. */
function select(tag: string): HTMLElement {
  const tree = screen.getByRole('tree', { name: 'Scene' });
  fireEvent.click(within(tree).getByText(tag));

  return screen.getByRole('region', { name: 'Properties' });
}

describe('Editor, editing props', () => {
  test('a selected node shows its props, and an edit reaches scene and code', () => {
    const { container } = render(<Editor />);
    const drawn = (): string =>
      container.querySelector('.editor__scene svg')!.innerHTML;
    const before = drawn();

    const props = select('Box');

    const selected = screen.getAllByRole('treeitem', { selected: true });
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent('Box');
    expect(within(props).getByRole('heading', { name: 'Box' })).toBeVisible();

    const width = within(props).getByLabelText('Width');
    expect(width).toHaveValue('2');

    fireEvent.change(width, { target: { value: '3.5' } });

    expect(code()).toContain('<Box width={3.5} />');
    expect(drawn()).not.toBe(before);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('selection follows the click, and the keyboard', () => {
    render(<Editor />);
    select('Box');
    const props = select('TrackFrame');

    const selected = screen.getAllByRole('treeitem', { selected: true });
    expect(selected).toHaveLength(1);
    expect(
      within(props).getByRole('heading', { name: 'TrackFrame' }),
    ).toBeVisible();

    const tree = screen.getByRole('tree', { name: 'Scene' });
    fireEvent.keyDown(within(tree).getByText('Weight'), { key: 'Enter' });

    expect(
      within(props).getByRole('heading', { name: 'Weight' }),
    ).toBeVisible();

    fireEvent.keyDown(within(tree).getByText('Box'), { key: ' ' });

    expect(within(props).getByRole('heading', { name: 'Box' })).toBeVisible();
  });

  test('a half-typed number stays as typed, and commits what it can', () => {
    render(<Editor />);
    const width = within(select('Box')).getByLabelText('Width');

    fireEvent.change(width, { target: { value: '3.' } });

    expect(width).toHaveValue('3.');
    expect(code()).toContain('<Box width={3} />');

    fireEvent.change(width, { target: { value: '-' } });

    expect(width).toHaveValue('-');
    expect(width).toHaveAttribute('aria-invalid', 'true');
    expect(code()).toContain('<Box width={3} />');

    // Leaving the field shows the value the document holds.
    fireEvent.blur(width);

    expect(width).toHaveValue('3');
    expect(width).not.toHaveAttribute('aria-invalid');
  });

  test('nothing typed into one node is still there when another is selected', () => {
    render(<Editor />);
    fireEvent.change(within(select('Box')).getByLabelText('Position x'), {
      target: { value: '-' },
    });

    // Box and TrackFrame both have a `position`: without a fresh set of
    // fields, the cart's would open showing the box's half-typed text.
    const props = select('TrackFrame');

    expect(within(props).getByLabelText('Position x')).toHaveValue('');
  });

  test('an angle is edited in degrees and stored in radians', () => {
    render(<Editor />);
    const angle = within(select('TrackFrame')).getByLabelText('Angle');

    expect(angle).toHaveAttribute('placeholder', '0');

    fireEvent.change(angle, { target: { value: '90' } });

    // A quarter turn typed in degrees is written as one.
    expect(code()).toContain('angle={Math.PI / 2}');

    fireEvent.blur(angle);

    expect(angle).toHaveValue('90');
  });

  test("a rotational frame's state is edited in degrees, the rate included", () => {
    render(
      <Editor
        initialDocument={documentFrom(
          <RotationalFrame id="arm" initialState={[Math.PI / 2, Math.PI]}>
            <Weight mass={1} position={[1, 0]} />
          </RotationalFrame>,
        )}
      />,
    );
    const state = within(select('RotationalFrame')).getByRole('group', {
      name: 'Initial state',
    });

    expect(within(state).getByLabelText('Initial state value')).toHaveValue(
      '90',
    );
    expect(within(state).getByLabelText('Initial state rate')).toHaveValue(
      '180',
    );
    expect(state).toHaveTextContent('°/s');

    fireEvent.change(within(state).getByLabelText('Initial state rate'), {
      target: { value: '90' },
    });

    expect(code()).toContain('initialState={[Math.PI / 2, Math.PI / 2]}');
  });

  test('a point or state written as a bare number is read as the core reads it', () => {
    // `initialState={0.5}` is `[0.5, 0]` to the core, and `position={3}` is
    // `[3, 0]`: editing one half has to keep the other.
    render(
      <Editor
        initialDocument={documentFrom(
          <>
            <RotationalFrame id="arm" initialState={0.5}>
              <Weight mass={1} position={[1, 0]} />
            </RotationalFrame>
            <Box position={3} />
          </>,
        )}
      />,
    );
    fireEvent.change(
      within(select('RotationalFrame')).getByLabelText('Initial state rate'),
      { target: { value: '10' } },
    );

    expect(code()).toContain(`initialState={[0.5, ${10 / (180 / Math.PI)}]}`);

    const box = select('Box');

    expect(within(box).getByLabelText('Position x')).toHaveValue('3');

    fireEvent.change(within(box).getByLabelText('Position y'), {
      target: { value: '1' },
    });

    expect(code()).toContain('position={[3, 1]}');
  });

  test("an imported component's props are shown, not edited", () => {
    function Gadget({ size }: { size: number }): ReactElement {
      return <TrackFrame id={`gadget-${size}`} />;
    }

    render(<Editor initialDocument={documentFrom(<Gadget size={2} />)} />);
    const props = select('Gadget');

    expect(props).toHaveTextContent('Imported from its own module');
    expect(within(props).getByText('size')).toBeVisible();
    expect(within(props).getByText('2')).toBeVisible();
    expect(within(props).queryByRole('textbox')).toBeNull();
  });

  test("a constraint's end suggests every id in the document, once each", () => {
    const doc = documentFrom(
      <>
        <TrackFrame id="cart" />
        <Coincidence frame1="cart" frame2="cart" />
      </>,
    );
    // A second definition, naming one id of its own and one the scene has.
    const [arm] = nodesFrom(
      <TrackFrame id="cart">
        <RotationalFrame id="arm" />
      </TrackFrame>,
    );
    render(
      <Editor
        initialDocument={{
          ...doc,
          definitions: [...doc.definitions, { name: 'Arm', body: [arm] }],
        }}
      />,
    );
    const end = within(select('Coincidence')).getByLabelText('First end');
    const offered = [
      ...document
        .getElementById(end.getAttribute('list')!)!
        .querySelectorAll('option'),
    ].map((option) => option.value);

    expect(offered.sort()).toEqual(['arm', 'cart']);
  });

  test('emptying a field returns the prop to its default', () => {
    render(<Editor />);

    fireEvent.change(within(select('Box')).getByLabelText('Width'), {
      target: { value: '' },
    });

    expect(code()).toContain('<Box />');
  });

  test('a required prop cannot be emptied, and a length cannot go negative', () => {
    render(<Editor />);
    const mass = within(select('Weight')).getByLabelText('Mass');

    fireEvent.change(mass, { target: { value: '' } });

    expect(mass).toHaveAttribute('aria-invalid', 'true');
    expect(code()).toContain('<Weight mass={50} />');

    const width = within(select('Box')).getByLabelText('Width');
    fireEvent.change(width, { target: { value: '-1' } });

    expect(width).toHaveAttribute('aria-invalid', 'true');
    expect(code()).toContain('<Box width={2} />');
  });

  test('reset takes a set prop back to its default', () => {
    render(<Editor />);
    const props = select('TrackFrame');

    expect(within(props).queryByLabelText('Reset Angle')).toBeNull();

    fireEvent.click(within(props).getByLabelText('Reset Resistance'));

    expect(code()).toContain('<TrackFrame id="cart">');
  });

  test('a point is edited a coordinate at a time', () => {
    render(<Editor />);
    const props = select('Line');
    const endX = within(props).getByLabelText('End x');

    expect(endX).toHaveValue('12');

    fireEvent.change(endX, { target: { value: '8' } });

    expect(code()).toContain('endPos={[8, -0.5]}');

    // One half emptied is refused: the reset button unsets the pair.
    const endY = within(props).getByLabelText('End y');
    fireEvent.change(endY, { target: { value: '' } });

    expect(endY).toHaveAttribute('aria-invalid', 'true');
    expect(code()).toContain('endPos={[8, -0.5]}');
  });

  test('a flag is a checkbox showing its default', () => {
    render(<Editor />);
    const solid = within(select('Box')).getByLabelText('Solid');

    expect(solid).toBeChecked();

    fireEvent.click(solid);

    expect(code()).toContain('solid={false}');
  });

  test('a component the document defines says it takes no props', () => {
    render(<Editor />);
    const props = select('Pendulum');

    expect(
      within(props).getByRole('heading', { name: 'Pendulum' }),
    ).toBeVisible();
    expect(props).toHaveTextContent('It takes no props.');
  });
});

/** The library pane. */
function library(): HTMLElement {
  return screen.getByRole('region', { name: 'Library' });
}

describe('Editor, changing structure', () => {
  test('adding with nothing selected appends to the body, and selects it', () => {
    render(<Editor />);
    fireEvent.click(within(library()).getByRole('button', { name: 'Line' }));

    expect(code()).toMatch(/<\/TrackFrame>\s*<Line endPos=\{\[1, 0\]\} \/>/);

    const props = screen.getByRole('region', { name: 'Properties' });
    expect(within(props).getByRole('heading', { name: 'Line' })).toBeVisible();
    expect(within(props).getByLabelText('End x')).toHaveValue('1');
  });

  test('adding with a frame selected puts it inside, last', () => {
    render(<Editor />);
    select('TrackFrame');

    expect(library()).toHaveTextContent('Adds inside the selected TrackFrame.');

    fireEvent.click(within(library()).getByRole('button', { name: 'Circle' }));

    expect(code()).toMatch(/<\/FixedFrame>\s*<Circle \/>\s*<\/TrackFrame>/);
  });

  test('adding with anything else selected puts it just after', () => {
    render(<Editor />);
    select('Box');

    expect(library()).toHaveTextContent('Adds after the selected Box.');

    fireEvent.click(within(library()).getByRole('button', { name: 'Circle' }));

    expect(code()).toMatch(/<Box width=\{2\} \/>\s*<Circle \/>\s*<Weight/);
  });

  test('what cannot go where it would land is disabled, saying why', () => {
    render(<Editor />);
    const weight = within(library()).getByRole('button', { name: 'Weight' });

    expect(weight).toBeDisabled();
    expect(weight).toHaveAttribute(
      'title',
      expect.stringMatching(/has to go inside a frame/),
    );

    select('TrackFrame');

    expect(weight).toBeEnabled();
  });

  test('delete removes a node and everything under it', () => {
    render(<Editor />);
    select('TrackFrame');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(code()).not.toContain('<TrackFrame');
    expect(code()).not.toContain('<Pendulum />');
    expect(
      screen.getByRole('region', { name: 'Properties' }),
    ).toHaveTextContent('Select a node');

    // And from the keyboard.
    const tree = screen.getByRole('tree', { name: 'Scene' });
    fireEvent.keyDown(within(tree).getByText('Line'), { key: 'Delete' });

    expect(within(tree).queryByText('Line')).toBeNull();
  });

  test('move up and down reorder siblings, and the selection follows', () => {
    render(<Editor />);
    select('Weight');
    fireEvent.click(screen.getByRole('button', { name: 'Move up' }));

    expect(code()).toMatch(/<Weight mass=\{50\} \/>\s*<Box width=\{2\} \/>/);
    expect(
      within(screen.getByRole('region', { name: 'Properties' })).getByRole(
        'heading',
        { name: 'Weight' },
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Move up' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Move down' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move down' }));

    expect(code()).toMatch(/<\/FixedFrame>\s*<Weight mass=\{50\} \/>/);
    expect(screen.getByRole('button', { name: 'Move down' })).toBeDisabled();

    // And from the keyboard.
    const tree = screen.getByRole('tree', { name: 'Scene' });
    fireEvent.keyDown(within(tree).getByText('Weight'), {
      key: 'ArrowUp',
      altKey: true,
    });

    expect(code()).toMatch(/<Weight mass=\{50\} \/>\s*<FixedFrame/);
  });

  test('from the keyboard, each press acts on the node it acted on before', () => {
    render(<Editor />);
    const tree = screen.getByRole('tree', { name: 'Scene' });
    const focusRow = (tag: string): void => {
      act(() => {
        within(tree)
          .getByText(tag)
          .closest<HTMLElement>('[role="treeitem"]')!
          .focus();
      });
    };
    const press = (key: string, altKey = false): void => {
      fireEvent.keyDown(document.activeElement!, { key, altKey });
    };

    // Focus a row once, then keep pressing wherever focus is, as a keyboard
    // does -- rows are keyed by position, so the row can change under it.
    focusRow('FixedFrame');
    press('Enter');
    press('ArrowUp', true);
    press('ArrowUp', true);

    expect(code()).toMatch(
      /<FixedFrame[\s\S]*?<\/FixedFrame>\s*<Box width=\{2\} \/>\s*<Weight/,
    );

    press('ArrowDown', true);

    expect(code()).toMatch(
      /<Box width=\{2\} \/>\s*<FixedFrame[\s\S]*?<\/FixedFrame>\s*<Weight/,
    );

    // A second Delete removes nothing the first did not.
    press('Delete');
    press('Delete');

    expect(code()).not.toContain('<Pendulum />');
    expect(code()).toContain('<Box width={2} />');
    expect(code()).toContain('<Weight mass={50} />');

    focusRow('Box');
    press('Enter');
    press('Backspace');

    expect(code()).not.toContain('<Box');
  });

  test('Escape, or a click on empty tree, lets the end of the body be chosen again', () => {
    render(<Editor />);
    const tree = screen.getByRole('tree', { name: 'Scene' });
    const line = within(tree).getByText('Line');
    fireEvent.click(line);

    expect(library()).toHaveTextContent('Adds after the selected Line.');

    fireEvent.keyDown(line, { key: 'Escape' });

    expect(library()).toHaveTextContent('Adds to the end of Scene.');

    fireEvent.click(line);
    fireEvent.click(tree);

    expect(library()).toHaveTextContent('Adds to the end of Scene.');
  });

  test('a new constraint says what it needs before the scene builds', () => {
    render(<Editor />);
    fireEvent.click(
      within(library()).getByRole('button', { name: 'Coincidence' }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'A <Coincidence> needs First end and Second end set',
    );
  });
});

/** Open the extract form for the selected node, type `name`, and submit it. */
function extract(name: string): void {
  fireEvent.click(screen.getByRole('button', { name: 'Extract to component' }));
  fireEvent.change(screen.getByLabelText('Component name'), {
    target: { value: name },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Extract' }));
}

/** The hint beside the name being typed for an extraction. */
function extractHint(): HTMLElement {
  return within(
    screen.getByRole('textbox', { name: 'Component name' }).closest('form')!,
  ).getByRole('status');
}

describe('Editor, components and tabs', () => {
  test('double-clicking a defined instance opens it in a tab', () => {
    render(<Editor />);
    fireEvent.doubleClick(
      within(screen.getByRole('tree', { name: 'Scene' })).getByText('Pendulum'),
    );

    expect(screen.getByRole('tab', { name: 'Pendulum' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      within(screen.getByRole('tree', { name: 'Pendulum' })).getByText(
        'RotationalFrame',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('the properties pane opens one too, and tabs switch and close', () => {
    render(<Editor />);
    fireEvent.click(
      within(select('Pendulum')).getByRole('button', { name: 'Open Pendulum' }),
    );

    expect(screen.getByRole('tab', { name: 'Pendulum' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Scene' }));

    expect(screen.getByRole('tree', { name: 'Scene' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Close Pendulum' }));

    expect(screen.queryByRole('tab', { name: 'Pendulum' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close Scene' })).toBeNull();
  });

  test('extract moves a subtree into a new component, and opens it', () => {
    render(<Editor />);
    select('Box');
    extract('Chassis');

    expect(screen.getByRole('tab', { name: 'Chassis' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      within(screen.getByRole('tree', { name: 'Chassis' })).getByText('Box'),
    ).toBeVisible();

    // Defined above its user, with a place for children beside the box, and
    // used where the box was.
    expect(code()).toMatch(
      /function Chassis\(\{ children \}: \{ children\?: ReactNode \}\): ReactElement[\s\S]*<Box width=\{2\} \/>\s*\{children\}[\s\S]*export default function Scene/,
    );
    expect(code()).toMatch(/resistance=\{5\}>\s*<Chassis \/>\s*<Weight/);

    // In the library, but not for adding to itself.
    expect(
      within(library()).getByRole('button', { name: 'Chassis' }),
    ).toBeDisabled();
  });

  test('a name the generated module could not use is refused, saying why', () => {
    render(<Editor />);
    select('Box');
    fireEvent.click(
      screen.getByRole('button', { name: 'Extract to component' }),
    );
    const name = screen.getByLabelText('Component name');

    fireEvent.change(name, { target: { value: 'Box' } });

    expect(extractHint()).toHaveTextContent('already a building block');
    expect(screen.getByRole('button', { name: 'Extract' })).toBeDisabled();

    fireEvent.change(name, { target: { value: 'Pendulum' } });

    expect(extractHint()).toHaveTextContent('already a component');
  });

  test('a weight alone cannot be extracted, and the button says why', () => {
    render(<Editor />);
    select('Weight');
    const extract = screen.getByRole('button', {
      name: 'Extract to component',
    });

    expect(extract).toBeDisabled();
    expect(extract).toHaveAttribute(
      'title',
      expect.stringMatching(/has to go inside a frame/),
    );
  });

  test('an abandoned name closes with the selection, and does not come back', () => {
    render(<Editor />);
    select('Box');
    fireEvent.click(
      screen.getByRole('button', { name: 'Extract to component' }),
    );

    expect(screen.getByLabelText('Component name')).toBeVisible();

    select('Weight');

    expect(screen.queryByLabelText('Component name')).toBeNull();

    select('Box');

    expect(screen.queryByLabelText('Component name')).toBeNull();
  });

  test('a component that names ids cannot be added a second time', () => {
    render(<Editor />);
    select('TrackFrame');
    extract('Cart');
    fireEvent.click(screen.getByRole('tab', { name: 'Scene' }));

    const cart = within(library()).getByRole('button', { name: 'Cart' });

    expect(cart).toBeDisabled();
    expect(cart).toHaveAttribute(
      'title',
      expect.stringMatching(/names 'cart'/),
    );
  });
});

/** The history's Undo button. */
function undoButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Undo' });
}

/** The history's Redo button. */
function redoButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Redo' });
}

/** The pendulum bob's centre on screen -- the one circle the starter scene draws. */
function bob(container: HTMLElement): string {
  const circle = container.querySelector('.editor__scene circle')!;

  return `${circle.getAttribute('cx')},${circle.getAttribute('cy')}`;
}

describe('Editor, playing', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['requestAnimationFrame', 'cancelAnimationFrame'],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Let `ms` of animation frames pass. */
  const run = (ms: number): void => {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  };

  test('play runs the scene forward, and pause holds it', () => {
    const { container } = render(<Editor />);
    const start = bob(container);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    run(300);
    const moved = bob(container);

    expect(moved).not.toBe(start);

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    run(300);

    expect(bob(container)).toBe(moved);
  });

  test('every frame shows a gizmo, and the gizmos move with the scene', () => {
    const { container } = render(<Editor />);
    const gizmos = (): string[] =>
      [...container.querySelectorAll('.editor__scene .editor__gizmo')].map(
        (gizmo) => gizmo.innerHTML,
      );
    const start = gizmos();

    // The cart and the fixed frame it hangs the pendulum from; the pendulum's
    // pivot and the fixed frame at its bob.
    expect(start).toHaveLength(4);

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    run(300);

    expect(gizmos()).not.toEqual(start);
  });

  test('reset returns to the start', () => {
    const { container } = render(<Editor />);
    const start = bob(container);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    run(300);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(bob(container)).toBe(start);
  });

  test('a prop edit carries the motion over, and a structural edit starts it over', () => {
    const { container } = render(<Editor />);
    const start = bob(container);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    run(300);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    const moved = bob(container);

    fireEvent.change(within(select('Box')).getByLabelText('Width'), {
      target: { value: '3' },
    });

    expect(bob(container)).toBe(moved);

    // An added line moves no frame, but it changes the structure -- and the
    // decision is that a structural edit restarts, not that one moving a frame
    // does.
    fireEvent.click(within(library()).getByRole('button', { name: 'Line' }));

    expect(bob(container)).toBe(start);
  });

  test("a component's tab draws it as authored, and the scene's run waits for it", () => {
    // The scene is one pendulum at the origin, so the component's authored pose
    // is the scene's starting one -- and `arm` is the same frame in both.
    const pendulum = nodesFrom(
      <RotationalFrame id="arm" initialState={[-0.6, 0]}>
        <Circle position={[4, 0]} radius={0.5} />
        <Weight mass={10} position={[4, 0]} />
      </RotationalFrame>,
    );
    const { container } = render(
      <Editor
        initialDocument={{
          root: 'Scene',
          definitions: [
            { name: 'Pendulum', body: pendulum },
            {
              name: 'Scene',
              body: [
                {
                  type: { kind: 'defined', name: 'Pendulum' },
                  props: {},
                  children: [],
                },
              ],
            },
          ],
        }}
      />,
    );
    const openPendulum = (): void => {
      fireEvent.doubleClick(
        within(screen.getByRole('tree', { name: 'Scene' })).getByText(
          'Pendulum',
        ),
      );
    };
    const start = bob(container);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    run(300);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    const moved = bob(container);

    expect(moved).not.toBe(start);

    openPendulum();

    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled();
    expect(
      screen.getByText('Play runs the whole scene: open Scene to play it.'),
    ).toBeVisible();
    expect(bob(container)).toBe(start);

    // Back by the scene's tab, and by closing the component's: either way the
    // run is where it was paused.
    fireEvent.click(screen.getByRole('tab', { name: 'Scene' }));

    expect(bob(container)).toBe(moved);

    openPendulum();
    fireEvent.click(screen.getByRole('button', { name: 'Close Pendulum' }));

    expect(bob(container)).toBe(moved);
  });

  test('a prop edit through a scene that does not build carries the motion over', () => {
    const { container } = render(
      <Editor
        initialDocument={documentFrom(
          <>
            <RotationalFrame id="pole" initialState={[-0.6, 0]}>
              <Circle position={[4, 0]} radius={0.5} />
              <Weight mass={10} position={[4, 0]} />
            </RotationalFrame>
            <TrackFrame id="cart">
              <Weight mass={50} />
            </TrackFrame>
          </>,
        )}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    run(300);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    const moved = bob(container);
    const id = (): HTMLElement =>
      within(select('TrackFrame')).getByLabelText('Id');

    // Two frames named `pole` do not build: renaming one passes through that.
    fireEvent.change(id(), { target: { value: 'pole' } });

    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Under the error, the kept scene is where the run paused, and Reset --
    // which would move a run nobody can see -- waits for a scene that builds.
    expect(bob(container)).toBe(moved);
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled();

    fireEvent.change(id(), { target: { value: 'pole2' } });

    expect(screen.queryByRole('alert')).toBeNull();
    expect(bob(container)).toBe(moved);
  });

  test('a run that diverges stops, and says so', () => {
    vi.spyOn(JsSolver.prototype, 'tick').mockImplementation(() => {
      throw new InvalidStateMapError();
    });
    const { container } = render(<Editor />);
    const start = bob(container);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    run(300);

    expect(screen.getByRole('alert')).toHaveTextContent('diverged');
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
    expect(bob(container)).toBe(start);
  });

  test('undoing a prop edit carries the motion over, and undoing an insert starts it over', () => {
    const { container } = render(<Editor />);
    const start = bob(container);
    fireEvent.change(within(select('Box')).getByLabelText('Width'), {
      target: { value: '3' },
    });
    fireEvent.click(within(library()).getByRole('button', { name: 'Line' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    run(300);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    expect(bob(container)).not.toBe(start);

    fireEvent.click(undoButton());

    expect(bob(container)).toBe(start);

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    run(300);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    const moved = bob(container);
    fireEvent.click(undoButton());

    expect(bob(container)).toBe(moved);

    // Redone the same way round: the width carries the motion over, and the
    // insert starts it over.
    fireEvent.click(redoButton());

    expect(bob(container)).toBe(moved);

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    run(300);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(redoButton());

    expect(bob(container)).toBe(start);
  });
});

/** Click the scene pane at a point in its own coordinates. */
function clickScene(
  container: HTMLElement,
  [x, y]: readonly [number, number],
  held: { shiftKey?: boolean } = {},
): void {
  fireEvent.click(container.querySelector('.editor__scene svg')!, {
    clientX: x,
    clientY: y,
    ...held,
  });
}

/** The centre of the one circle the scene pane draws. */
function circleCentre(container: HTMLElement): readonly [number, number] {
  const circle = container.querySelector('.editor__scene circle')!;

  return [Number(circle.getAttribute('cx')), Number(circle.getAttribute('cy'))];
}

/** The component the properties pane is showing, or `null` for none. */
function shown(): string | null {
  return (
    within(screen.getByRole('region', { name: 'Properties' })).queryByRole(
      'heading',
    )?.textContent ?? null
  );
}

describe('Editor, picking', () => {
  // Nothing is measured here, so the world's origin is the pane's corner: the
  // cart sits at (0, 0), its box reaches 18 pixels either side and 9 above and
  // below, and the pendulum's pivot is 9 pixels down.
  const onCart = [0, -3] as const;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('a click selects the topmost thing it hit', () => {
    const { container } = render(<Editor />);
    clickScene(container, onCart);

    // The cart's gizmo is drawn over its box.
    expect(shown()).toBe('TrackFrame');
  });

  test('the same place again goes one deeper, through each node under it once', () => {
    const { container } = render(<Editor />);

    // Just above the pivot: the pendulum's own gizmo and rod, the fixed frame
    // the cart hangs it from, the cart's gizmo and box, and the ground. The
    // pivot and the rod are one node here.
    const nearPivot = [0, 8] as const;
    const clicks: (readonly [number, number])[] = [
      nearPivot,
      [1, 8],
      nearPivot,
      nearPivot,
      nearPivot,
    ];
    const picked = clicks.map((point) => {
      clickScene(container, point);

      return shown();
    });

    expect(picked).toEqual([
      'Pendulum',
      'FixedFrame',
      'TrackFrame',
      'Box',
      'Line',
    ]);
  });

  test('with Shift, a click selects the node that built what it hit', () => {
    const { container } = render(<Editor />);
    const nearPivot = [0, 8] as const;
    clickScene(container, nearPivot);

    // Plainly, the instance the scene's body holds; with Shift, the frame the
    // component's own body writes.
    expect(shown()).toBe('Pendulum');

    clickScene(container, nearPivot, { shiftKey: true });

    expect(shown()).toBe('RotationalFrame');
  });

  test('with Shift, the same place goes deeper through what a component wrote', () => {
    const { container } = render(<Editor />);
    const nearPivot = [0, 8] as const;
    const clicks: (readonly [number, number])[] = [
      nearPivot,
      [1, 8],
      nearPivot,
      nearPivot,
      nearPivot,
      nearPivot,
    ];
    const picked = clicks.map((point) => {
      clickScene(container, point, { shiftKey: true });

      return shown();
    });

    // Six nodes where a plain click finds five. Gizmos come before decals, so
    // the frames go first -- the pendulum's own, the fixed frame the cart
    // hangs it from, and the cart's -- and then the pendulum's rod, which a
    // plain click never tells apart from its pivot, both being the instance
    // there. The cart's box and the ground follow.
    expect(picked).toEqual([
      'RotationalFrame',
      'FixedFrame',
      'TrackFrame',
      'Line',
      'Box',
      'Line',
    ]);
  });

  test('an expanded node is shown, not edited, and says where it is written', () => {
    const { container } = render(<Editor />);
    clickScene(container, [0, 8], { shiftKey: true });
    const pane = screen.getByRole('region', { name: 'Properties' });

    expect(pane.textContent).toContain('Written in Pendulum');
    expect(within(pane).queryAllByRole('textbox')).toHaveLength(0);

    // Its props as the component writes them.
    expect(pane.textContent).toContain('resistance');

    // Nothing in this body is selected, so the tree's actions stay out.
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  test('from an expanded node, back to what produced it, or into its body', () => {
    const { container } = render(<Editor />);
    clickScene(container, [0, 8], { shiftKey: true });
    const pane = (): HTMLElement =>
      screen.getByRole('region', { name: 'Properties' });
    fireEvent.click(
      within(pane()).getByRole('button', { name: 'Select what produced it' }),
    );

    // The instance in this body, which the tree shows selected.
    expect(shown()).toBe('Pendulum');
    expect(screen.getByRole('treeitem', { name: 'Pendulum' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    clickScene(container, [0, 8], { shiftKey: true });
    fireEvent.click(
      within(pane()).getByRole('button', { name: 'Open Pendulum' }),
    );

    expect(screen.getByRole('tab', { name: 'Pendulum' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('what this body wrote is still edited, Shift or no Shift', () => {
    const { container } = render(<Editor />);
    clickScene(container, onCart, { shiftKey: true });
    const pane = screen.getByRole('region', { name: 'Properties' });

    // The cart is the scene's own node, so inspecting it is selecting it.
    expect(shown()).toBe('TrackFrame');
    expect(pane.textContent).not.toContain('Written in');
    expect(within(pane).queryAllByRole('textbox').length).toBeGreaterThan(0);
  });

  test('with Shift, the code marks the node in the body that wrote it', () => {
    const { container } = render(<Editor />);
    clickScene(container, [0, 8], { shiftKey: true });

    // The scene's own tab is still the focused one, and the mark has gone
    // into the pendulum's definition: a third answer to what wrote this,
    // alongside the properties pane and the way into the component's tab.
    expect(screen.getByRole('tab', { name: 'Scene' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(marked()).toContain('<RotationalFrame');

    const { ranges } = emitScene(starterDocument());

    expect(markOffset()).toBe(ranges.get(rangeKey('Pendulum', [0]))![0]);
  });

  test('what an imported component built falls back to the plain answer', () => {
    function Gadget({ size }: { size: number }): ReactElement {
      return <TrackFrame id={`gadget-${size}`} />;
    }

    const { container } = render(
      <Editor initialDocument={documentFrom(<Gadget size={2} />)} />,
    );

    // The frame is the gadget's own business, written in a module the
    // document cannot name, so nothing here built it. Shift lands where a
    // plain click would rather than doing less than not holding it.
    clickScene(container, [0, -3], { shiftKey: true });

    expect(shown()).toBe('Gadget');
    expect(
      screen.getByRole('region', { name: 'Properties' }).textContent,
    ).toContain('Imported from its own module');
  });

  test("a click is read in the pane's own coordinates, wherever it sits", () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 50, y: 20, width: 0, height: 0 }),
    );
    const { container } = render(<Editor />);
    clickScene(container, [50 + onCart[0], 20 + onCart[1]]);

    expect(shown()).toBe('TrackFrame');
  });

  test("a click on a component's instance selects the instance", () => {
    const { container } = render(<Editor />);
    clickScene(container, circleCentre(container));

    expect(shown()).toBe('Pendulum');

    // Somewhere else starts again from the top.
    clickScene(container, onCart);

    expect(shown()).toBe('TrackFrame');
  });

  test('a click somewhere new starts from the top, even over the selection', () => {
    const { container } = render(<Editor />);
    clickScene(container, onCart);

    // Nearly four pixels away: still over the cart's gizmo and its box, but
    // not the same place, so not a click to go deeper.
    clickScene(container, [3, -5]);

    expect(shown()).toBe('TrackFrame');
  });

  test('the first click on a newly opened tab starts from the top', () => {
    const { container } = render(<Editor />);
    clickScene(container, circleCentre(container));
    fireEvent.doubleClick(
      within(screen.getByRole('tree', { name: 'Scene' })).getByText('Pendulum'),
    );
    clickScene(container, circleCentre(container));

    // The bob is drawn where it was, over the end of the rod, and the fixed
    // frame's gizmo at its centre is on top of it.
    expect(shown()).toBe('FixedFrame');
  });

  test("on a component's tab, a click selects in that component's body", () => {
    const { container } = render(<Editor />);
    fireEvent.doubleClick(
      within(screen.getByRole('tree', { name: 'Scene' })).getByText('Pendulum'),
    );
    clickScene(container, circleCentre(container));

    // The fixed frame at the bob, on top -- and, clicked again, the bob.
    expect(shown()).toBe('FixedFrame');

    clickScene(container, circleCentre(container));

    expect(shown()).toBe('Circle');
  });

  test('a click on nothing clears the selection', () => {
    const { container } = render(<Editor />);
    select('Box');
    clickScene(container, [300, -300]);

    expect(shown()).toBeNull();
  });

  test('a click in the scene closes a name being typed, for good', () => {
    const { container } = render(<Editor />);
    select('Box');
    fireEvent.click(
      screen.getByRole('button', { name: 'Extract to component' }),
    );
    fireEvent.change(screen.getByLabelText('Component name'), {
      target: { value: 'Crate' },
    });
    clickScene(container, onCart);

    expect(screen.queryByLabelText('Component name')).toBeNull();

    // Back to the box, by the scene again: the form stays closed.
    clickScene(container, onCart);

    expect(shown()).toBe('Box');
    expect(screen.queryByLabelText('Component name')).toBeNull();
  });
});

/** How many times `text` appears in the code pane. */
function countInCode(text: string): number {
  return code().split(text).length - 1;
}

describe('Editor, undo', () => {
  test("undo and redo step through edits, a field's keystrokes as one", () => {
    render(<Editor />);
    const before = code();

    expect(undoButton()).toBeDisabled();
    expect(redoButton()).toBeDisabled();

    const width = within(select('Box')).getByLabelText('Width');
    fireEvent.change(width, { target: { value: '3' } });
    fireEvent.change(width, { target: { value: '35' } });
    fireEvent.change(within(select('Box')).getByLabelText('Height'), {
      target: { value: '4' },
    });

    expect(code()).toContain('width={35}');
    expect(code()).toContain('height={4}');

    fireEvent.click(undoButton());

    expect(code()).toContain('width={35}');
    expect(code()).not.toContain('height={4}');

    // Both of the width's keystrokes go in one step.
    fireEvent.click(undoButton());

    expect(code()).toBe(before);
    expect(undoButton()).toBeDisabled();

    fireEvent.click(redoButton());
    fireEvent.click(redoButton());

    expect(code()).toContain('width={35}');
    expect(code()).toContain('height={4}');
    expect(redoButton()).toBeDisabled();
  });

  test('the same prop on two nodes is two steps', () => {
    render(<Editor />);
    fireEvent.change(within(select('Line')).getByLabelText('Line width'), {
      target: { value: '0.3' },
    });
    fireEvent.change(within(select('Box')).getByLabelText('Line width'), {
      target: { value: '0.7' },
    });
    fireEvent.click(undoButton());

    expect(code()).toContain('lineWidth={0.3}');
    expect(code()).not.toContain('lineWidth={0.7}');
  });

  test('undo takes back an insert, and the selection with it', () => {
    render(<Editor />);
    const lines = countInCode('<Line');
    fireEvent.click(within(library()).getByRole('button', { name: 'Line' }));

    expect(countInCode('<Line')).toBe(lines + 1);

    fireEvent.click(undoButton());

    expect(countInCode('<Line')).toBe(lines);
    expect(
      within(screen.getByRole('region', { name: 'Properties' })).getByText(
        'Select a node to see its props.',
      ),
    ).toBeInTheDocument();
  });

  test('an undone prop edit keeps the selection, since it moves nothing', () => {
    render(<Editor />);
    fireEvent.change(within(select('Box')).getByLabelText('Width'), {
      target: { value: '3' },
    });
    fireEvent.click(undoButton());

    expect(
      within(screen.getByRole('region', { name: 'Properties' })).getByRole(
        'heading',
      ),
    ).toHaveTextContent('Box');
  });

  test('undoing an extraction closes its tab, back where it was made', () => {
    render(<Editor />);
    select('Box');
    extract('Crate');

    expect(screen.getByRole('tab', { name: 'Crate' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    fireEvent.click(undoButton());

    expect(screen.queryByRole('tab', { name: 'Crate' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Scene' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(code()).not.toContain('function Crate');

    fireEvent.click(redoButton());

    expect(code()).toContain('function Crate');
  });

  test('an edit made in another tab is undone there', () => {
    render(<Editor />);
    fireEvent.doubleClick(
      within(screen.getByRole('tree', { name: 'Scene' })).getByText('Pendulum'),
    );
    fireEvent.click(within(library()).getByRole('button', { name: 'Circle' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Scene' }));
    fireEvent.click(undoButton());

    expect(screen.getByRole('tab', { name: 'Pendulum' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // And redone there too.
    fireEvent.click(screen.getByRole('tab', { name: 'Scene' }));
    fireEvent.click(redoButton());

    expect(screen.getByRole('tab', { name: 'Pendulum' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test("undoing a prop edit made in another tab brings back that tab's node", () => {
    render(<Editor />);
    fireEvent.doubleClick(
      within(screen.getByRole('tree', { name: 'Scene' })).getByText('Pendulum'),
    );
    fireEvent.click(
      within(screen.getByRole('tree', { name: 'Pendulum' })).getByText(
        'Circle',
      ),
    );
    fireEvent.change(
      within(screen.getByRole('region', { name: 'Properties' })).getByLabelText(
        'Radius',
      ),
      { target: { value: '0.8' } },
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Scene' }));
    select('Box');
    fireEvent.click(undoButton());

    expect(screen.getByRole('tab', { name: 'Pendulum' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(shown()).toBe('Circle');
  });

  test('undoing an edit whose tab was closed opens it again', () => {
    render(<Editor />);
    fireEvent.doubleClick(
      within(screen.getByRole('tree', { name: 'Scene' })).getByText('Pendulum'),
    );
    fireEvent.click(within(library()).getByRole('button', { name: 'Circle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close Pendulum' }));
    fireEvent.click(undoButton());

    expect(screen.getByRole('tab', { name: 'Pendulum' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('undoing a delete brings the node back, selected as it was', () => {
    render(<Editor />);
    select('Box');
    fireEvent.keyDown(
      within(screen.getByRole('tree', { name: 'Scene' })).getByText('Box'),
      { key: 'Delete' },
    );

    expect(shown()).toBeNull();

    fireEvent.click(undoButton());

    expect(shown()).toBe('Box');

    // Redone, it leaves nothing selected, as the delete did.
    fireEvent.click(redoButton());

    expect(shown()).toBeNull();
  });

  test('two clicks on a checkbox are two steps', () => {
    render(<Editor />);
    const solid = within(select('Box')).getByRole('checkbox', {
      name: 'Solid',
    });
    fireEvent.click(solid);
    fireEvent.click(solid);
    fireEvent.click(undoButton());

    expect(code()).toContain('solid={false}');
  });

  test('a reset is a step of its own', () => {
    render(<Editor />);
    fireEvent.change(within(select('Line')).getByLabelText('Line width'), {
      target: { value: '0.3' },
    });
    fireEvent.click(
      within(select('Line')).getByRole('button', { name: 'Reset Line width' }),
    );
    fireEvent.click(undoButton());

    expect(code()).toContain('lineWidth={0.3}');
  });

  test('coming back to a field starts a new step', () => {
    render(<Editor />);
    const width = (): HTMLElement =>
      within(select('Box')).getByLabelText('Width');
    fireEvent.focus(width());
    fireEvent.change(width(), { target: { value: '3' } });
    fireEvent.focus(within(select('Box')).getByLabelText('Height'));
    fireEvent.focus(width());
    fireEvent.change(width(), { target: { value: '5' } });
    fireEvent.click(undoButton());

    expect(code()).toContain('width={3}');
  });

  test('from the keyboard, anywhere but in a text field', () => {
    render(<Editor />);
    const before = code();
    const width = within(select('Box')).getByLabelText('Width');
    fireEvent.change(width, { target: { value: '3' } });

    // In the field, the keys are the field's own.
    fireEvent.keyDown(width, { key: 'z', ctrlKey: true });

    expect(code()).toContain('width={3}');

    const tree = screen.getByRole('tree', { name: 'Scene' });
    fireEvent.keyDown(tree, { key: 'z', ctrlKey: true });

    expect(code()).toBe(before);

    fireEvent.keyDown(tree, { key: 'Z', metaKey: true, shiftKey: true });

    expect(code()).toContain('width={3}');

    fireEvent.keyDown(tree, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(tree, { key: 'y', ctrlKey: true });

    expect(code()).toContain('width={3}');

    // With the focus nowhere in particular, as after a click in the scene.
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });

    expect(code()).toBe(before);

    // A checkbox is not a text field: the keys are the editor's there.
    fireEvent.keyDown(screen.getByRole('checkbox', { name: 'Solid' }), {
      key: 'Z',
      ctrlKey: true,
      shiftKey: true,
    });

    expect(code()).toContain('width={3}');
  });
});

/** Press at `from` in the scene pane, move through each of `to`, and let go at the last. */
function dragScene(
  container: HTMLElement,
  from: readonly [number, number],
  ...to: (readonly [number, number])[]
): void {
  const [endX, endY] = to[to.length - 1] ?? from;
  fireEvent.mouseDown(container.querySelector('.editor__scene svg')!, {
    clientX: from[0],
    clientY: from[1],
  });
  for (const [x, y] of to) {
    fireEvent.mouseMove(window, { clientX: x, clientY: y, buttons: 1 });
  }

  fireEvent.mouseUp(window, { clientX: endX, clientY: endY });
}

/**
 * The parent's axes drawn for a drag under way: each one's middle, which way
 * it runs, its name, and which way its name sits from the middle.
 */
function parentAxes(container: HTMLElement): {
  middle: readonly number[];
  direction: readonly number[];
  name: string | null;
  named: readonly number[];
}[] {
  const round = (value: number): number => Math.round(value * 1e6) / 1e6 || 0;

  return [...container.querySelectorAll('.editor__parent-axis')].map((axis) => {
    const at = (element: Element, name: string): number =>
      Number(element.getAttribute(name));
    const line = axis.querySelector('line')!;
    const text = axis.querySelector('text')!;
    const middle = [
      (at(line, 'x1') + at(line, 'x2')) / 2,
      (at(line, 'y1') + at(line, 'y2')) / 2,
    ];
    const unit = ([x, y]: readonly number[]): number[] =>
      [x! / Math.hypot(x!, y!), y! / Math.hypot(x!, y!)].map(round);

    return {
      middle: middle.map(round),
      direction: unit([
        at(line, 'x2') - at(line, 'x1'),
        at(line, 'y2') - at(line, 'y1'),
      ]),
      name: text.textContent,
      named: unit([at(text, 'x') - middle[0]!, at(text, 'y') - middle[1]!]),
    };
  });
}

/**
 * Give every element a client size of 400 by 300, so the scene pane has a grid
 * to draw and the world's origin sits at its middle; `restore` undoes it.
 */
function paneOf400By300(): { restore: () => void } {
  const width = vi
    .spyOn(Element.prototype, 'clientWidth', 'get')
    .mockReturnValue(400);
  const height = vi
    .spyOn(Element.prototype, 'clientHeight', 'get')
    .mockReturnValue(300);

  return {
    restore: () => {
      width.mockRestore();
      height.mockRestore();
    },
  };
}

/** A line's two ends under `root`, as `[x1, y1, x2, y2]`, to a millionth. */
function endsOf(root: Element, selector: string): number[] {
  const line = root.querySelector(selector)!;

  return ['x1', 'y1', 'x2', 'y2'].map(
    (name) => Math.round(Number(line.getAttribute(name)) * 1e6) / 1e6 || 0,
  );
}

/** Where the lines through two pairs of ends cross. */
function crossingOf(
  [x1, y1, x2, y2]: readonly number[],
  [x3, y3, x4, y4]: readonly number[],
): number[] {
  const across = (x1! - x2!) * (y3! - y4!) - (y1! - y2!) * (x3! - x4!);
  const along =
    ((x1! - x3!) * (y3! - y4!) - (y1! - y3!) * (x3! - x4!)) / across;

  return [x1! + along * (x2! - x1!), y1! + along * (y2! - y1!)];
}

describe('Editor, dragging', () => {
  // As in picking: the cart's gizmo is at the pane's corner, and this is just
  // above it, clear of the pivot's.
  const onCart = [0, -3] as const;

  test("dragging a frame's gizmo moves its position, as one step to undo", () => {
    const { container } = render(<Editor />);
    const before = code();
    dragScene(container, onCart, [9, -3], [18, -3]);

    // Eighteen pixels to the unit, and the node is selected as it moves.
    expect(code()).toContain('position={[1, 0]}');
    expect(shown()).toBe('TrackFrame');

    // Undone, the selection is back to what it was before the drag -- none --
    // and redone, it is the node the drag moved.
    fireEvent.click(undoButton());

    expect(code()).toBe(before);
    expect(shown()).toBeNull();

    fireEvent.click(redoButton());

    expect(shown()).toBe('TrackFrame');
  });

  test('each drag is a step of its own', () => {
    const { container } = render(<Editor />);
    dragScene(container, onCart, [18, -3]);
    dragScene(container, [18, -3], [36, -3]);
    fireEvent.click(undoButton());

    expect(code()).toContain('position={[1, 0]}');
  });

  test("a frame on a turned parent moves along its parent's axes", () => {
    const { container } = render(
      <Editor
        initialDocument={documentFrom(
          <RotationalFrame id="arm" initialState={[Math.PI / 2, 0]}>
            <TrackFrame id="tip" position={[2, 0]} />
          </RotationalFrame>,
        )}
      />,
    );

    // The arm is turned a quarter, so the tip hangs two units -- 36 pixels --
    // above the pane's corner, and up the screen is along the arm.
    dragScene(container, [0, -36], [0, -54]);

    expect(code()).toContain('position={[3, 0]}');
  });

  test("while a drag is under way, its parent's axes go through the frame", () => {
    const { container } = render(
      <Editor
        initialDocument={documentFrom(
          <RotationalFrame id="arm" initialState={[Math.PI / 2, 0]}>
            <RotationalFrame
              id="tip"
              position={[2, 0]}
              initialState={[Math.PI / 2, 0]}
            />
          </RotationalFrame>,
        )}
      />,
    );
    fireEvent.mouseDown(container.querySelector('.editor__scene svg')!, {
      clientX: 0,
      clientY: -36,
    });

    // Pressed, not yet moved: still a click, with no drag to show. Nor after
    // a wobble within a click's reach.
    expect(parentAxes(container)).toEqual([]);

    fireEvent.mouseMove(window, { clientX: 0, clientY: -38, buttons: 1 });

    expect(parentAxes(container)).toEqual([]);

    fireEvent.mouseMove(window, { clientX: 0, clientY: -54, buttons: 1 });

    // Through the tip where the drag has taken it, along the arm's axes, each
    // named at its positive end: x up the screen, y to the left. The tip's
    // own, turned a quarter further, run left and down.
    expect(parentAxes(container)).toEqual([
      { middle: [0, -54], direction: [0, -1], name: 'x', named: [0, -1] },
      { middle: [0, -54], direction: [-1, 0], name: 'y', named: [-1, 0] },
    ]);

    // Moved on, they go with it.
    fireEvent.mouseMove(window, { clientX: 0, clientY: -72, buttons: 1 });

    expect(parentAxes(container).map(({ middle }) => middle)).toEqual([
      [0, -72],
      [0, -72],
    ]);

    fireEvent.mouseUp(window, { clientX: 0, clientY: -72 });

    expect(parentAxes(container)).toEqual([]);
  });

  test("the parent's axes are drawn only in the tab the drag began in", () => {
    // Each body has a frame at its first place: `a` in the scene's, and `b`
    // in its component's.
    const { container } = render(
      <Editor
        initialDocument={documentFrom(
          <>
            <TrackFrame id="a" />
            <TrackFrame id="b" />
          </>,
        )}
      />,
    );
    fireEvent.click(rowLine(rows()[1]!));
    extract('Slider');
    fireEvent.mouseDown(container.querySelector('.editor__scene svg')!, {
      clientX: 0,
      clientY: -3,
    });
    fireEvent.mouseMove(window, { clientX: 18, clientY: -3, buttons: 1 });

    expect(parentAxes(container)).toHaveLength(2);

    // However the focus comes to leave mid-drag -- an undo that returns to
    // the scene's tab, say -- `a` in that tab is not the frame being dragged.
    fireEvent.click(screen.getByRole('tab', { name: 'Scene' }));

    expect(parentAxes(container)).toEqual([]);

    fireEvent.mouseUp(window, { clientX: 18, clientY: -3 });
  });

  test('a drag goes where the pointer goes, to the nearest hundredth', () => {
    const { container } = render(<Editor />);
    dragScene(container, onCart, [7, -3]);

    expect(code()).toContain('position={[0.39, 0]}');
  });

  test('a press inside an instance drags the frame that places it', () => {
    const { container } = render(<Editor />);
    const svg = container.querySelector<SVGSVGElement>('.editor__scene svg')!;

    // Just below the pivot, whose frame the pendulum's own body builds. That
    // frame is not this body's to move, so the press takes the one above it:
    // the fixed frame hanging the pendulum from the cart.
    fireEvent.mouseMove(svg, { clientX: 0, clientY: 12 });

    expect(svg.style.cursor).toBe('grab');

    dragScene(container, [0, 12], [18, 12]);

    expect(code()).toMatch(/<FixedFrame position=\{\[1, -0\.5\]\}>/);

    fireEvent.click(undoButton());

    expect(code()).toMatch(/<FixedFrame position=\{\[0, -0\.5\]\}>/);

    // And just above it, where the cart's own gizmo lies under the pivot's.
    // The pivot is on top and still cannot move, so the press passes over it.
    fireEvent.mouseMove(svg, { clientX: 0, clientY: 8 });

    expect(svg.style.cursor).toBe('grab');

    dragScene(container, [0, 8], [18, 8]);

    expect(code()).toMatch(/<FixedFrame position=\{\[1, -0\.5\]\}>/);
  });

  test('the pointer offers a grab wherever a press would do something', () => {
    const { container } = render(<Editor />);
    const svg = container.querySelector<SVGSVGElement>('.editor__scene svg')!;
    fireEvent.mouseMove(svg, { clientX: onCart[0], clientY: onCart[1] });

    expect(svg.style.cursor).toBe('grab');

    // Empty space used to say nothing, because a press there did nothing. It
    // pans now, so it offers the same grab; what a press refuses is pinned by
    // the test below instead.
    fireEvent.mouseMove(svg, { clientX: 300, clientY: -300 });

    expect(svg.style.cursor).toBe('grab');
  });

  test('a press refuses only where nothing at all can move', () => {
    const [arm] = nodesFrom(
      <RotationalFrame id="arm">
        <Line endPos={[4, 0]} lineWidth={0.2} />
      </RotationalFrame>,
    );
    const { container } = render(
      <Editor
        initialDocument={{
          root: 'Scene',
          definitions: [
            {
              name: 'Scene',
              body: [
                {
                  type: { kind: 'defined', name: 'Arm' },
                  props: {},
                  children: [],
                },
              ],
            },
            { name: 'Arm', body: [arm!] },
          ],
        }}
      />,
    );
    const svg = container.querySelector<SVGSVGElement>('.editor__scene svg')!;
    const before = code();

    // The instance stands at the top of the body with no frame placing it, so
    // above the arm's own frame there is nothing for the press to take. This
    // is the one refusal left, and it is one the picture cannot satisfy.
    fireEvent.mouseMove(svg, { clientX: 0, clientY: 0 });

    expect(svg.style.cursor).toBe('not-allowed');

    dragScene(container, [0, 0], [18, 0]);

    expect(code()).toBe(before);

    // And down the rod, clear of the gizmo's nine pixels: a shape leading
    // nowhere refuses too, and saying nothing there reads as empty space.
    fireEvent.mouseMove(svg, { clientX: 36, clientY: 0 });

    expect(svg.style.cursor).toBe('not-allowed');
  });

  test('a press passes over what leads nowhere to what does', () => {
    const [arm] = nodesFrom(
      <RotationalFrame id="arm">
        <Line endPos={[4, 0]} lineWidth={0.6} />
      </RotationalFrame>,
    );
    const [cart] = nodesFrom(
      <TrackFrame id="cart">
        <Box width={4} height={2} />
      </TrackFrame>,
    );
    const { container } = render(
      <Editor
        initialDocument={{
          root: 'Scene',
          definitions: [
            {
              name: 'Scene',
              body: [
                cart!,
                {
                  type: { kind: 'defined', name: 'Arm' },
                  props: {},
                  children: [],
                },
              ],
            },
            { name: 'Arm', body: [arm!] },
          ],
        }}
      />,
    );

    // The arm draws last, so its rod is the topmost hit -- and it leads
    // nowhere, the instance being placed by no frame. The cart's box lies
    // under the same pixel and does lead somewhere, so the press takes it.
    dragScene(container, [36, 0], [54, 0]);

    expect(code()).toMatch(/<TrackFrame id="cart"[^>]*position=\{\[1, 0\]\}>/);
  });

  test('a press on a shape that has a position of its own drags its frame', () => {
    const { container } = render(<Editor />);

    // On the cart's box, clear of every gizmo. A box carries a `position`, so
    // the walk has to pass over it deliberately: a shape has no gizmo to drag
    // by, and the frame drawing it is what moves.
    dragScene(container, [12, -6], [30, -6]);

    expect(code()).toMatch(/<TrackFrame id="cart"[^>]*position=\{\[1, 0\]\}>/);
  });

  test('a press on a shape drags the frame it is drawn in', () => {
    const { container } = render(
      <Editor
        initialDocument={documentFrom(
          <TrackFrame id="cart">
            <Line endPos={[4, 0]} lineWidth={0.2} />
          </TrackFrame>,
        )}
      />,
    );

    // Mid-rod, well clear of the cart's gizmo at the pane's corner. The line
    // is not something this body can move on its own, so the frame drawing it
    // moves instead.
    dragScene(container, [36, 0], [54, 0]);

    expect(code()).toContain('position={[1, 0]}');
  });

  test('the click that ends a drag picks nothing', () => {
    const { container } = render(<Editor />);
    dragScene(container, onCart, [18, -3]);

    // The first click is the release's own. Swallowed, it leaves the next to
    // be a first click there, on the cart's gizmo, rather than a second.
    clickScene(container, [18, -3]);
    clickScene(container, [18, -3]);

    expect(shown()).toBe('TrackFrame');
  });

  test('a click with a pixel of wobble in it is still a click', () => {
    const { container } = render(<Editor />);
    const before = code();
    dragScene(container, onCart, [1, -3]);

    // The first click is the release's own, which picks as any click does.
    clickScene(container, onCart);
    clickScene(container, onCart);

    expect(code()).toBe(before);
    expect(undoButton()).toBeDisabled();
    expect(shown()).toBe('Box');
  });

  test('where gizmos lie on one another, the top one drags, or the selected one', () => {
    const rig = documentFrom(
      <TrackFrame id="cart">
        <RotationalFrame id="arm" />
      </TrackFrame>,
    );

    // The arm sits on the cart's origin, and is drawn over it.
    const { container, unmount } = render(<Editor initialDocument={rig} />);
    dragScene(container, [0, -3], [18, -3]);

    expect(code()).toContain('<TrackFrame id="cart">');
    expect(code()).toContain('position={[1, 0]}');

    unmount();

    // Selected -- in the tree here, or by clicking again -- the cart drags.
    const again = render(<Editor initialDocument={rig} />);
    select('TrackFrame');
    dragScene(again.container, [0, -3], [18, -3]);

    expect(code()).toMatch(/<TrackFrame id="cart" position=\{\[1, 0\]\}>/);
    expect(code()).toContain('<RotationalFrame id="arm" />');
  });

  test('only the primary button drags, and not with Ctrl', () => {
    const { container } = render(<Editor />);
    const before = code();
    const svg = container.querySelector('.editor__scene svg')!;
    for (const press of [{ button: 2 }, { button: 0, ctrlKey: true }]) {
      fireEvent.mouseDown(svg, { clientX: 0, clientY: -3, ...press });
      fireEvent.mouseMove(window, { clientX: 18, clientY: -3, buttons: 1 });
      fireEvent.mouseUp(window, { clientX: 18, clientY: -3 });
    }

    expect(code()).toBe(before);
  });

  test('a drag whose release the page missed ends at the next move', () => {
    const { container } = render(<Editor />);
    fireEvent.mouseDown(container.querySelector('.editor__scene svg')!, {
      clientX: 0,
      clientY: -3,
    });
    fireEvent.mouseMove(window, { clientX: 9, clientY: -3, buttons: 1 });

    expect(code()).toContain('position={[0.5, 0]}');

    // The button is up, though no release was heard: the drag is over, and
    // stays over.
    fireEvent.mouseMove(window, { clientX: 18, clientY: -3, buttons: 0 });
    fireEvent.mouseMove(window, { clientX: 27, clientY: -3, buttons: 1 });

    expect(code()).toContain('position={[0.5, 0]}');
  });

  test("a turned frame moves along its parent's axes, not its own", () => {
    const { container } = render(
      <Editor
        initialDocument={documentFrom(
          <RotationalFrame id="arm" initialState={[Math.PI / 2, 0]} />,
        )}
      />,
    );
    dragScene(container, [0, -3], [18, -3]);

    // The world's x: along the arm's own axes this would be [0, -1].
    expect(code()).toContain('position={[1, 0]}');
  });

  test("a dragged frame snaps to a line's end, exactly", () => {
    const { container } = render(<Editor />);

    // The ground's right end is at (216, 9): this takes the cart's origin to
    // within four pixels of it.
    dragScene(container, onCart, [213, 4]);

    expect(code()).toContain('position={[12, -0.5]}');
  });

  test('it is the origin that snaps, not the pointer', () => {
    const { container } = render(<Editor />);

    // Grabbed by the tip of the cart's +x pointer, eleven pixels from its
    // origin: the origin lands within four pixels of the ground's end, and
    // the pointer eight away.
    dragScene(container, [11, 0], [224, 7]);

    expect(code()).toContain('position={[12, -0.5]}');
  });

  test('Alt places it freely, snapping to nothing', () => {
    const { container } = render(<Editor />);
    fireEvent.mouseDown(container.querySelector('.editor__scene svg')!, {
      clientX: onCart[0],
      clientY: onCart[1],
    });
    fireEvent.mouseMove(window, {
      clientX: 213,
      clientY: 4,
      buttons: 1,
      altKey: true,
    });
    fireEvent.mouseUp(window, { clientX: 213, clientY: 4 });

    expect(code()).toContain('position={[11.83, -0.39]}');
  });

  test('a ring marks what the drag snaps to, while the drag lasts', () => {
    const { container } = render(<Editor />);
    fireEvent.mouseDown(container.querySelector('.editor__scene svg')!, {
      clientX: onCart[0],
      clientY: onCart[1],
    });
    fireEvent.mouseMove(window, { clientX: 213, clientY: 4, buttons: 1 });
    const ring = container.querySelector('.editor__snap');

    expect([ring?.getAttribute('cx'), ring?.getAttribute('cy')]).toEqual([
      '216',
      '9',
    ]);

    fireEvent.mouseUp(window, { clientX: 213, clientY: 4 });

    expect(container.querySelector('.editor__snap')).toBeNull();
  });

  test('nothing that moves with the frame is a target', () => {
    const { container } = render(<Editor />);

    // Five pixels from where the pivot is -- but the pivot rides on the cart,
    // so it would only follow the drag. Clear of the grid's lines, too.
    dragScene(container, onCart, [5, 6]);

    expect(code()).toContain('position={[0.28, -0.5]}');
  });

  test("a frame snaps onto another's origin, finer than a hundredth", () => {
    const { container } = render(
      <Editor
        initialDocument={documentFrom(
          <>
            <TrackFrame id="a" />
            <TrackFrame id="b" position={[2.125, 1]} />
          </>,
        )}
      />,
    );
    dragScene(container, [0, -3], [37, -20]);

    expect(code()).toMatch(/<TrackFrame id="a" position=\{\[2\.125, 1\]\} \/>/);
  });

  test("a nested frame snaps along its parent's axes", () => {
    const { container } = render(
      <Editor
        initialDocument={documentFrom(
          <>
            <Line startPos={[1, 3]} endPos={[2, 3]} />
            <RotationalFrame id="arm" initialState={[Math.PI / 2, 0]}>
              <TrackFrame id="tip" position={[2, 0]} />
            </RotationalFrame>
          </>,
        )}
      />,
    );

    // The tip hangs at (0, -36) on screen and the line starts at (18, -54):
    // this takes the tip's origin within about two pixels of it.
    dragScene(container, [0, -36], [17, -52]);

    // One unit along the arm's x and one against its y. Read in the world's
    // axes, it would be [3, 1].
    expect(code()).toContain('position={[3, -1]}');
  });

  test('short of a point, each coordinate snaps to a whole unit on its own', () => {
    const { container } = render(<Editor />);

    // Three pixels short of two units across, and seven short of one up.
    dragScene(container, onCart, [33, -14]);

    expect(code()).toContain('position={[2, 0.61]}');
  });

  test("a nested frame snaps to its parent's grid, drawn while the drag lasts", () => {
    const pane = paneOf400By300();
    try {
      const { container } = render(
        <Editor
          initialDocument={documentFrom(
            <RotationalFrame id="arm" initialState={[Math.PI / 6, 0]}>
              <TrackFrame id="tip" position={[2, 0]} initialState={[0.5, 0]} />
            </RotationalFrame>,
          )}
        />,
      );
      const svg = container.querySelector('.editor__scene svg')!;

      // The arm is turned 30 degrees, and the tip's coordinate slides its
      // origin half a unit on from its position, 2.5 units along the arm:
      // press there, and move a unit along the arm and two pixels across.
      fireEvent.mouseDown(svg, { clientX: 239, clientY: 127 });
      fireEvent.mouseMove(window, { clientX: 254, clientY: 116, buttons: 1 });

      // While the drag lasts, the grid is whole units of the tip's position:
      // its lines of x = 3 and y = 0 cross where the drag has taken the
      // tip's origin, slide and all.
      const [x, y] = crossingOf(
        endsOf(svg, '.editor__grid [data-x="3"]'),
        endsOf(svg, '.editor__grid [data-y="0"]'),
      );
      const [, , originX, originY] = endsOf(
        svg,
        '[data-frame-id="tip"] .editor__gizmo-link',
      );

      // To a hundred-thousandth: the ends are read to a millionth.
      expect(x).toBeCloseTo(originX!, 5);
      expect(y).toBeCloseTo(originY!, 5);

      fireEvent.mouseUp(window, { clientX: 254, clientY: 116 });

      // Whole numbers along the arm's axes -- and the world's grid again, its
      // line of x = 0 straight up the pane's middle.
      expect(code()).toContain('position={[3, 0]}');
      expect(endsOf(svg, '.editor__grid [data-x="0"]')).toEqual([
        200, 300, 200, 0,
      ]);
    } finally {
      pane.restore();
    }
  });

  test("a drag's grid is drawn only in the tab the drag began in", () => {
    const pane = paneOf400By300();
    try {
      const { container } = render(
        <Editor
          initialDocument={documentFrom(
            <RotationalFrame id="arm" initialState={[Math.PI / 6, 0]}>
              <TrackFrame id="tip" position={[2, 0]} />
            </RotationalFrame>,
          )}
        />,
      );
      fireEvent.click(rowLine(rows()[0]!));
      extract('Arm');
      const svg = container.querySelector('.editor__scene svg')!;

      // In the arm's own tab: the tip, two units along the arm.
      fireEvent.mouseDown(svg, { clientX: 231, clientY: 132 });
      fireEvent.mouseMove(window, { clientX: 246, clientY: 121, buttons: 1 });

      const [x1, , x2] = endsOf(svg, '.editor__grid [data-x="0"]');

      expect(x1).not.toBeCloseTo(x2!, 6);

      // However the focus comes to leave mid-drag, the scene's tab draws the
      // world's grid, not the arm's.
      fireEvent.click(screen.getByRole('tab', { name: 'Scene' }));

      expect(endsOf(svg, '.editor__grid [data-x="0"]')).toEqual([
        200, 300, 200, 0,
      ]);

      fireEvent.mouseUp(window, { clientX: 246, clientY: 121 });
    } finally {
      pane.restore();
    }
  });

  test('a paused run offers nothing to snap to, and Reset brings it back', () => {
    vi.useFakeTimers({
      toFake: ['requestAnimationFrame', 'cancelAnimationFrame'],
    });
    try {
      const { container } = render(<Editor />);
      const svg = container.querySelector('.editor__scene svg')!;

      // Press just above the cart's origin, wherever it is, and move -- away
      // first, so it is a drag however near the end it began -- until the
      // origin lands within four pixels of the ground's end.
      const dragTowardTheEnd = (): void => {
        const link = container.querySelector(
          '.editor__gizmo .editor__gizmo-link',
        )!;
        fireEvent.mouseDown(svg, {
          clientX: Number(link.getAttribute('x2')),
          clientY: Number(link.getAttribute('y2')) - 3,
        });
        fireEvent.mouseMove(window, { clientX: 100, clientY: 100, buttons: 1 });
        fireEvent.mouseMove(window, { clientX: 213, clientY: 4, buttons: 1 });
      };

      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
      act(() => {
        vi.advanceTimersByTime(300);
      });
      fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
      dragTowardTheEnd();

      // In the run's pose, a snap would be exact about a pose the code never
      // builds.
      expect(container.querySelector('.editor__snap')).toBeNull();

      fireEvent.mouseUp(window, { clientX: 213, clientY: 4 });
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
      dragTowardTheEnd();

      expect(container.querySelector('.editor__snap')).not.toBeNull();

      fireEvent.mouseUp(window, { clientX: 213, clientY: 4 });
    } finally {
      vi.useRealTimers();
    }
  });

  test("in a run's pose there is no grid to snap to either", () => {
    vi.useFakeTimers({
      toFake: ['requestAnimationFrame', 'cancelAnimationFrame'],
    });
    try {
      const { container } = render(<Editor />);
      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
      act(() => {
        vi.advanceTimersByTime(300);
      });
      fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

      // Just above the cart's origin, wherever the run has taken it, and
      // three pixels short of two units across and seven short of one up.
      const link = container.querySelector(
        '.editor__gizmo .editor__gizmo-link',
      )!;
      const x = Math.round(Number(link.getAttribute('x2')));
      const y = Math.round(Number(link.getAttribute('y2'))) - 3;
      dragScene(container, [x, y], [x + 33, y - 11]);

      // In the pose the code builds, this would be [2, 0.61].
      expect(code()).toContain('position={[1.83, 0.61]}');
    } finally {
      vi.useRealTimers();
    }
  });
});

/** The scene tree's rows, as a screen reader finds them. */
function rows(): HTMLElement[] {
  return within(screen.getByRole('tree', { name: 'Scene' })).getAllByRole(
    'treeitem',
  );
}

/** Press `key` wherever the focus is, as a keyboard does. */
function pressKey(key: string): void {
  fireEvent.keyDown(document.activeElement!, { key });
}

describe('Editor, the tree from the keyboard', () => {
  // Type-ahead reads the clock, so each test runs on a fake one.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('each row is a tree item, named for what it shows, and Tab reaches one', () => {
    render(<Editor />);

    expect(rows().map((row) => row.getAttribute('aria-label'))).toEqual([
      'Line',
      'TrackFrame id="cart"',
      'Box',
      'Weight mass=50',
      'FixedFrame',
      'Pendulum',
    ]);
    expect(screen.getByRole('treeitem', { name: 'TrackFrame id="cart"' })).toBe(
      rows()[1],
    );

    // With nothing selected, Tab reaches the first row.
    expect(rows().map((row) => row.tabIndex)).toEqual([0, -1, -1, -1, -1, -1]);

    // Nothing else in the tree is a Tab stop: not the rows inside the items.
    const tree = screen.getByRole('tree', { name: 'Scene' });

    expect(
      [...tree.querySelectorAll<HTMLElement>('*')].filter(
        (element) => element.tabIndex >= 0,
      ),
    ).toEqual([rows()[0]]);
  });

  test('Up, Down, Home and End move the focus, and Enter selects', () => {
    render(<Editor />);
    act(() => rows()[0]!.focus());
    pressKey('ArrowDown');

    expect(document.activeElement).toBe(rows()[1]);

    pressKey('ArrowDown');

    expect(document.activeElement).toBe(rows()[2]);

    // From inside the cart, too: only the row the key was pressed in moves.
    pressKey('ArrowDown');

    expect(document.activeElement).toBe(rows()[3]);

    pressKey('End');

    expect(document.activeElement).toBe(rows()[5]);

    pressKey('Home');

    expect(document.activeElement).toBe(rows()[0]);

    // There is nothing above the first row.
    pressKey('ArrowUp');

    expect(document.activeElement).toBe(rows()[0]);

    pressKey('ArrowDown');
    pressKey('Enter');

    expect(shown()).toBe('TrackFrame');
  });

  test("Right goes into a node's children, and Left back out", () => {
    render(<Editor />);
    act(() => rows()[1]!.focus());
    pressKey('ArrowRight');

    expect(document.activeElement).toBe(rows()[2]);

    // The box has no children, and the cart no parent: each stays put.
    pressKey('ArrowRight');

    expect(document.activeElement).toBe(rows()[2]);

    pressKey('ArrowLeft');

    expect(document.activeElement).toBe(rows()[1]);

    pressKey('ArrowLeft');

    expect(document.activeElement).toBe(rows()[1]);
  });

  test('in the tree the Tab stop is the focused row; back in, the selection', () => {
    const { container } = render(<Editor />);
    select('Box');
    act(() => rows()[2]!.focus());
    pressKey('ArrowDown');
    pressKey('ArrowDown');

    // On the fixed frame, with the box still selected: it is the stop.
    expect(rows().map((row) => row.tabIndex)).toEqual([-1, -1, -1, -1, 0, -1]);

    // Out of the tree: Tab back in lands on the selection...
    act(() => (document.activeElement as HTMLElement).blur());

    expect(rows().map((row) => row.tabIndex)).toEqual([-1, -1, 0, -1, -1, -1]);

    // ...and on a new one, however it was made.
    clickScene(container, circleCentre(container));

    expect(rows().map((row) => row.tabIndex)).toEqual([-1, -1, -1, -1, -1, 0]);
  });

  test('the focused row stays the Tab stop when the selection is cleared', () => {
    render(<Editor />);
    select('Box');
    act(() => rows()[2]!.focus());
    pressKey('Escape');

    expect(document.activeElement).toBe(rows()[2]);
    expect(rows().map((row) => row.tabIndex)).toEqual([-1, -1, 0, -1, -1, -1]);
  });

  test('with Alt, Ctrl or Meta held, the arrows are left to the browser', () => {
    render(<Editor />);
    act(() => rows()[2]!.focus());

    expect(
      fireEvent.keyDown(rows()[2]!, { key: 'ArrowLeft', altKey: true }),
    ).toBe(true);
    expect(
      fireEvent.keyDown(rows()[2]!, { key: 'ArrowRight', metaKey: true }),
    ).toBe(true);
    expect(document.activeElement).toBe(rows()[2]);
  });

  test('after a delete, an arrow takes the focus up again from the tree', () => {
    render(<Editor />);
    select('Box');
    act(() => rows()[2]!.focus());
    pressKey('Delete');

    expect(document.activeElement).toBe(
      screen.getByRole('tree', { name: 'Scene' }),
    );

    // The row that took the deleted one's place.
    pressKey('ArrowDown');

    expect(document.activeElement).toBe(rows()[2]);
  });

  test('deleting the last row, focused and not selected, leaves the tree reachable', () => {
    render(<Editor />);
    act(() => rows()[4]!.focus());
    pressKey('Delete');
    pressKey('ArrowDown');

    expect(document.activeElement).toBe(rows()[0]);
  });

  test('a typed letter moves to the next row whose name starts with it', () => {
    render(<Editor />);
    act(() => rows()[0]!.focus());
    pressKey('w');

    expect(document.activeElement).toBe(rows()[3]);

    // Whatever the case, and round to the top.
    act(() => {
      vi.advanceTimersByTime(600);
    });
    pressKey('L');

    expect(document.activeElement).toBe(rows()[0]);
  });

  test('letters in quick succession spell a name; a pause starts again', () => {
    render(
      <Editor
        initialDocument={documentFrom(
          <>
            <TrackFrame id="a" />
            <TrackFrame id="b" />
          </>,
        )}
      />,
    );
    act(() => rows()[0]!.focus());

    // `t` steps on to the next row starting with it; `tr` still fits it, so
    // the focus stays.
    pressKey('t');
    pressKey('r');

    expect(document.activeElement).toBe(rows()[1]);

    // After a pause, `t` is a search of its own, and steps on again.
    act(() => {
      vi.advanceTimersByTime(600);
    });
    pressKey('t');

    expect(document.activeElement).toBe(rows()[0]);
  });

  test('the letters of a search spell out more than the first', () => {
    render(
      <Editor
        initialDocument={documentFrom(
          <>
            <TrackFrame id="a" />
            <Circle radius={1} />
            <Coincidence frame1="a" frame2="a" />
          </>,
        )}
      />,
    );
    act(() => rows()[0]!.focus());
    pressKey('c');

    expect(document.activeElement).toBe(rows()[1]);

    // `co` does not fit the circle, so the search moves on to the coincidence.
    pressKey('o');

    expect(document.activeElement).toBe(rows()[2]);
  });

  test('the same letter again steps through the rows that start with it', () => {
    render(
      <Editor
        initialDocument={documentFrom(
          <>
            <Box width={1} height={1} />
            <Circle radius={1} />
            <Box width={2} height={1} />
          </>,
        )}
      />,
    );
    act(() => rows()[0]!.focus());
    pressKey('b');

    expect(document.activeElement).toBe(rows()[2]);

    pressKey('b');

    expect(document.activeElement).toBe(rows()[0]);
  });

  test('with Alt, Ctrl or Meta held, a letter is left alone', () => {
    render(<Editor />);
    act(() => rows()[0]!.focus());

    expect(fireEvent.keyDown(rows()[0]!, { key: 'b', ctrlKey: true })).toBe(
      true,
    );
    expect(fireEvent.keyDown(rows()[0]!, { key: 'b', altKey: true })).toBe(
      true,
    );
    expect(fireEvent.keyDown(rows()[0]!, { key: 'b', metaKey: true })).toBe(
      true,
    );
    expect(document.activeElement).toBe(rows()[0]);
  });

  test('after a delete, a letter searches from where the arrows take up', () => {
    render(
      <Editor
        initialDocument={documentFrom(
          <>
            <Box width={1} height={1} />
            <Circle radius={1} />
            <Box width={2} height={1} />
          </>,
        )}
      />,
    );
    select('Circle');
    act(() => rows()[1]!.focus());
    pressKey('Delete');

    // The focus is on the tree itself: the search starts at the row Tab
    // would reach -- the box that took the circle's place -- and includes it.
    pressKey('b');

    expect(document.activeElement).toBe(rows()[1]);
  });

  test('Space selects, and is no part of a search', () => {
    render(
      <Editor
        initialDocument={documentFrom(
          <>
            <TrackFrame id="a" />
            <Circle radius={1} />
            <Coincidence frame1="a" frame2="a" />
          </>,
        )}
      />,
    );
    act(() => rows()[0]!.focus());
    pressKey('c');
    pressKey(' ');

    expect(shown()).toBe('Circle');

    // So the search is still `c`, and `o` makes it `co`: the coincidence.
    pressKey('o');

    expect(document.activeElement).toBe(rows()[2]);
  });
});

/** The code pane's marked text: the selected node's source, if any is marked. */
function marked(): string | null {
  return (
    screen.getByRole('region', { name: 'Code' }).querySelector('mark')
      ?.textContent ?? null
  );
}

/** How much of the code pane's text comes before its mark. */
function markOffset(): number {
  const pane = screen.getByRole('region', { name: 'Code' });
  const before = document.createRange();
  before.setStart(pane, 0);
  before.setEndBefore(pane.querySelector('mark')!);

  return before.toString().length;
}

describe('Editor, the selection in the code', () => {
  // jsdom lays nothing out. These give the code pane a height of 300 pixels,
  // its top 100 down the screen, and put the mark `content` pixels down what
  // the pane scrolls -- moving up the screen as the pane scrolls down.
  let content = { top: 600, bottom: 620 };
  let spies: { mockRestore: () => void }[] = [];

  beforeEach(() => {
    content = { top: 600, bottom: 620 };
    spies = [
      vi
        .spyOn(Element.prototype, 'clientHeight', 'get')
        .mockImplementation(function (this: Element) {
          return this.matches('.editor__code') ? 300 : 0;
        }),
      vi
        .spyOn(Element.prototype, 'getBoundingClientRect')
        .mockImplementation(function (this: Element) {
          const pane = this.closest('.editor__code');
          const [top, bottom] = this.matches('.editor__code')
            ? [100, 400]
            : this.tagName === 'MARK' && pane
              ? [
                  100 + content.top - pane.scrollTop,
                  100 + content.bottom - pane.scrollTop,
                ]
              : [0, 0];

          return new DOMRect(0, top, 0, bottom - top);
        }),
    ];
  });

  afterEach(() => {
    spies.forEach((spy) => spy.mockRestore());
  });

  test("the selected node's source is marked, and the pane scrolled to it once", () => {
    render(<Editor />);
    const pane = screen.getByRole('region', { name: 'Code' });

    expect(marked()).toBeNull();

    select('Box');

    // By the smallest move that shows it: its bottom to the pane's.
    expect(marked()).toBe('<Box width={2} />');
    expect(pane.scrollTop).toBe(320);

    // An edit moves the mark with the node, and leaves the view where the
    // person put it.
    pane.scrollTop = 0;
    fireEvent.change(within(select('Box')).getByLabelText('Width'), {
      target: { value: '3' },
    });

    expect(marked()).toBe('<Box width={3} />');
    expect(pane.scrollTop).toBe(0);

    select('Weight');

    expect(marked()).toBe('<Weight mass={50} />');
    expect(pane.scrollTop).toBe(320);
  });

  test('a mark taller than the pane comes in by its first line', () => {
    content = { top: 400, bottom: 1100 };
    render(<Editor />);
    const pane = screen.getByRole('region', { name: 'Code' });
    select('TrackFrame');

    // Its opening tag at the pane's top, not its closing tag at the bottom.
    expect(pane.scrollTop).toBe(400);

    // Scrolled so that line shows, a mark there stays put.
    pane.scrollTop = 250;
    select('Box');

    expect(pane.scrollTop).toBe(250);
  });

  test('a frame is marked with all it holds', () => {
    render(<Editor />);
    select('TrackFrame');

    expect(marked()).toMatch(
      /^<TrackFrame id="cart" resistance=\{5\}>[\s\S]*<\/FixedFrame>\s*<\/TrackFrame>$/,
    );
  });

  test("a node in a component's tab is marked in that component", () => {
    render(<Editor />);
    fireEvent.doubleClick(
      within(screen.getByRole('tree', { name: 'Scene' })).getByText('Pendulum'),
    );
    fireEvent.click(
      within(screen.getByRole('tree', { name: 'Pendulum' })).getByText(
        'Circle',
      ),
    );

    expect(marked()).toBe('<Circle position={POSITION} radius={0.5} />');

    // The pane holds the module unchanged, and the mark starts where codegen
    // wrote the node -- not merely somewhere its text occurs.
    const { source, ranges } = emitScene(starterDocument());

    expect(code()).toBe(source);
    expect(markOffset()).toBe(ranges.get(rangeKey('Pendulum', [0, 1]))![0]);
  });
});

/** The tree's find field. */
function findField(): HTMLElement {
  return screen.getByRole('searchbox', { name: 'Find a node' });
}

/** Type `text` into the find field, all at once. */
function find(text: string): void {
  fireEvent.change(findField(), { target: { value: text } });
}

/** What the find field says it turned up, as its description. */
function foundStatus(): string {
  return document.getElementById(findField().getAttribute('aria-describedby')!)!
    .textContent!;
}

/** The gap above a row, which a drop lands in to go among its siblings. */
function gapOf(item: HTMLElement): HTMLElement {
  return item.querySelector<HTMLElement>('.editor__gap')!;
}

/**
 * A row's clickable line. The gap a drop lands in comes first in the item, so
 * the line is asked for by name rather than by position.
 */
function rowLine(item: HTMLElement): HTMLElement {
  return item.querySelector<HTMLElement>('.editor__row')!;
}

/** The rows find has marked, by what each shows. */
function marks(): (string | null)[] {
  return rows()
    .filter((row) => rowLine(row).hasAttribute('data-match'))
    .map((row) => row.getAttribute('aria-label'));
}

describe('Editor, finding a node', () => {
  test('what is typed selects the first node whose tag, id or props hold it', () => {
    render(<Editor />);

    // The spaces around it are no part of it.
    find(' cart ');

    expect(shown()).toBe('TrackFrame');
    expect(foundStatus()).toBe('1 of 1');

    // A prop as the row writes it, whatever the case; and a tag.
    find('MASS=50');

    expect(shown()).toBe('Weight');

    find('box');

    expect(shown()).toBe('Box');
  });

  test('Enter steps to the next, round to the first, and Shift+Enter back', () => {
    render(<Editor />);
    find('width');

    // The line's `lineWidth` and the box's `width`, in the tree's order.
    expect(shown()).toBe('Line');
    expect(foundStatus()).toBe('1 of 2');

    fireEvent.keyDown(findField(), { key: 'Enter' });

    expect(shown()).toBe('Box');
    expect(foundStatus()).toBe('2 of 2');

    fireEvent.keyDown(findField(), { key: 'Enter' });

    expect(shown()).toBe('Line');

    fireEvent.keyDown(findField(), { key: 'Enter', shiftKey: true });

    expect(shown()).toBe('Box');

    fireEvent.keyDown(findField(), { key: 'Enter', shiftKey: true });

    expect(shown()).toBe('Line');
  });

  test('from a selection it did not make, it goes on from there', () => {
    render(<Editor />);

    // From the cart, between the line and the box: on to the box, and back
    // to the line.
    select('TrackFrame');
    find('width');

    expect(shown()).toBe('Box');
    expect(foundStatus()).toBe('2 of 2');

    select('TrackFrame');

    expect(foundStatus()).toBe('2 found');

    fireEvent.keyDown(findField(), { key: 'Enter', shiftKey: true });

    expect(shown()).toBe('Line');
  });

  test('while the selection still matches, typing more keeps it', () => {
    render(<Editor />);
    find('width');
    fireEvent.keyDown(findField(), { key: 'Enter' });
    find('width=');

    expect(shown()).toBe('Box');
    expect(foundStatus()).toBe('2 of 2');
  });

  test('a search that turns up nothing says so, and leaves the selection', () => {
    render(<Editor />);
    select('Box');
    find('zzz');

    expect(foundStatus()).toBe('No match');
    expect(shown()).toBe('Box');

    // A blank one turns up nothing, and says nothing.
    find('  ');

    expect(foundStatus()).toBe('');
    expect(marks()).toEqual([]);
  });

  test('what it turns up is marked, and Escape clears it for the tree', () => {
    render(<Editor />);
    find('width');

    expect(marks()).toEqual(['Line', 'Box']);

    // On to the box, which is not the first row.
    fireEvent.keyDown(findField(), { key: 'Enter' });
    fireEvent.keyDown(findField(), { key: 'Escape' });

    expect(findField()).toHaveValue('');
    expect(marks()).toEqual([]);

    // Back in the tree, on the node it found.
    expect(document.activeElement).toBe(rows()[2]);
  });

  test('the rows scroll to a node selected out of their sight, and only they', () => {
    // jsdom lays nothing out: the tree's rows in a list 100 pixels high at the
    // top of the screen, and the selected row 300 pixels down what it scrolls.
    const spies = [
      vi
        .spyOn(Element.prototype, 'clientHeight', 'get')
        .mockImplementation(function (this: Element) {
          return this.matches('.editor__tree [role="tree"]') ? 100 : 0;
        }),
      vi
        .spyOn(Element.prototype, 'getBoundingClientRect')
        .mockImplementation(function (this: Element) {
          const list = this.closest('.editor__tree [role="tree"]');
          const [top, bottom] = this.matches('.editor__tree [role="tree"]')
            ? [0, 100]
            : list && this.matches('[aria-selected="true"] > .editor__row')
              ? [300 - list.scrollTop, 320 - list.scrollTop]
              : [0, 0];

          return new DOMRect(0, top, 0, bottom - top);
        }),
    ];
    try {
      const { container } = render(<Editor />);
      find('mass=50');

      expect(
        container.querySelector('.editor__tree [role="tree"]')!.scrollTop,
      ).toBe(220);

      // The pane around them, with the find field in it, stays where it was.
      expect(container.querySelector('.editor__tree')!.scrollTop).toBe(0);
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });
});

/**
 * The starter scene with its pendulum keeping no place for children -- and,
 * unless `mount`, no fixed frame at its bob either.
 */
function starterWithoutPlaces({ mount = true } = {}): SceneDocument {
  const isMount = (node: DocNode): boolean =>
    node.type.kind === 'core' && node.type.component.meta.name === 'FixedFrame';

  // A fixed frame taken out leaves what it held where it was, so the cart
  // keeps its pendulum.
  const strip = (nodes: readonly DocNode[]): DocNode[] =>
    nodes
      .filter(({ type }) => type.kind !== 'children')
      .flatMap((node) =>
        !mount && isMount(node)
          ? strip(node.children)
          : [{ ...node, children: strip(node.children) }],
      );
  const doc = starterDocument();

  return {
    ...doc,
    definitions: doc.definitions.map((definition) => ({
      ...definition,
      body: strip(definition.body),
    })),
  };
}

/** Add `name` from the library, where the selection says. */
function add(name: string): void {
  fireEvent.click(within(library()).getByRole('button', { name }));
}

/** Open the pendulum's own tab, from its instance's row in the scene's tree. */
function openPendulum(): void {
  fireEvent.doubleClick(
    within(screen.getByRole('tree', { name: 'Scene' })).getByText('Pendulum'),
  );
}

/** Click the row showing `text` in the tree of `name`. */
function selectIn(name: string, text: string): void {
  fireEvent.click(
    within(screen.getByRole('tree', { name })).getAllByText(text)[0]!,
  );
}

describe('Editor, components that take children', () => {
  test("a pendulum added to the starter's pendulum hangs from its bob", () => {
    const { container } = render(<Editor />);

    // The starter's pendulum keeps a place for children, in the fixed frame at
    // its bob, so its instance takes a pendulum -- and the cart hangs it from
    // a fixed frame of its own, at the bottom edge of its box.
    expect(code()).toMatch(
      /<FixedFrame position=\{POSITION\}>\s*\{children\}\s*<\/FixedFrame>/,
    );
    expect(code()).toMatch(
      /<FixedFrame position=\{\[0, -0\.5\]\}>\s*<Pendulum \/>\s*<\/FixedFrame>/,
    );

    selectIn('Scene', 'Pendulum');

    expect(library()).toHaveTextContent('Adds inside the selected Pendulum.');

    add('Pendulum');

    expect(code()).toMatch(/<Pendulum>\s*<Pendulum \/>\s*<\/Pendulum>/);

    // The cart and its fixed frame; the pendulum and its own; and the same
    // again, hung in it.
    expect(container.querySelectorAll('.editor__gizmo')).toHaveLength(6);

    // The nested one's rod starts at the centre of the first one's bob.
    const scene = container.querySelector('.editor__scene .scene')!;
    const [bob] = [...scene.querySelectorAll('circle')];
    const [cx, cy] = ['cx', 'cy'].map((name) =>
      Number(bob!.getAttribute(name)),
    );
    const starts = [...scene.querySelectorAll('line')].map((line) =>
      Math.hypot(
        Number(line.getAttribute('x1')) - cx!,
        Number(line.getAttribute('y1')) - cy!,
      ),
    );

    expect(Math.min(...starts)).toBeLessThan(1e-6);
  });

  test("the library's place for children goes in a component's tab, once", () => {
    render(<Editor initialDocument={starterWithoutPlaces()} />);
    const place = (): HTMLElement =>
      within(library()).getByRole('button', { name: 'Children' });

    expect(place()).toBeDisabled();
    expect(place()).toHaveAttribute(
      'title',
      expect.stringMatching(/goes in a component's body/),
    );

    openPendulum();

    expect(place()).toBeEnabled();

    add('Children');

    expect(place()).toBeDisabled();
    expect(place()).toHaveAttribute(
      'title',
      'Pendulum already has a place for its children.',
    );
  });

  test('the place says what it is, and cannot leave while children use it', () => {
    render(<Editor />);
    openPendulum();
    selectIn('Pendulum', 'Children');

    expect(shown()).toBe('Children');
    expect(
      screen.getByRole('region', { name: 'Properties' }),
    ).toHaveTextContent(
      'The children an instance of Pendulum is given go here',
    );

    // Nor can a frame holding it become a component of its own.
    selectIn('Pendulum', 'FixedFrame');

    expect(
      screen.getByRole('button', { name: 'Extract to component' }),
    ).toBeDisabled();

    // Given a circle, the scene's instance holds children.
    fireEvent.click(screen.getByRole('tab', { name: 'Scene' }));
    selectIn('Scene', 'Pendulum');
    add('Circle');
    fireEvent.click(screen.getByRole('tab', { name: 'Pendulum' }));
    selectIn('Pendulum', 'Children');
    const remove = within(
      screen.getByRole('region', { name: 'Tree' }),
    ).getByRole('button', { name: 'Delete' });

    expect(remove).toBeDisabled();
    expect(remove).toHaveAttribute(
      'title',
      expect.stringMatching(
        /holds children, which would then have nowhere to go/,
      ),
    );

    // From the keyboard, neither.
    fireEvent.keyDown(
      within(screen.getByRole('tree', { name: 'Pendulum' })).getByRole(
        'treeitem',
        { name: 'Children' },
      ),
      { key: 'Delete' },
    );

    expect(code()).toContain('{children}');
  });
});

describe('Editor, children on a fixed frame', () => {
  test('a fixed frame at the bob, with the place in it, hangs a nested pendulum there', () => {
    const { container } = render(
      <Editor initialDocument={starterWithoutPlaces({ mount: false })} />,
    );

    // In the pendulum's tab: a fixed frame in its frame, at the bob, and the
    // place for children in it.
    openPendulum();
    selectIn('Pendulum', 'RotationalFrame');
    add('FixedFrame');
    const props = screen.getByRole('region', { name: 'Properties' });
    fireEvent.change(within(props).getByLabelText('Position x'), {
      target: { value: '4' },
    });
    selectIn('Pendulum', 'FixedFrame');
    add('Children');

    expect(code()).toMatch(
      /<FixedFrame position=\{POSITION\}>\s*\{children\}\s*<\/FixedFrame>/,
    );

    // In the scene's tab, a pendulum hung in the pendulum.
    fireEvent.click(screen.getByRole('tab', { name: 'Scene' }));
    selectIn('Scene', 'Pendulum');
    add('Pendulum');

    // The nested one's rod starts at the centre of the first one's bob.
    const scene = container.querySelector('.editor__scene .scene')!;
    const [bob] = [...scene.querySelectorAll('circle')];
    const [cx, cy] = ['cx', 'cy'].map((name) =>
      Number(bob!.getAttribute(name)),
    );
    const starts = [...scene.querySelectorAll('line')].map((line) =>
      Math.hypot(
        Number(line.getAttribute('x1')) - cx!,
        Number(line.getAttribute('y1')) - cy!,
      ),
    );

    expect(Math.min(...starts)).toBeLessThan(1e-6);
  });
});

describe('Editor, moving a node into another', () => {
  /** A cart holding a box, and an arm beside it. */
  const doc = (): SceneDocument =>
    documentFrom(
      <>
        <TrackFrame id="cart">
          <Box width={2} height={1} />
        </TrackFrame>
        <RotationalFrame id="arm" />
      </>,
    );

  test('Alt+Shift+Right moves a node into the one above, and Left back out', () => {
    render(<Editor initialDocument={doc()} />);
    const arm = (): HTMLElement =>
      screen.getByRole('treeitem', { name: 'RotationalFrame id="arm"' });
    act(() => arm().focus());
    fireEvent.click(rowLine(arm()));
    pressKey('Enter');
    fireEvent.keyDown(arm(), {
      key: 'ArrowRight',
      altKey: true,
      shiftKey: true,
    });

    // Inside the cart, after the box -- and still selected, with the focus.
    expect(code()).toMatch(
      /<TrackFrame id="cart">\s*<Box width=\{2\} \/>\s*<RotationalFrame id="arm" \/>\s*<\/TrackFrame>/,
    );
    expect(shown()).toBe('RotationalFrame');
    expect(document.activeElement).toBe(arm());

    fireEvent.keyDown(arm(), {
      key: 'ArrowLeft',
      altKey: true,
      shiftKey: true,
    });

    expect(code()).toMatch(/<\/TrackFrame>\s*<RotationalFrame id="arm" \/>/);

    // One step each, to undo.
    fireEvent.click(undoButton());

    expect(code()).toMatch(/<RotationalFrame id="arm" \/>\s*<\/TrackFrame>/);
  });

  test('the toolbar moves too, and says why it cannot', () => {
    render(<Editor initialDocument={doc()} />);
    const into = (): HTMLElement =>
      screen.getByRole('button', { name: 'Move into the node above' });
    const out = (): HTMLElement =>
      screen.getByRole('button', { name: 'Move out of its parent' });

    // Nothing selected, nothing to move.
    expect(into()).toBeDisabled();
    expect(out()).toBeDisabled();

    fireEvent.click(
      rowLine(screen.getByRole('treeitem', { name: 'TrackFrame id="cart"' })),
    );

    expect(into()).toBeDisabled();
    expect(into()).toHaveAttribute(
      'title',
      'There is nothing above it to move it into.',
    );
    expect(out()).toBeDisabled();
    expect(out()).toHaveAttribute(
      'title',
      'It is at the top of the body already.',
    );

    fireEvent.click(
      rowLine(
        screen.getByRole('treeitem', { name: 'RotationalFrame id="arm"' }),
      ),
    );
    fireEvent.click(into());

    expect(code()).toMatch(/<RotationalFrame id="arm" \/>\s*<\/TrackFrame>/);

    fireEvent.click(out());

    expect(code()).toMatch(/<\/TrackFrame>\s*<RotationalFrame id="arm" \/>/);
  });

  test('a move the rules refuse does nothing, from the keyboard either', () => {
    render(<Editor />);
    const weight = screen.getByRole('treeitem', { name: 'Weight mass=50' });
    fireEvent.click(rowLine(weight));
    const before = code();

    // Out of the cart would put a weight at the top of the scene.
    const out = screen.getByRole('button', { name: 'Move out of its parent' });

    expect(out).toBeDisabled();
    expect(out).toHaveAttribute('title', 'Weight has to go inside a frame.');

    fireEvent.keyDown(weight, {
      key: 'ArrowLeft',
      altKey: true,
      shiftKey: true,
    });

    expect(code()).toBe(before);
  });

  test('a refused move leaves the focus where the keystroke found it', () => {
    render(<Editor initialDocument={doc()} />);
    const cart = (): HTMLElement =>
      screen.getByRole('treeitem', { name: 'TrackFrame id="cart"' });
    const arm = (): HTMLElement =>
      screen.getByRole('treeitem', { name: 'RotationalFrame id="arm"' });
    fireEvent.click(rowLine(cart()));
    act(() => arm().focus());

    // The arm is at the top of the body: there is nothing to move it out of,
    // so the focus stays on it rather than following the selection.
    fireEvent.keyDown(arm(), {
      key: 'ArrowLeft',
      altKey: true,
      shiftKey: true,
    });

    expect(document.activeElement).toBe(arm());

    // The cart, first in the body, has nothing above it to move into.
    fireEvent.click(rowLine(arm()));
    act(() => cart().focus());
    fireEvent.keyDown(cart(), {
      key: 'ArrowRight',
      altKey: true,
      shiftKey: true,
    });

    expect(document.activeElement).toBe(cart());
  });

  test('with Ctrl or Meta also held, the chords are left to the browser', () => {
    render(<Editor initialDocument={doc()} />);
    const arm = (): HTMLElement =>
      screen.getByRole('treeitem', { name: 'RotationalFrame id="arm"' });
    fireEvent.click(rowLine(arm()));
    const before = code();

    for (const held of [{ ctrlKey: true }, { metaKey: true }]) {
      expect(
        fireEvent.keyDown(arm(), {
          key: 'ArrowRight',
          altKey: true,
          shiftKey: true,
          ...held,
        }),
      ).toBe(true);
      expect(
        fireEvent.keyDown(arm(), { key: 'ArrowUp', altKey: true, ...held }),
      ).toBe(true);
    }

    expect(code()).toBe(before);
  });
});

describe('Editor, dragging a shape', () => {
  /** Select a row of the scene's tree by what it shows. */
  const pick = (tag: string): void => {
    fireEvent.click(
      within(screen.getByRole('tree', { name: 'Scene' })).getAllByText(tag)[0]!,
    );
  };

  const handles = (container: HTMLElement): string[] =>
    [...container.querySelectorAll('.editor__handle')].map(
      (handle) => handle.getAttribute('data-prop') ?? '',
    );

  test('a selected shape shows what it can be dragged by', () => {
    const { container } = render(<Editor />);

    expect(handles(container)).toEqual([]);

    pick('Box');

    expect(handles(container)).toEqual(['position']);

    // A line is moved an end at a time, so it offers both and no whole.
    pick('Line');

    expect(handles(container)).toEqual(['endPos', 'startPos']);

    // A weight draws nothing at all: its handle is the only mark it has.
    pick('Weight');

    expect(handles(container)).toEqual(['position']);
  });

  test('the selected shape is what moves, where several sit on one point', () => {
    const { container } = render(<Editor />);

    // The cart's box and its weight both sit at the cart's own origin, and the
    // cart's gizmo is there too. Selection is what tells them apart.
    pick('Box');
    dragScene(container, [0, 0], [18, 0]);

    expect(code()).toMatch(/<Box width=\{2\}[^/]*position=\{\[1, 0\]\}/);
    expect(code()).toMatch(/<TrackFrame id="cart" resistance=\{5\}>/);

    fireEvent.click(undoButton());
    pick('Weight');
    dragScene(container, [0, 0], [18, 0]);

    expect(code()).toMatch(/<Weight mass=\{50\} position=\{\[1, 0\]\}/);
  });

  test("a line's ends move one at a time", () => {
    const { container } = render(<Editor />);
    pick('Line');

    // The ground line runs from -12 to 12, so its ends are far from each other
    // and from every gizmo.
    dragScene(container, [212, 5], [230, 5]);

    expect(code()).toMatch(/endPos=\{\[13, -0\.5\]\}/);
    expect(code()).toMatch(/startPos=\{\[-12, -0\.5\]\}/);

    dragScene(container, [-220, 5], [-202, 5]);

    expect(code()).toMatch(/startPos=\{\[-11, -0\.5\]\}/);
  });

  test('the same pixel means the shape or its frame, by what is selected', () => {
    const { container } = render(<Editor />);

    // Inside the cart's box and well clear of its handle at the origin. With
    // nothing selected this drags the cart -- the rule from before -- and with
    // the box selected it drags the box.
    pick('Box');
    dragScene(container, [12, -6], [30, -6]);

    expect(code()).toMatch(/<Box width=\{2\}[^/]*position=\{\[1, 0\]\}/);
    expect(code()).toMatch(/<TrackFrame id="cart" resistance=\{5\}>/);
  });

  test("a shape snaps by the point held, not by its frame's origin", () => {
    const { container } = render(
      <Editor
        initialDocument={documentFrom(
          <>
            <TrackFrame id="a">
              <Box width={1} height={1} position={[1, 0]} />
            </TrackFrame>
            <TrackFrame id="b" position={[3.4, 0]} />
          </>,
        )}
      />,
    );
    pick('Box');

    // The box sits 18 across; the other frame's origin is 61.2. Dragged
    // almost onto it, the point held snaps there exactly, so the box lands at
    // [3.4, 0]. Snapped by its frame's origin instead, the target is 20 pixels
    // away and missed -- and the grid cannot stand in for it, which is why
    // this frame is off a whole unit.
    dragScene(container, [18, 0], [61, 0]);

    expect(code()).toMatch(/<Box[^/]*position=\{\[3\.4, 0\]\}/);
  });

  test('a constraint offers no handles: its points are not read here', () => {
    const { container } = render(
      <Editor
        initialDocument={documentFrom(
          <>
            <TrackFrame id="left" />
            <TrackFrame id="right" position={[2, 0]} />
            <Coincidence frame1="left" frame2="right" position1={[1, 0]} />
          </>,
        )}
      />,
    );
    pick('Coincidence');

    // `position1` is read in `frame1`'s coordinates, which this places
    // against no frame it knows; and `position2` is absent because it is
    // solved for, so writing a value would stop the scene building.
    expect(handles(container)).toEqual([]);
  });

  test('an anchor offers no handle: its point is solved for', () => {
    const { container } = render(
      <Editor
        initialDocument={documentFrom(
          <TrackFrame id="cart">
            <Anchor id="hitch" />
          </TrackFrame>,
        )}
      />,
    );
    pick('Anchor');

    // `Anchor.position` carries no default on purpose -- an anchor without one
    // has its point solved for, and no pair of numbers says that. A handle
    // would write a value and freeze what the solver is there to find.
    expect(handles(container)).toEqual([]);
  });

  test('the nearer of two handles takes the press', () => {
    const { container } = render(
      <Editor
        initialDocument={documentFrom(
          <TrackFrame id="cart">
            <Line startPos={[0, 0]} endPos={[0.3, 0]} lineWidth={0.2} />
          </TrackFrame>,
        )}
      />,
    );
    pick('Line');

    // The ends are 0.3 of a unit apart, so both are inside one press. The
    // nearer must win: first-declared would always take `endPos`, and
    // `startPos` could never be grabbed at all.
    dragScene(container, [1, 0], [19, 0]);

    expect(code()).toMatch(/startPos=\{\[1, 0\]\}/);
    expect(code()).toMatch(/endPos=\{\[0\.3, 0\]\}/);
  });

  test('a shape snaps to points in the frame drawing it, which does not move', () => {
    const { container } = render(
      <Editor
        initialDocument={documentFrom(
          <TrackFrame id="cart">
            <Box width={1} height={1} position={[1, 0]} />
            <RotationalFrame id="pivot" position={[3.4, 0]} />
          </TrackFrame>,
        )}
      />,
    );
    pick('Box');

    // The pivot shares the box's own frame. Excluding what moves with the
    // drag used to exclude that whole frame, so the points nearest to hand
    // were the ones left out; a shape moves nothing but itself.
    dragScene(container, [18, 0], [61, 0]);

    expect(code()).toMatch(/<Box[^/]*position=\{\[3\.4, 0\]\}/);
  });

  test('a click on a handle keeps what has nothing else to be clicked', () => {
    const { container } = render(<Editor />);
    pick('Weight');

    // A weight draws nothing but its handle, so a click reaching past it
    // would dismiss the only mark it has.
    clickScene(container, [0, 0]);

    expect(shown()).toBe('Weight');
    expect(handles(container)).toEqual(['position']);

    // A box has geometry of its own, so clicking it selects it again and the
    // click is left alone -- which is what lets a scene click still close a
    // name being typed.
    pick('Box');
    clickScene(container, [0, -3]);

    expect(shown()).not.toBe('Box');
  });

  test("a shape moves along its own frame's axes, not its parent's", () => {
    const { container } = render(
      <Editor
        initialDocument={documentFrom(
          <RotationalFrame
            id="arm"
            position={[2, 0]}
            initialState={[Math.PI / 2, 0]}
          >
            <Box width={1} height={1} position={[1, 0]} />
          </RotationalFrame>,
        )}
      />,
    );
    pick('Box');

    // The arm stands at [2, 0] turned a quarter, so its box sits at [2, 1] in
    // the world -- 36 across and 18 up the pane. Dragging one unit along the
    // world's +x is one unit along the arm's -y, because a shape's position is
    // read in the frame drawing it. Read in the arm's *parent's*, as a frame's
    // own position is, the same drag would write [2, 0].
    dragScene(container, [36, -18], [54, -18]);

    expect(code()).toMatch(/<Box[^/]*position=\{\[1, -1\]\}/);
  });

  test('an unselected shape still drags the frame drawing it', () => {
    const { container } = render(<Editor />);

    // Nothing selected: the rule from before, that a press takes the nearest
    // frame above what it points at.
    dragScene(container, [12, -6], [30, -6]);

    expect(code()).toMatch(/<TrackFrame id="cart"[^>]*position=\{\[1, 0\]\}>/);
  });
});

describe('Editor, dragging a row', () => {
  const doc = (): SceneDocument =>
    documentFrom(
      <>
        <TrackFrame id="cart">
          <Box width={2} height={1} />
          <Weight mass={5} />
          <Line endPos={[1, 0]} />
        </TrackFrame>
        <RotationalFrame id="arm" />
      </>,
    );

  // Rows: [0] cart, [1] box, [2] weight, [3] line, [4] arm.

  /** What a browser hands a drag, which jsdom supplies nothing of. */
  const transfer = (): DataTransfer =>
    ({
      setData: vi.fn(),
      getData: vi.fn(),
      effectAllowed: 'none',
      dropEffect: 'none',
    }) as unknown as DataTransfer;

  const pickUp = (at: number): DataTransfer => {
    const dataTransfer = transfer();
    fireEvent.dragStart(rowLine(rows()[at]!), { dataTransfer });

    return dataTransfer;
  };

  const dragOver = (target: HTMLElement): DataTransfer => {
    const dataTransfer = transfer();
    fireEvent.dragOver(target, { dataTransfer });

    return dataTransfer;
  };

  test('the drag carries data, so that a browser begins one at all', () => {
    render(<Editor initialDocument={doc()} />);
    const dataTransfer = pickUp(4);

    // Firefox starts no drag without it, and jsdom has no drag-and-drop model
    // to notice: every other test here assumes a drag that has begun.
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', '1');
    expect(dataTransfer.effectAllowed).toBe('move');
  });

  test('the row being carried is marked, and an abandoned drag clears it', () => {
    render(<Editor initialDocument={doc()} />);
    pickUp(4);

    expect(rowLine(rows()[4]!)).toHaveAttribute('data-dragging');

    dragOver(gapOf(rows()[1]!));

    expect(gapOf(rows()[1]!)).toHaveAttribute('data-over');

    // Abandoned rather than dropped -- Escape, or a release over the scene --
    // never reaches the drop, so the end is what returns the pane to rest.
    fireEvent.dragEnd(rowLine(rows()[4]!));

    expect(rowLine(rows()[4]!)).not.toHaveAttribute('data-dragging');
    expect(gapOf(rows()[1]!)).not.toHaveAttribute('data-over');
  });

  test('dropped on a row, a node goes inside it after its last child', () => {
    render(<Editor initialDocument={doc()} />);
    const before = code();
    pickUp(4);
    fireEvent.drop(rowLine(rows()[0]!));

    expect(code()).toMatch(
      /<Line endPos=\{\[1, 0\]\} \/>\s*<RotationalFrame id="arm" \/>\s*<\/TrackFrame>/,
    );

    // One step to undo, like every other move.
    fireEvent.click(undoButton());

    expect(code()).toBe(before);
  });

  test('dropped in the gap above a row, it goes among those siblings', () => {
    render(<Editor initialDocument={doc()} />);
    pickUp(4);
    fireEvent.drop(gapOf(rows()[1]!));

    expect(code()).toMatch(
      /<TrackFrame id="cart">\s*<RotationalFrame id="arm" \/>\s*<Box/,
    );
  });

  test('within one list, the node counts itself out of the way', () => {
    render(<Editor initialDocument={doc()} />);

    // The box, dropped above the line it stood two before, lands second --
    // not third, which is where its target sits while it is still in the list.
    pickUp(1);
    fireEvent.drop(gapOf(rows()[3]!));

    expect(code()).toMatch(
      /<Weight mass=\{5\} \/>\s*<Box width=\{2\} \/>\s*<Line/,
    );
  });

  test('a drop the rules refuse does nothing, and marks nothing', () => {
    render(<Editor initialDocument={doc()} />);
    const before = code();

    // A weight cannot stand at the top of a body.
    pickUp(2);

    // The cursor says no, as well as the target staying unlit.
    expect(dragOver(gapOf(rows()[0]!)).dropEffect).toBe('none');
    expect(gapOf(rows()[0]!)).not.toHaveAttribute('data-over');

    fireEvent.drop(gapOf(rows()[0]!));

    expect(code()).toBe(before);
  });

  test('a target a drop would land in is marked while it is over', () => {
    render(<Editor initialDocument={doc()} />);
    pickUp(4);

    // A move, rather than the copy a drag says by default.
    expect(dragOver(gapOf(rows()[1]!)).dropEffect).toBe('move');
    expect(gapOf(rows()[1]!)).toHaveAttribute('data-over');

    fireEvent.dragLeave(gapOf(rows()[1]!));

    expect(gapOf(rows()[1]!)).not.toHaveAttribute('data-over');

    // The row itself marks for a drop inside it.
    dragOver(rowLine(rows()[0]!));

    expect(rowLine(rows()[0]!)).toHaveAttribute('data-over');
  });

  test("dropped on the tree's own space, it goes to the end of the body", () => {
    render(<Editor initialDocument={doc()} />);
    pickUp(0);
    fireEvent.drop(screen.getByRole('tree'));

    expect(code()).toMatch(
      /<RotationalFrame id="arm" \/>\s*<TrackFrame id="cart">/,
    );
  });

  test('the selection follows the node, through the list it left', () => {
    render(<Editor initialDocument={doc()} />);

    // The cart goes inside the arm, which stands after it: once the cart has
    // left the body, the arm is the first node in it, and the cart is its
    // first child rather than the second body node's.
    pickUp(0);
    fireEvent.drop(rowLine(rows()[4]!));

    expect(code()).toMatch(
      /<RotationalFrame id="arm">\s*<TrackFrame id="cart">/,
    );
    expect(
      screen.getByRole('treeitem', { name: 'TrackFrame id="cart"' }),
    ).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Editor, hiding the marks and the grid', () => {
  /** One of the scene pane's two view controls. */
  const control = (name: string): HTMLElement =>
    screen.getByRole('button', { name });

  /** Whether a control is showing what it stands for. */
  const pressed = (name: string): string | null =>
    control(name).getAttribute('aria-pressed');

  test('each control says whether what it stands for is drawn', () => {
    const { container } = render(<Editor />);

    expect([pressed('Marks'), pressed('Grid')]).toEqual(['true', 'true']);
    expect(container.querySelector('.editor__gizmo')).not.toBeNull();
    expect(container.querySelector('.editor__grid')).not.toBeNull();

    fireEvent.click(control('Marks'));
    fireEvent.click(control('Grid'));

    expect([pressed('Marks'), pressed('Grid')]).toEqual(['false', 'false']);
    expect(container.querySelector('.editor__gizmo')).toBeNull();
    expect(container.querySelector('.editor__grid')).toBeNull();

    fireEvent.click(control('Marks'));
    fireEvent.click(control('Grid'));

    expect(container.querySelector('.editor__gizmo')).not.toBeNull();
    expect(container.querySelector('.editor__grid')).not.toBeNull();
  });

  test("a shape's handles go with the marks, and the selection stays", () => {
    const { container } = render(<Editor />);
    select('Box');

    expect(container.querySelectorAll('.editor__handle')).toHaveLength(1);

    fireEvent.click(control('Marks'));

    expect(container.querySelectorAll('.editor__handle')).toHaveLength(0);
    expect(shown()).toBe('Box');
  });

  test('with the marks off, a press falls to the frame above what it points at', () => {
    const { container } = render(<Editor />);

    // A weight draws nothing whatever, so its handle is the only thing there
    // is to press -- and with the marks off there is nothing there at all.
    select('Weight');
    dragScene(container, [0, 0], [18, 0]);

    expect(code()).toMatch(/<Weight mass=\{50\} position=\{\[1, 0\]\}/);

    fireEvent.click(undoButton());
    fireEvent.click(control('Marks'));
    dragScene(container, [0, 0], [18, 0]);

    // The press leads back through the box -- which the scene itself paints --
    // to the cart above it, and the weight stays where it was.
    expect(code()).toMatch(/<Weight mass=\{50\} \/>/);
    expect(code()).toMatch(/<TrackFrame id="cart"[^>]*position=\{\[1, 0\]\}/);
  });

  test('with the marks off, the selected shape is still dragged by its body', () => {
    const { container } = render(<Editor />);

    // Nothing about hiding the marks makes this drag undiscoverable: the box
    // is painted by the scene and named in the properties pane. Sending the
    // press to the frame underneath would move the box on screen -- it rides
    // on that frame -- while writing a node nobody was looking at.
    select('Box');
    fireEvent.click(control('Marks'));
    dragScene(container, [0, 0], [18, 0]);

    expect(code()).toMatch(/<Box width=\{2\}[^/]*position=\{\[1, 0\]\}/);
    expect(code()).toMatch(/<TrackFrame id="cart" resistance=\{5\}>/);
  });

  test('with the marks off, a click reaches the shape under the gizmo', () => {
    const { container } = render(<Editor />);
    clickScene(container, [0, -3]);

    // The cart's gizmo is drawn over its box, and takes the click.
    expect(shown()).toBe('TrackFrame');

    fireEvent.click(control('Marks'));
    clickScene(container, [0, -3]);

    expect(shown()).toBe('Box');
  });

  test('with the grid off, a drag no longer snaps to whole units', () => {
    const { container } = render(<Editor />);

    // Three pixels short of two units across, and seven short of one up.
    dragScene(container, [0, -3], [33, -14]);

    expect(code()).toContain('position={[2, 0.61]}');

    fireEvent.click(undoButton());
    fireEvent.click(control('Grid'));
    dragScene(container, [0, -3], [33, -14]);

    expect(code()).toContain('position={[1.83, 0.61]}');
  });

  test('with the marks off, nothing snaps to a point either', () => {
    const { container } = render(<Editor />);

    // The ground's right end is at (216, 9): this takes the cart's origin to
    // within four pixels of it.
    dragScene(container, [0, -3], [213, 4]);

    expect(code()).toContain('position={[12, -0.5]}');

    fireEvent.click(undoButton());
    fireEvent.click(control('Marks'));
    dragScene(container, [0, -3], [213, 4]);

    // The grid is still on, so the drag lands on a whole unit across rather
    // than exactly on the end it can no longer show.
    expect(code()).toContain('position={[12, -0.39]}');
  });

  test('with the marks off, a drag under way draws nothing of its own', () => {
    const { container } = render(<Editor />);
    fireEvent.click(control('Marks'));
    const svg = container.querySelector('.editor__scene svg')!;
    fireEvent.mouseDown(svg, { clientX: 0, clientY: -3 });
    fireEvent.mouseMove(window, { clientX: 213, clientY: 4, buttons: 1 });

    expect(container.querySelector('.editor__snap')).toBeNull();
    expect(container.querySelector('.editor__parent-axis')).toBeNull();

    fireEvent.mouseUp(window, { clientX: 213, clientY: 4 });
  });
});

describe('Editor, moving the view', () => {
  const control = (name: string): HTMLElement =>
    screen.getByRole('button', { name });

  /** Where a whole unit of the world's x is drawn, in the pane's pixels. */
  const drawnX = (container: HTMLElement, unit: number): number =>
    Number(
      container
        .querySelector(`.editor__grid [data-x="${unit}"]`)!
        .getAttribute('x1'),
    );

  /** Where the world's y origin is drawn. */
  const drawnY = (container: HTMLElement): number =>
    Number(
      container.querySelector('.editor__grid [data-y="0"]')!.getAttribute('y1'),
    );

  test('the wheel does not scroll the page along with the zoom', () => {
    const pane = paneOf400By300();
    try {
      const { container } = render(<Editor />);
      const svg = container.querySelector('.editor__scene svg')!;

      // A passive listener cannot cancel an event, so a prevented default is
      // what says this one is not passive -- and `fireEvent` hands back what
      // `dispatchEvent` returned, which is false when the default was stopped.
      expect(
        fireEvent.wheel(svg, { deltaY: -320, clientX: 290, clientY: 150 }),
      ).toBe(false);
    } finally {
      pane.restore();
    }
  });

  test('a notch is the same zoom whatever unit the browser reports it in', () => {
    const pane = paneOf400By300();
    try {
      const { container } = render(<Editor />);
      const svg = container.querySelector('.editor__scene svg')!;

      // Firefox on Windows and Linux reports lines rather than pixels, at
      // sixteen pixels to the line -- so twenty lines is the 320 pixels the
      // test below uses, and both have to mean one notch.
      fireEvent.wheel(svg, {
        deltaY: -20,
        deltaMode: 1,
        clientX: 200,
        clientY: 150,
      });
      const byLines = drawnX(container, 1) - drawnX(container, 0);

      expect(byLines).toBeCloseTo(18 * Math.E, 6);

      fireEvent.click(control('Reset view'));
      fireEvent.wheel(svg, {
        deltaY: -320,
        deltaMode: 0,
        clientX: 200,
        clientY: 150,
      });

      expect(drawnX(container, 1) - drawnX(container, 0)).toBeCloseTo(
        byLines,
        6,
      );
    } finally {
      pane.restore();
    }
  });

  test('the wheel does nothing while a drag is under way', () => {
    const pane = paneOf400By300();
    try {
      const { container } = render(<Editor />);
      const svg = container.querySelector('.editor__scene svg')!;

      // A drag holds its parent's transform, its origin and its snap targets
      // as they were at the press, so a view that moved under it would leave
      // the scene no longer following the pointer.
      dragScene(container, [200, 150], [218, 150]);
      const plain = code();
      fireEvent.click(undoButton());

      fireEvent.mouseDown(svg, { clientX: 200, clientY: 150 });
      fireEvent.wheel(svg, { deltaY: -320, clientX: 200, clientY: 150 });
      fireEvent.mouseMove(window, { clientX: 218, clientY: 150, buttons: 1 });
      fireEvent.mouseUp(window, { clientX: 218, clientY: 150 });

      expect(drawnX(container, 1) - drawnX(container, 0)).toBe(18);
      expect(code()).toBe(plain);
    } finally {
      pane.restore();
    }
  });

  test('the cursor says grabbing for as long as a pan lasts', () => {
    const pane = paneOf400By300();
    try {
      const { container } = render(<Editor />);
      const svg = container.querySelector<SVGSVGElement>('.editor__scene svg')!;
      fireEvent.mouseDown(svg, { clientX: 30, clientY: 30 });
      fireEvent.mouseMove(window, { clientX: 70, clientY: 55, buttons: 1 });

      // The pointer passing over the scene mid-pan: the cursor answers what a
      // press would do, and during a gesture that is already settled. With the
      // button still down -- a move without it means the release went unseen,
      // which ends the pan.
      fireEvent.mouseMove(svg, { clientX: 200, clientY: 150, buttons: 1 });

      expect(svg.style.cursor).toBe('grabbing');

      fireEvent.mouseUp(window, { clientX: 200, clientY: 150 });

      expect(svg.style.cursor).toBe('');
    } finally {
      pane.restore();
    }
  });

  test('a press in the scene aims the history keys back at the editor', () => {
    const pane = paneOf400By300();
    try {
      const { container } = render(<Editor />);
      dragScene(container, [200, 150], [218, 150]);
      const edited = code();

      // The tree's search box owns z and y while it holds the focus. A press
      // in the scene prevents its own default, which cancels the focus change
      // that would otherwise have taken them back -- so the pane moves the
      // focus by hand, on both of the presses that prevent: one that takes
      // hold of the scene, and one on empty space that pans.
      const find = screen.getByRole('searchbox', { name: 'Find a node' });
      for (const [x, y] of [
        [200, 150],
        [30, 30],
      ]) {
        find.focus();

        expect(document.activeElement).toBe(find);

        // Two pixels, so the press lands without the drag writing anything.
        dragScene(container, [x!, y!], [x! + 2, y! + 1]);

        expect(document.activeElement).not.toBe(find);
      }

      fireEvent.keyDown(document.activeElement!, { key: 'z', ctrlKey: true });

      expect(code()).not.toBe(edited);
    } finally {
      pane.restore();
    }
  });

  test('the wheel zooms about the pointer, not about the pane', () => {
    const pane = paneOf400By300();
    try {
      const { container } = render(<Editor />);
      const svg = container.querySelector('.editor__scene svg')!;

      // The world origin is at the pane's middle, eighteen pixels to the unit.
      expect([drawnX(container, 0), drawnX(container, 1)]).toEqual([200, 218]);

      // x = 5 is drawn ninety pixels right of the origin. A notch in, taken
      // there, has to leave it there -- zooming about the pane's middle
      // instead would carry it outwards.
      fireEvent.wheel(svg, { deltaY: -320, clientX: 290, clientY: 150 });

      expect(drawnX(container, 5)).toBeCloseTo(290, 6);
      expect(drawnX(container, 1) - drawnX(container, 0)).toBeCloseTo(
        18 * Math.E,
        6,
      );
    } finally {
      pane.restore();
    }
  });

  test('dragging empty space moves the view, and nothing in the scene', () => {
    const pane = paneOf400By300();
    try {
      const { container } = render(<Editor />);
      const before = code();

      // The pane's top-left corner: no shape, and no frame's gizmo.
      dragScene(container, [30, 30], [70, 55]);

      expect(drawnX(container, 0)).toBeCloseTo(240, 6);
      expect(drawnY(container)).toBeCloseTo(175, 6);
      expect(code()).toBe(before);
    } finally {
      pane.restore();
    }
  });

  test('a click with a wobble in it is not a pan', () => {
    const pane = paneOf400By300();
    try {
      const { container } = render(<Editor />);

      select('Box');

      // Two pixels of slop, which is a click. Panning on that would swallow
      // the release, and a click on empty space is how the selection clears --
      // so the release's click is raised here, as a browser would.
      dragScene(container, [30, 30], [32, 31]);
      clickScene(container, [32, 31]);

      expect(drawnX(container, 0)).toBe(200);
      expect(control('Reset view')).toBeDisabled();
      expect(shown()).toBe(null);
    } finally {
      pane.restore();
    }
  });

  test('a pan leaves the selection alone rather than picking at its release', () => {
    const pane = paneOf400By300();
    try {
      const { container } = render(<Editor />);
      select('Box');

      expect(shown()).toBe('Box');

      dragScene(container, [30, 30], [70, 55]);

      // The click a browser raises when the press and its release land on one
      // element: without it this asserts nothing, since picking is what that
      // click does and a drag alone never raises one.
      clickScene(container, [70, 55]);

      expect(shown()).toBe('Box');
    } finally {
      pane.restore();
    }
  });

  test('Reset view says whether the view has moved, and returns it', () => {
    const pane = paneOf400By300();
    try {
      const { container } = render(<Editor />);
      const svg = container.querySelector('.editor__scene svg')!;

      expect(control('Reset view')).toBeDisabled();

      fireEvent.wheel(svg, { deltaY: -320, clientX: 290, clientY: 150 });

      expect(control('Reset view')).toBeEnabled();

      dragScene(container, [30, 30], [70, 55]);
      fireEvent.click(control('Reset view'));

      expect([drawnX(container, 0), drawnX(container, 1)]).toEqual([200, 218]);
      expect(drawnY(container)).toBe(150);
      expect(control('Reset view')).toBeDisabled();
    } finally {
      pane.restore();
    }
  });

  test('the same gesture reaches the same node once the view has moved', () => {
    const pane = paneOf400By300();
    try {
      const { container } = render(<Editor />);

      // Everything that decides a press -- the gizmos, the hits, the snap
      // points, the parent's axes a drag writes along -- reads the one view
      // transform, so moving the view must change which pixels a gesture is
      // aimed at and nothing else about it.
      dragScene(container, [200, 150], [218, 150]);
      const unpanned = code();

      expect(unpanned).toMatch(/position=\{\[1, -0\.5\]\}/);

      fireEvent.click(undoButton());
      dragScene(container, [30, 30], [66, 30]);

      expect(drawnX(container, 0)).toBeCloseTo(236, 6);

      // The same drag, thirty-six pixels along, where the pan put it.
      dragScene(container, [236, 150], [254, 150]);

      expect(code()).toBe(unpanned);
    } finally {
      pane.restore();
    }
  });
});
