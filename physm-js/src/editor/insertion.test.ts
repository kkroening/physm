import Anchor from './../react/Anchor';
import Coincidence from './../react/Coincidence';
import Line from './../react/Line';
import TrackFrame from './../react/TrackFrame';
import Weight from './../react/Weight';
import starterDocument from './starterDocument';
import { extractComponent, removeNode } from './sceneDocument';
import { insertionPoint, newNode, refusalOf } from './insertion';
import type {
  ComponentRef,
  CoreComponent,
  SceneDocument,
} from './sceneDocument';

/** A building block, as a document refers to it. */
function core(component: unknown): ComponentRef {
  return { kind: 'core', component: component as CoreComponent };
}

/** An instance of a component the document defines. */
function defined(name: string): ComponentRef {
  return { kind: 'defined', name };
}

describe('insertionPoint', () => {
  // Scene: [Line, TrackFrame [Box, Weight, Pendulum]].
  const doc = starterDocument();

  test('with nothing selected, the end of the body', () => {
    expect(insertionPoint(doc, 'Scene', null)).toEqual({
      parent: [],
      index: 2,
      holder: 'root',
    });
  });

  test('with a frame selected, inside it after its last child', () => {
    expect(insertionPoint(doc, 'Scene', [1])).toEqual({
      parent: [1],
      index: 3,
      holder: 'frame',
    });
  });

  test('with anything else selected, just after it among its siblings', () => {
    expect(insertionPoint(doc, 'Scene', [1, 0])).toEqual({
      parent: [1],
      index: 1,
      holder: 'frame',
    });
    expect(insertionPoint(doc, 'Scene', [0])).toEqual({
      parent: [],
      index: 1,
      holder: 'root',
    });
  });
});

describe('refusalOf', () => {
  const doc = starterDocument();
  const atRoot = insertionPoint(doc, 'Scene', null);
  const inCart = insertionPoint(doc, 'Scene', [1]);

  test('refuses at the root what the builders refuse there', () => {
    expect(refusalOf(doc, 'Scene', atRoot, core(Weight))).toMatch(
      /Weight has to go inside a frame/,
    );
    expect(refusalOf(doc, 'Scene', atRoot, core(Anchor))).toMatch(
      /Anchor has to go inside a frame/,
    );
    expect(refusalOf(doc, 'Scene', atRoot, core(Line))).toBeNull();
    expect(refusalOf(doc, 'Scene', atRoot, core(Coincidence))).toBeNull();
    expect(refusalOf(doc, 'Scene', inCart, core(Weight))).toBeNull();
  });

  test('refuses a defined component inside itself', () => {
    const inPendulum = insertionPoint(doc, 'Pendulum', null);

    expect(refusalOf(doc, 'Pendulum', inPendulum, defined('Pendulum'))).toMatch(
      /Pendulum cannot go inside itself/,
    );
    expect(refusalOf(doc, 'Scene', inCart, defined('Pendulum'))).toBeNull();
  });

  test('refuses a defined component inside one it contains, at any depth', () => {
    const instance = (name: string) => ({
      type: defined(name),
      props: {},
      children: [],
    });
    // A contains B, which contains C: A inside C would recurse through both.
    const chain: SceneDocument = {
      root: 'A',
      definitions: [
        { name: 'A', body: [instance('B')] },
        { name: 'B', body: [instance('C')] },
        { name: 'C', body: [] },
      ],
    };

    expect(
      refusalOf(chain, 'C', insertionPoint(chain, 'C', null), defined('A')),
    ).toMatch(/A cannot go inside C, which it contains/);
    expect(
      refusalOf(chain, 'A', insertionPoint(chain, 'A', null), defined('C')),
    ).toBeNull();
  });
});

describe('refusalOf, for ids', () => {
  test('refuses a second instance of a component that names ids', () => {
    // Ids are scene-wide, so a second instance would repeat them.
    const doc = extractComponent(starterDocument(), 'Scene', [1], 'Cart');
    const atRoot = insertionPoint(doc, 'Scene', null);

    expect(refusalOf(doc, 'Scene', atRoot, defined('Cart'))).toMatch(
      /Cart names 'cart', and ids are scene-wide/,
    );
    // Pendulum, now inside Cart, names none.
    expect(refusalOf(doc, 'Scene', atRoot, defined('Pendulum'))).toBeNull();

    // The first instance is fine: nothing is repeated yet.
    const unused = removeNode(doc, 'Scene', [1]);

    expect(
      refusalOf(
        unused,
        'Scene',
        insertionPoint(unused, 'Scene', null),
        defined('Cart'),
      ),
    ).toBeNull();
  });
});

describe('refusalOf, for ids already in use', () => {
  test('refuses even a first instance whose ids the scene already uses', () => {
    const frame = (id: string) => ({
      type: core(TrackFrame),
      props: { id },
      children: [],
    });
    const doc: SceneDocument = {
      root: 'Scene',
      definitions: [
        { name: 'Scene', body: [frame('cart')] },
        // Never instantiated, but its `cart` would meet the scene's.
        { name: 'Arm', body: [frame('cart')] },
        { name: 'Spare', body: [frame('spare')] },
      ],
    };
    const atRoot = insertionPoint(doc, 'Scene', null);

    expect(refusalOf(doc, 'Scene', atRoot, defined('Arm'))).toMatch(
      /Arm names 'cart', which the scene already uses/,
    );
    expect(refusalOf(doc, 'Scene', atRoot, defined('Spare'))).toBeNull();
  });
});

describe('newNode', () => {
  test('starts required props at their initial values, and nothing else', () => {
    expect(newNode(core(Weight)).props).toEqual({ mass: 1 });
    expect(newNode(core(Line)).props).toEqual({ endPos: [1, 0] });
    // Which two things a constraint joins is the person's to pick.
    expect(newNode(core(Coincidence)).props).toStrictEqual({});
    expect(newNode(defined('Pendulum'))).toEqual({
      type: defined('Pendulum'),
      props: {},
      children: [],
    });
  });
});
