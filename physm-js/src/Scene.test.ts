import * as vec3 from './Vec3';
import { faker } from '@faker-js/faker';
import Frame from './Frame';
import RotationalFrame from './RotationalFrame';
import Scene from './Scene';
import type { StateMap } from './Frame';
import TrackFrame from './TrackFrame';
import { DEFAULT_GRAVITY } from './Scene';

describe('Scene queries', () => {
  // `TrackFrame` and `RotationalFrame`, not the base `Frame`, whose
  // `getLocalPosMatrix` returns the identity regardless of `q` *and* of
  // `position` -- a scene built from those would make every assertion here
  // hold whatever the implementation did.
  //
  // `root` also carries a non-zero `initialState`, so the two candidate
  // fallbacks for an absent frame -- its authored coordinate, or zero -- give
  // different answers. That is the difference these tests exist to pin.
  const build = () =>
    new Scene({
      frames: [
        new TrackFrame({
          id: 'root',
          initialState: [7, 0],
          frames: [new RotationalFrame({ id: 'child', position: [3, 4] })],
        }),
      ],
    });

  test('the queries reject a frame id the scene does not contain', () => {
    // This also asserted that no tensor was orphaned on these paths, which was
    // a live concern when a pose map was an owned resource -- it caught two
    // real leaks. Nothing is owned now: the queries return plain tuples, so
    // only the rejection is left to pin.
    const scene = build();

    expect(scene.getWorldPosition('child', [1, 2])).toHaveLength(2);
    expect(scene.getLocalPosition('child', [1, 2])).toHaveLength(2);
    expect(
      scene.getSeparation('root', [0, 0], 'child', [1, 2]).distance,
    ).toBeGreaterThan(0);

    expect(() => scene.getWorldPosition('nope')).toThrow(/No such frame/);
    expect(() => scene.getLocalPosition('nope')).toThrow(/No such frame/);
    expect(() => scene.getSeparation('root', [0, 0], 'nope')).toThrow(
      /No such frame/,
    );
  });

  test('getSeparation measures frame origins when given two ids', () => {
    // The two-id overload is the ergonomic probe an interactive scene builder
    // wants -- "how far apart are these two frames?" should not require naming
    // two origins. Every other call site in the tree uses the four-argument
    // form, so without this the branch the overload exists to add is never
    // executed.
    const scene = build();

    expect(scene.getSeparation('root', 'child')).toEqual(
      scene.getSeparation('root', vec3.ORIGIN, 'child', vec3.ORIGIN),
    );

    // The options argument sits in a different position in the two forms, so
    // it is worth proving it still lands. That needs a scene whose separation
    // the state map can actually change: only a prismatic coordinate moves a
    // frame's own origin, and `child` rides `root`, so posing either leaves
    // this pair exactly where it was.
    const sliders = new Scene({
      frames: [
        new TrackFrame({ id: 'a' }),
        new TrackFrame({ id: 'b', position: [10, 0] }),
      ],
    });
    const posed: StateMap = new Map([['b', [4, 0]]]);

    expect(sliders.getSeparation('a', 'b', { stateMap: posed })).toEqual(
      sliders.getSeparation('a', vec3.ORIGIN, 'b', vec3.ORIGIN, {
        stateMap: posed,
      }),
    );

    // ...and that it is not simply being ignored by both.
    expect(sliders.getSeparation('a', 'b').distance).toBeCloseTo(10, 9);
    expect(
      sliders.getSeparation('a', 'b', { stateMap: posed }).distance,
    ).toBeCloseTo(14, 9);
  });

  test('getSeparation requires its second frame at compile time', () => {
    // Not a runtime assertion -- the assertion is that this file compiles.
    // `@ts-expect-error` fails the build if the error ever stops being an
    // error, which turns a one-off manual check into a standing one.
    //
    // It is the bug the overload pair replaced: a defaulted `frameId2` made the
    // parameter optional to the compiler, leaving a runtime sentinel as the
    // only thing requiring it.
    //
    // The runtime throw is named rather than merely allowed, because it is
    // *incidental*: with one argument `frameId2` binds to `undefined`, and the
    // complaint comes from the id-validation loop finding no such frame -- not
    // from any arity check. Spelling that out is what stops a later tidy-up of
    // that loop from failing here for a reason nobody can place. The call
    // cannot simply be left unasserted: it throws, and an uncaught throw fails
    // the test whatever the directive above says.
    const scene = build();

    // @ts-expect-error -- one id is not a valid call
    expect(() => scene.getSeparation('root')).toThrow(/No such frame/);
  });

  test('getLocalPosition inverts getWorldPosition', () => {
    // A round trip through a real rotation *and* a real translation: `child` is
    // a `RotationalFrame` offset from a `TrackFrame` displaced by 7, so an
    // implementation that returned its argument would fail here.
    const scene = build();
    scene.frameMap.get('child')!.initialState = [0.9, 0];
    const local = [1.5, -2.25];
    const world = scene.getWorldPosition('child', local);
    expect(world[0]).not.toBeCloseTo(local[0], 2);
    expect(scene.getLocalPosition('child', world)).toEqual([
      expect.closeTo(local[0], 4),
      expect.closeTo(local[1], 4),
    ]);
  });

  test('an omitted state map and an empty one agree', () => {
    // The two fallbacks have to be the same fallback: a frame nobody mentioned
    // is read at its own `initialState`, whether the map is empty or absent.
    // `root` is the frame nobody mentions, and its authored 7 is what a
    // zero-coordinate fallback would silently discard.
    const scene = build();
    const omitted = scene.getWorldPosition('child', [1, 2]);
    expect(
      scene.getWorldPosition('child', [1, 2], { stateMap: new Map() }),
    ).toEqual(omitted);
    expect(
      scene.getWorldPosition('child', [1, 2], {
        stateMap: new Map([['child', [0, 0]]]),
      }),
    ).toEqual(omitted);
    // ...and the authored 7 is actually in the answer, so the assertions above
    // are not two ways of reading the same zero.
    expect(omitted[0]).toBeCloseTo(7 + 3 + 1, 4);
  });
});

describe('Scene class', () => {
  test('constructor with default arguments', () => {
    const scene = new Scene();
    expect(scene.decals).toEqual([]);
    expect(scene.frames).toEqual([]);
    expect(scene.springs).toEqual([]);
    expect(scene.constraints).toEqual([]);
    expect(scene.gravity).toEqual(DEFAULT_GRAVITY);
    expect(scene.sortedFrames).toEqual([]);
    expect(scene.frameMap).toEqual(new Map());
    expect(scene.frameIdParentMap).toEqual(new Map());
    expect(scene.frameIdPathMap).toEqual(new Map());
  });

  test('constructor with scene analysis', () => {
    let frame0;
    let frame1;
    let frame2;
    let frame3;
    const scene = (() => {
      frame3 = new Frame({ id: 'frame3' });
      frame2 = new Frame({ id: 'frame2' });
      frame1 = new Frame({ id: 'frame1', frames: [frame3, frame2] });
      frame0 = new Frame({ id: 'frame0', frames: [frame1] });
      return new Scene({
        frames: [frame0],
      });
    })();
    expect(scene.decals).toEqual([]);
    expect(scene.frames).toEqual([frame0]);
    expect(scene.springs).toEqual([]);
    expect(scene.constraints).toEqual([]);
    expect(scene.gravity).toEqual(DEFAULT_GRAVITY);
    expect(scene.sortedFrames).toEqual([frame0, frame1, frame2, frame3]);
    expect(scene.frameMap).toEqual(
      new Map([
        [frame0.id, frame0],
        [frame1.id, frame1],
        [frame2.id, frame2],
        [frame3.id, frame3],
      ]),
    );
    expect(scene.frameIdParentMap).toEqual(
      new Map([
        [frame0.id, null],
        [frame1.id, frame0.id],
        [frame2.id, frame1.id],
        [frame3.id, frame1.id],
      ]),
    );
    expect(scene.frameIdPathMap).toEqual(
      new Map([
        [frame0.id, [frame0.id]],
        [frame1.id, [frame0.id, frame1.id]],
        [frame2.id, [frame0.id, frame1.id, frame2.id]],
        [frame3.id, [frame0.id, frame1.id, frame3.id]],
      ]),
    );
  });

  test('.getInitialStateMap method', () => {
    const generateState = () => [
      faker.number.int(99999),
      faker.number.int(99999),
    ];
    const frame1 = new Frame({
      id: 'frame1',
      initialState: generateState(),
    });
    const frame0 = new Frame({
      id: 'frame0',
      initialState: generateState(),
      frames: [frame1],
    });
    const scene = new Scene({
      frames: [frame0],
    });
    expect(scene.getInitialStateMap()).toEqual(
      new Map([
        [frame0.id, frame0.initialState],
        [frame1.id, frame1.initialState],
      ]),
    );
  });

  test('.toJsonObj method', () => {
    const scene = new Scene({ frames: [new Frame({ id: 'd34db33f' })] });
    const obj = scene.toJsonObj();
    expect(obj).toEqual({
      gravity: scene.gravity,
      frames: [
        {
          id: scene.frames[0].id,
          initialState: [0, 0],
          position: [0, 0],
          weights: [],
          frames: [],
          type: 'Frame',
          resistance: 0,
        },
      ],
    });
    expect(JSON.stringify(obj)).toEqual(
      '{"frames":[{"frames":[],"id":"d34db33f","initialState":[0,0],"position":[0,0],"resistance":0,"type":"Frame","weights":[]}],"gravity":10}',
    );
  });
});
