import CartAndRope, { CART_FRAME_ID } from './CartAndRope';
import Scene from './react/Scene';
import { render } from '@testing-library/react';
import type CoreScene from './Scene';
import type { CoincidenceConstraint } from './Constraint';

/**
 * The rig, assembled.
 *
 * Wrapped in an `<svg>` and read out of `onSceneChange` because `<Scene>`
 * assembles and draws together, and assembly takes a second render -- see
 * `docs/issues/0006.md`.
 */
function assemble(): CoreScene {
  let scene: CoreScene | null = null;
  render(
    <svg>
      <Scene onSceneChange={(built) => (scene = built)}>
        <CartAndRope />
      </Scene>
    </svg>,
  );
  if (!scene) {
    throw new Error('the rig assembled no scene');
  }

  return scene;
}

describe('CartAndRope', () => {
  test('assembles the rig the demo is meant to show', () => {
    // The rewrite from imperative constructors to JSX had to preserve every one
    // of these, and none of them is visible from the rendered picture alone --
    // a wrong mass or a dropped weight simulates differently and draws the same.
    const scene = assemble();

    // Eleven frames: the cart, and five links in each of two chains.
    expect(scene.sortedFrames).toHaveLength(11);

    // The ground line is the scene's own decal; everything else hangs off a
    // frame.
    expect(scene.decals).toHaveLength(1);

    const cart = scene.frameMap.get(CART_FRAME_ID);

    expect(cart).toBeDefined();
    expect(cart!.weights.map((weight) => weight.mass)).toEqual([250, 30, 30]);
    expect(cart!.resistance).toBe(5);

    // Box, two pole lines, two caps -- in that order, which is JSX order.
    expect(cart!.decals).toHaveLength(5);
    expect(cart!.frames).toHaveLength(2);
  });

  test('hangs each chain on a shared arc, mirrored', () => {
    // The arc is what keeps the initial shape exact rather than eyeballed, and
    // the mirroring rule differs between the first link and the rest: an
    // absolute angle reflects as `π − φ`, while the relative turns that follow
    // are differences of absolute angles, so for them it is a negation.
    const scene = assemble();
    const [left, right] = scene.frameMap.get(CART_FRAME_ID)!.frames;

    expect(left!.initialState[0]).toBeCloseTo(-1.15, 9);
    expect(right!.initialState[0]).toBeCloseTo(Math.PI + 1.15, 9);

    const turn = 1.15 / 4;
    let leftLink = left!;
    let rightLink = right!;
    for (let depth = 1; depth < 5; depth++) {
      leftLink = leftLink.frames[0]!;
      rightLink = rightLink.frames[0]!;
      expect(leftLink.initialState[0]).toBeCloseTo(turn, 9);
      expect(rightLink.initialState[0]).toBeCloseTo(-turn, 9);
    }

    // ...and the chains end there: five links, not four or six.
    expect(leftLink.frames).toHaveLength(0);
    expect(rightLink.frames).toHaveLength(0);
  });

  test('gives every link its mass, drag and resistance', () => {
    // The part that draws identically whatever it is. A link with no weight
    // renders exactly like one that has it, and simulates like a massless rope
    // -- so this is the assertion standing between a correct rig and a picture
    // of one.
    const scene = assemble();
    const links = scene.sortedFrames.filter(
      (frame) => frame.id !== CART_FRAME_ID,
    );

    expect(links).toHaveLength(10);
    for (const link of links) {
      expect(link.weights).toHaveLength(1);
      expect(link.weights[0]!.mass).toBe(2);
      expect(link.weights[0]!.drag).toBe(6);
      expect([...link.weights[0]!.position].slice(0, 2)).toEqual([1.4, 0]);
      expect(link.resistance).toBe(1.5);

      // A line to the next hinge and a bob at it.
      expect(link.decals).toHaveLength(2);
    }
  });

  test('closes the rope loop by solving where the chains attach', () => {
    // The failure this is really for: an unresolved anchor does not throw, it
    // warns and leaves the scene assembled with the loop *open*. Eleven frames,
    // a rendered picture, and a rope that is not a rope.
    const scene = assemble();

    expect(scene.constraints).toHaveLength(1);

    const loop = scene.constraints[0] as CoincidenceConstraint;

    // The left chain's tip is stated; the right attachment is solved, which is
    // what lets the pole positions stay round numbers that do not make the two
    // chains meet.
    expect([...loop.localPosition1].slice(0, 2)).toEqual([1.4, 0]);
    expect(loop.inferPosition2).toBe(true);

    // Solved to something that is not the tip it would have defaulted to --
    // which is the whole difference between the loop closing and both chains
    // being welded to their own ends.
    expect(loop.localPosition2[0]).not.toBeCloseTo(1.4, 3);

    // And it closes.
    expect(
      scene.getSeparation(
        loop.frameId1,
        [1.4, 0],
        loop.frameId2,
        loop.localPosition2,
      ).distance,
    ).toBeCloseTo(0, 9);
  });
});
