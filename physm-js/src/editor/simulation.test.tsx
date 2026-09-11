import Box from './../react/Box';
import RotationalFrame from './../react/RotationalFrame';
import TrackFrame from './../react/TrackFrame';
import Weight from './../react/Weight';
import buildScene from './../react/buildScene';
import { MAX_STEPS, STEP, carryOver, stepsFor } from './simulation';
import type CoreScene from './../Scene';
import type { ReactElement } from 'react';
import type { StateMap } from './../Frame';

describe('stepsFor', () => {
  test('carries the part of a step a frame did not use', () => {
    const first = stepsFor(2.5 * STEP, 0);

    expect(first.steps).toBe(2);
    expect(first.carry).toBeCloseTo(0.5 * STEP);
    expect(stepsFor(0.5 * STEP, first.carry).steps).toBe(1);
  });

  test('takes at most MAX_STEPS, and drops what a stall left over', () => {
    expect(stepsFor(10, 0)).toEqual({ steps: MAX_STEPS, carry: 0 });
    expect(stepsFor(-1, 0)).toEqual({ steps: 0, carry: 0 });
  });
});

describe('carryOver', () => {
  const rig = (boxWidth: number, poleId?: string): ReactElement => (
    <TrackFrame id="cart">
      <Box width={boxWidth} />
      <Weight mass={5} />
      <RotationalFrame {...(poleId === undefined ? {} : { id: poleId })}>
        <Weight mass={1} position={[1, 0]} />
      </RotationalFrame>
    </TrackFrame>
  );
  /** Every frame of `scene` part-way through a swing. */
  const moving = (scene: CoreScene): StateMap => {
    const state: StateMap = new Map();
    for (const id of scene.getInitialStateMap().keys()) {
      state.set(id, [0.7, 0.3]);
    }

    return state;
  };

  test('carries every frame over a prop edit', () => {
    const before = buildScene(rig(1));
    const after = buildScene(rig(2));
    const state = moving(before);

    expect(carryOver(before, state, after, after.getInitialStateMap())).toEqual(
      state,
    );
  });

  test('starts a frame over when an edit renamed it', () => {
    const before = buildScene(rig(1, 'pole'));
    const after = buildScene(rig(1, 'arm'));
    const carried = carryOver(
      before,
      moving(before),
      after,
      after.getInitialStateMap(),
    );

    expect(carried.get('cart')).toEqual([0.7, 0.3]);
    expect(carried.get('arm')).toEqual([0, 0]);
    expect(carried.has('pole')).toBe(false);
  });

  test('starts a frame over when its kind changed', () => {
    const before = buildScene(<TrackFrame id="joint" />);
    const after = buildScene(<RotationalFrame id="joint" />);

    expect(
      carryOver(before, moving(before), after, after.getInitialStateMap()).get(
        'joint',
      ),
    ).toEqual([0, 0]);
  });
});
