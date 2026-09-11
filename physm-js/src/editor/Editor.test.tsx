import Box from './../react/Box';
import Coincidence from './../react/Coincidence';
import Editor from './Editor';
import Line from './../react/Line';
import RotationalFrame from './../react/RotationalFrame';
import TrackFrame from './../react/TrackFrame';
import Weight from './../react/Weight';
import coreComponents from './../react/coreComponents';
import { documentFrom, nodesFrom } from './sceneDocument';
import { fireEvent, render, screen, within } from '@testing-library/react';
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

    expect(code()).toContain(`angle={${Math.PI / 2}}`);

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

    expect(code()).toContain(
      `initialState={[${Math.PI / 2}, ${90 / (180 / Math.PI)}]}`,
    );
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

    expect(code()).toMatch(/<Pendulum \/>\s*<Circle \/>\s*<\/TrackFrame>/);
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

    expect(code()).toMatch(/<Pendulum \/>\s*<Weight mass=\{50\} \/>/);
    expect(screen.getByRole('button', { name: 'Move down' })).toBeDisabled();

    // And from the keyboard.
    const tree = screen.getByRole('tree', { name: 'Scene' });
    fireEvent.keyDown(within(tree).getByText('Weight'), {
      key: 'ArrowUp',
      altKey: true,
    });

    expect(code()).toMatch(/<Weight mass=\{50\} \/>\s*<Pendulum \/>/);
  });

  test('from the keyboard, each press acts on the node it acted on before', () => {
    render(<Editor />);
    const tree = screen.getByRole('tree', { name: 'Scene' });
    const focusRow = (tag: string): void => {
      (
        within(tree).getByText(tag).closest('.editor__row') as HTMLElement
      ).focus();
    };
    const press = (key: string, altKey = false): void => {
      fireEvent.keyDown(document.activeElement!, { key, altKey });
    };

    // Focus a row once, then keep pressing wherever focus is, as a keyboard
    // does -- rows are keyed by position, so the row can change under it.
    focusRow('Pendulum');
    press('Enter');
    press('ArrowUp', true);
    press('ArrowUp', true);

    expect(code()).toMatch(/<Pendulum \/>\s*<Box width=\{2\} \/>\s*<Weight/);

    press('ArrowDown', true);

    expect(code()).toMatch(/<Box width=\{2\} \/>\s*<Pendulum \/>\s*<Weight/);

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

    // Defined above its user, and used where the box was.
    expect(code()).toMatch(
      /function Chassis\(\): ReactElement[\s\S]*<Box width=\{2\} \/>[\s\S]*export default function Scene/,
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

    expect(screen.getByRole('status')).toHaveTextContent(
      'already a building block',
    );
    expect(screen.getByRole('button', { name: 'Extract' })).toBeDisabled();

    fireEvent.change(name, { target: { value: 'Pendulum' } });

    expect(screen.getByRole('status')).toHaveTextContent('already a component');
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
