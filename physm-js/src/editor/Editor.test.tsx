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
import { InvalidStateMapError } from './../Solver';
import { documentFrom, nodesFrom } from './sceneDocument';
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

    // The cart, and the pendulum's pivot: the tree's one frame, and the one
    // inside the component it uses.
    expect(start).toHaveLength(2);

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
): void {
  fireEvent.click(container.querySelector('.editor__scene svg')!, {
    clientX: x,
    clientY: y,
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

    // Just above the pivot: its gizmo and the pendulum's rod, the cart's gizmo
    // and box, and the ground. The pivot and the rod are one node here.
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
      'TrackFrame',
      'Box',
      'Line',
      'Pendulum',
    ]);
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

    // The bob is drawn where it was, over the end of the rod.
    expect(shown()).toBe('Circle');
  });

  test("on a component's tab, a click selects in that component's body", () => {
    const { container } = render(<Editor />);
    fireEvent.doubleClick(
      within(screen.getByRole('tree', { name: 'Scene' })).getByText('Pendulum'),
    );
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

  test('a drag goes where the pointer goes, to the nearest hundredth', () => {
    const { container } = render(<Editor />);
    dragScene(container, onCart, [7, -3]);

    expect(code()).toContain('position={[0.39, 0]}');
  });

  test("a frame inside a component's instance does not drag, and says so", () => {
    const { container } = render(<Editor />);
    const before = code();
    const svg = container.querySelector<SVGSVGElement>('.editor__scene svg')!;

    // Just below the pivot, whose frame the pendulum's own body builds.
    fireEvent.mouseMove(svg, { clientX: 0, clientY: 12 });

    expect(svg.style.cursor).toBe('not-allowed');

    fireEvent.mouseMove(svg, { clientX: onCart[0], clientY: onCart[1] });

    expect(svg.style.cursor).toBe('grab');

    fireEvent.mouseMove(svg, { clientX: 300, clientY: -300 });

    expect(svg.style.cursor).toBe('');

    dragScene(container, [0, 12], [18, 12]);

    expect(code()).toBe(before);

    // Just above the pivot, the cart's gizmo lies under the pivot's. The pivot
    // is on top, so it blocks the press, as a click there selects the pendulum.
    fireEvent.mouseMove(svg, { clientX: 0, clientY: 8 });

    expect(svg.style.cursor).toBe('not-allowed');

    dragScene(container, [0, 8], [18, 8]);

    expect(code()).toBe(before);
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
});
