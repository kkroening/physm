import CartAndRope, { ARC, CART_FRAME_ID, RIG } from './CartAndRope';
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

    // The cart, both chains, and the pendulum hung from where they meet.
    expect(scene.sortedFrames).toHaveLength(2 * RIG.segmentCount + 2);

    // The ground line is the scene's own decal; everything else hangs off a
    // frame.
    expect(scene.decals).toHaveLength(1);

    const cart = scene.frameMap.get(CART_FRAME_ID);

    expect(cart).toBeDefined();
    expect(cart!.weights.map((weight) => weight.mass)).toEqual([
      RIG.cartMass,
      RIG.poleMass,
      RIG.poleMass,
    ]);
    expect(cart!.resistance).toBe(RIG.cartResistance);

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

    expect(left!.initialState[0]).toBeCloseTo(-ARC.sweep, 9);
    expect(right!.initialState[0]).toBeCloseTo(Math.PI + ARC.sweep, 9);

    const turn = ARC.turn;
    let leftLink = left!;
    let rightLink = right!;
    for (let depth = 1; depth < RIG.segmentCount; depth++) {
      leftLink = leftLink.frames[0]!;
      rightLink = rightLink.frames[0]!;
      expect(leftLink.initialState[0]).toBeCloseTo(turn, 9);
      expect(rightLink.initialState[0]).toBeCloseTo(-turn, 9);
    }

    // ...and the right chain ends there. The left one carries the pendulum, so
    // its tip has a child -- which is the one asymmetry in the rig.
    expect(rightLink.frames).toHaveLength(0);
    expect(leftLink.frames).toHaveLength(1);
  });

  test('gives every link its mass, drag and resistance', () => {
    // The part that draws identically whatever it is. A link with no weight
    // renders exactly like one that has it, and simulates like a massless rope
    // -- so this is the assertion standing between a correct rig and a picture
    // of one.
    const scene = assemble();
    const links = scene.sortedFrames.filter(
      (frame) =>
        frame.id !== CART_FRAME_ID &&
        frame.resistance === RIG.segmentResistance,
    );

    expect(links).toHaveLength(2 * RIG.segmentCount);
    for (const link of links) {
      expect(link.weights).toHaveLength(1);
      expect(link.weights[0]!.mass).toBe(RIG.segmentMass);
      expect(link.weights[0]!.drag).toBe(RIG.segmentDrag);
      expect([...link.weights[0]!.position].slice(0, 2)).toEqual([
        RIG.segmentLength,
        0,
      ]);

      // A line to the next hinge and a bob at it.
      expect(link.decals).toHaveLength(2);
    }
  });

  test('hangs the pendulum from the point where the chains meet', () => {
    // A rigid rod on a free swivel, so rod and ball are one frame with one
    // coordinate -- not two frames, which is what "rigid" means here.
    const scene = assemble();
    const loop = scene.constraints[0] as CoincidenceConstraint;

    // It hangs off whichever chain tip the constraint names first, which *is*
    // the rope's midpoint: the constraint welds the two tips into one point.
    const tip = scene.frameMap.get(loop.frameId1)!;

    expect(tip.frames).toHaveLength(1);

    const pendulum = tip.frames[0]!;

    // Hinged at the tip, not at the tip frame's own origin.
    expect([...pendulum.position].slice(0, 2)).toEqual([RIG.segmentLength, 0]);

    // One weight at the far end of the rod, and the rod and ball drawn.
    expect(pendulum.weights).toHaveLength(1);
    expect(pendulum.decals).toHaveLength(2);
    expect(pendulum.frames).toHaveLength(0);

    const ball = pendulum.weights[0]!;

    expect(ball.mass).toBeGreaterThan(0);

    // On the rod, not at the hinge -- which is the difference between a
    // pendulum and a heavier joint.
    expect(ball.position[0]).toBeGreaterThan(0);

    // Deliberately no bound on the mass. A heavy ball does pull the chains
    // toward collinear, which is the kinematic singularity the arc exists to
    // avoid -- measured, five times a link's mass took the chain's curvature to
    // under half what the arc lays down. But that is a tuning trade-off for
    // whoever is looking at the picture, not an invariant, and a test asserting
    // a ceiling would be this file having an opinion about the demo's looks.
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
    expect([...loop.localPosition1].slice(0, 2)).toEqual([
      RIG.segmentLength,
      0,
    ]);
    expect(loop.inferPosition2).toBe(true);

    // Where it lands is not asserted: it is whatever the pose puts it at, and
    // with some tunings that is very near the right chain's own tip -- 1.3999
    // against a segment length of 1.4, at the geometry this was written
    // against. That closeness is a coincidence of the numbers rather than a
    // property, so pinning it would fail the next time the poles move.
    //
    // What matters is that it *closes*, which it does whatever the geometry:
    expect(
      scene.getSeparation(
        loop.frameId1,
        [RIG.segmentLength, 0],
        loop.frameId2,
        loop.localPosition2,
      ).distance,
    ).toBeCloseTo(0, 9);
  });
});
