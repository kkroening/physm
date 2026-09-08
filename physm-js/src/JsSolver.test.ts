import * as mat3 from './Mat3';
import * as vec3 from './Vec3';
import JsSolver from './JsSolver';
import type { FrameId } from './Frame';
import RotationalFrame from './RotationalFrame';
import Scene from './Scene';
import TrackFrame from './TrackFrame';
import Weight from './Weight';

/**
 * The sweeps of `docs/algorithm.md` §4, checked against expressions written out
 * from the frames' own local transforms.
 *
 * Deliberately not written against the same recurrences the solver uses: an
 * expectation derived the same way as the implementation agrees with it for the
 * same reason, wrong or right. These compose `getLocalPosMatrix` and friends by
 * hand instead.
 */
describe('JsSolver', () => {
  const scene = new Scene({
    frames: [
      new TrackFrame({
        id: 'cart',
        initialState: [5, 1],
        weights: [new Weight(20), new Weight(3, { position: [0, 5] })],
        frames: [
          new RotationalFrame({
            id: 'pendulum1',
            initialState: [0.3, -1.2],
            weights: [new Weight(5, { position: [10, 0] })],
            frames: [
              new RotationalFrame({
                id: 'pendulum2',
                initialState: [-0.9, 1.8],
                position: [10, 0],
                weights: [new Weight(8, { position: [12, 0] })],
              }),
            ],
          }),
        ],
      }),
      new TrackFrame({
        id: 'ball',
        initialState: [0, -2],
        position: [30, 0],
        angle: Math.PI / 4,
        weights: [new Weight(5)],
      }),
    ],
  });

  const frameOf = (id: FrameId) => scene.frameMap.get(id)!;
  const stateMap = scene.getInitialStateMap();
  const q = (id: FrameId) => stateMap.get(id)![0];
  const qd = (id: FrameId) => stateMap.get(id)![1];
  const solver = new JsSolver(scene);

  const posMatMap = solver._getPosMatMap(stateMap);
  const invPosMatMap = solver._getInvPosMatMap(posMatMap);
  const velMatMap = solver._getVelMatMap(posMatMap, invPosMatMap, stateMap);
  const accelMatMap = solver._getAccelMatMap(posMatMap, invPosMatMap, stateMap);
  const velSumMatMap = solver._getVelSumMatMap(posMatMap, velMatMap, stateMap);
  const weightPosMap = solver._getWeightPosMap(posMatMap);

  /** `L_a L_b ...`, the product along a root path. */
  const composePoses = (...ids: FrameId[]) =>
    ids
      .map((id) => frameOf(id).getLocalPosMatrix(q(id)))
      .reduce((product, local) => mat3.multiply(product, local));

  test('the pose is the product of local transforms along the root path', () => {
    expect([...posMatMap.keys()].sort()).toEqual(
      ['ball', 'cart', 'pendulum1', 'pendulum2'].sort(),
    );

    expect(mat3.equals(posMatMap.get('cart')!, composePoses('cart'))).toBe(true);
    expect(
      mat3.equals(posMatMap.get('pendulum1')!, composePoses('cart', 'pendulum1')),
    ).toBe(true);
    expect(
      mat3.equals(
        posMatMap.get('pendulum2')!,
        composePoses('cart', 'pendulum1', 'pendulum2'),
      ),
    ).toBe(true);

    // `ball` is a root, so its pose is its own transform and nothing else.
    expect(mat3.equals(posMatMap.get('ball')!, composePoses('ball'))).toBe(true);
  });

  test('the inverse pose undoes the pose', () => {
    scene.sortedFrames.forEach((frame) =>
      expect(
        mat3.equals(
          mat3.multiply(posMatMap.get(frame.id)!, invPosMatMap.get(frame.id)!),
          mat3.IDENTITY,
        ),
      ).toBe(true),
    );
  });

  test('the velocity matrix is the parent pose, the local rate, and the inverse', () => {
    // `V_i = M_p (∂L_i/∂q) M_i⁻¹`, which is what makes it *spatial* -- it acts
    // on a world point rather than a local one.
    const expected = (id: FrameId, parentIds: FrameId[]) =>
      mat3.multiply(
        mat3.multiply(
          parentIds.length ? composePoses(...parentIds) : mat3.IDENTITY,
          frameOf(id).getLocalVelMatrix(q(id)),
        ),
        invPosMatMap.get(id)!,
      );

    expect(mat3.equals(velMatMap.get('cart')!, expected('cart', []))).toBe(true);
    expect(
      mat3.equals(velMatMap.get('pendulum1')!, expected('pendulum1', ['cart'])),
    ).toBe(true);
    expect(
      mat3.equals(
        velMatMap.get('pendulum2')!,
        expected('pendulum2', ['cart', 'pendulum1']),
      ),
    ).toBe(true);
  });

  test('the acceleration matrix has the same shape, one derivative up', () => {
    const expected = (id: FrameId, parentIds: FrameId[]) =>
      mat3.multiply(
        mat3.multiply(
          parentIds.length ? composePoses(...parentIds) : mat3.IDENTITY,
          frameOf(id).getLocalAccelMatrix(q(id)),
        ),
        invPosMatMap.get(id)!,
      );

    expect(mat3.equals(accelMatMap.get('cart')!, expected('cart', []))).toBe(
      true,
    );
    expect(
      mat3.equals(
        accelMatMap.get('pendulum2')!,
        expected('pendulum2', ['cart', 'pendulum1']),
      ),
    ).toBe(true);
  });

  test('the twist accumulates qd-weighted velocity matrices down the path', () => {
    // `S_i = Σ_{k ⪯ i} qd_k V_k`, summed over the inclusive ancestors.
    const sumOver = (...ids: FrameId[]) =>
      ids
        .map((id) => mat3.scale(velMatMap.get(id)!, qd(id)))
        .reduce((total, term) => mat3.add(total, term));

    expect(mat3.equals(velSumMatMap.get('cart')!, sumOver('cart'))).toBe(true);
    expect(
      mat3.equals(velSumMatMap.get('pendulum1')!, sumOver('cart', 'pendulum1')),
    ).toBe(true);
    expect(
      mat3.equals(
        velSumMatMap.get('pendulum2')!,
        sumOver('cart', 'pendulum1', 'pendulum2'),
      ),
    ).toBe(true);
  });

  test('weight positions are the frame pose applied to each local position', () => {
    scene.sortedFrames.forEach((frame) => {
      expect(weightPosMap.get(frame.id)!).toHaveLength(frame.weights.length);

      frame.weights.forEach((weight, index) =>
        expect(weightPosMap.get(frame.id)![index]).toEqual(
          mat3.apply(posMatMap.get(frame.id)!, weight.position),
        ),
      );
    });

    // Spot-checked against the geometry rather than only against the sweep:
    // the cart slides 5 along +x, so its first weight sits there.
    expect(vec3.toPlanar(weightPosMap.get('cart')![0])).toEqual([5, 0]);
  });

  test('ancestry is reflexive, and runs only downward', () => {
    expect(solver._isFrameDescendent(frameOf('cart'), frameOf('cart'))).toBe(
      true,
    );
    expect(
      solver._isFrameDescendent(frameOf('pendulum2'), frameOf('cart')),
    ).toBe(true);
    expect(
      solver._isFrameDescendent(frameOf('cart'), frameOf('pendulum2')),
    ).toBe(false);
    expect(solver._isFrameDescendent(frameOf('ball'), frameOf('cart'))).toBe(
      false,
    );
  });

  test('the mass matrix is symmetric, and zero between incomparable frames', () => {
    // Branch-induced sparsity: `ball` shares no weight with the cart's subtree,
    // so nothing couples them.
    const massMatrix = solver._getCoefficientMatrix(stateMap);
    const index = Object.fromEntries(
      scene.sortedFrames.map((frame, i) => [frame.id, i]),
    );

    expect(massMatrix[index.ball][index.cart]).toBe(0);
    expect(massMatrix[index.cart][index.ball]).toBe(0);

    scene.sortedFrames.forEach((_a, row) =>
      scene.sortedFrames.forEach((_b, col) =>
        expect(massMatrix[row][col]).toBeCloseTo(massMatrix[col][row], 9),
      ),
    );

    // The cart's subtree is coupled throughout, so none of those entries is zero.
    ['cart', 'pendulum1', 'pendulum2'].forEach((a) =>
      ['cart', 'pendulum1', 'pendulum2'].forEach((b) =>
        expect(massMatrix[index[a]][index[b]]).not.toBeCloseTo(0, 6),
      ),
    );
  });

  test('a diagonal mass entry is the weighted norm of the velocity it produces', () => {
    // `g_ii = Σ_w m_w ‖V_i x_w‖²`, which is why it is positive whenever the
    // coordinate moves any mass at all.
    const massMatrix = solver._getCoefficientMatrix(stateMap);
    const ballIndex = scene.sortedFrames.findIndex(
      (frame) => frame.id === 'ball',
    );
    const velocity = mat3.apply(
      velMatMap.get('ball')!,
      weightPosMap.get('ball')![0],
    );

    expect(massMatrix[ballIndex][ballIndex]).toBeCloseTo(
      frameOf('ball').weights[0].mass * vec3.dot(velocity, velocity),
      9,
    );
  });

  test('the system is square, and sized by the coordinate count', () => {
    const [array, vector] = solver._getSystemOfEquations(stateMap, new Map());

    expect(array).toHaveLength(scene.sortedFrames.length);
    expect(array[0]).toHaveLength(scene.sortedFrames.length);
    expect(vector).toHaveLength(scene.sortedFrames.length);
    expect(vector.every(Number.isFinite)).toBe(true);
  });

  test('an external force reaches the coordinate it names, and only that one', () => {
    const withoutForce = solver._getSystemOfEquations(stateMap, new Map())[1];
    const withForce = solver._getSystemOfEquations(
      stateMap,
      new Map([['ball', 100]]),
    )[1];

    scene.sortedFrames.forEach((frame, index) =>
      expect(withForce[index] - withoutForce[index]).toBeCloseTo(
        frame.id === 'ball' ? 100 : 0,
        9,
      ),
    );
  });
});
