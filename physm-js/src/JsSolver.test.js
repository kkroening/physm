import * as tf from './tfjs';
import faker from 'faker';
import Frame from './Frame';
import JsSolver from './JsSolver';
import RotationalFrame from './RotationalFrame';
import RsSolver from './RsSolver';
import Scene from './Scene';
import TrackFrame from './TrackFrame';
import Weight from './Weight';
import { areTensorsEqual } from './testutils';
import { checkTfMemory } from './testutils';
import { getRotationTranslationMatrix } from './utils';
import { getTranslationMatrix } from './utils';
import { invertXformMatrix } from './utils';

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
const numFrames = scene.sortedFrames.length;
const frames = {
  ball: scene.frameMap.get('ball'),
  cart: scene.frameMap.get('cart'),
  pendulum1: scene.frameMap.get('pendulum1'),
  pendulum2: scene.frameMap.get('pendulum2'),
};
const frameIndexes = Object.fromEntries(
  scene.sortedFrames.map((frame, index) => [frame.id, index]),
);
const initialStateMap = scene.getInitialStateMap();
const externalForceMap = new Map();

describe('JsSolver', () => {
  const solver = new JsSolver(scene);
  const stateMap = initialStateMap;
  const posMatMap = checkTfMemory(() => solver._getPosMatMap(stateMap));

  test('._getPosMatMap method', () => {
    expect([...posMatMap.keys()]).toEqual(Object.keys(frames));
    expect(
      areTensorsEqual(
        posMatMap.get('cart'),
        getTranslationMatrix([frames.cart.initialState[0], 0]),
      ),
    ).toBe(true);
    expect(
      areTensorsEqual(
        posMatMap.get('pendulum1'),
        getRotationTranslationMatrix(frames.pendulum1.initialState[0], [
          frames.cart.initialState[0],
          0,
        ]),
      ),
    ).toBe(true);
    expect(
      areTensorsEqual(
        posMatMap.get('pendulum2'),
        frames.cart
          .getLocalPosMatrix(frames.cart.initialState[0])
          .matMul(
            frames.pendulum1.getLocalPosMatrix(
              frames.pendulum1.initialState[0],
            ),
          )
          .matMul(
            frames.pendulum2.getLocalPosMatrix(
              frames.pendulum2.initialState[0],
            ),
          ),
      ),
    ).toBe(true);
    expect(
      areTensorsEqual(
        posMatMap.get('ball'),
        frames.ball.getLocalPosMatrix(frames.ball.initialState[0]),
      ),
    ).toBe(true);
  });

  const invPosMatMap = checkTfMemory(() => solver._getInvPosMatMap(posMatMap));

  test('._getInvPosMatMap method', () => {
    expect([...invPosMatMap.keys()]).toEqual(Object.keys(frames));
    expect(
      areTensorsEqual(
        invPosMatMap.get('cart'),
        getTranslationMatrix([-frames.cart.initialState[0], 0]),
      ),
    ).toBe(true);
    expect(
      areTensorsEqual(
        invPosMatMap.get('ball'),
        invertXformMatrix(
          frames.ball.getLocalPosMatrix(frames.ball.initialState[0]),
        ),
      ),
    ).toBe(true);
  });

  const velMatMap = checkTfMemory(() =>
    solver._getVelMatMap(posMatMap, invPosMatMap, stateMap),
  );

  test('._getVelMatMap method', () => {
    expect([...velMatMap.keys()]).toEqual(Object.keys(frames));
    expect(
      areTensorsEqual(
        velMatMap.get('cart'),
        frames.cart
          .getLocalVelMatrix(stateMap.get('cart')[0])
          .matMul(invPosMatMap.get('cart')),
      ),
    ).toBe(true);
    expect(
      areTensorsEqual(
        velMatMap.get('pendulum1'),
        posMatMap
          .get('cart')
          .matMul(
            frames.pendulum1.getLocalVelMatrix(stateMap.get('pendulum1')[0]),
          )
          .matMul(invPosMatMap.get('pendulum1')),
      ),
    ).toBe(true);
    expect(
      areTensorsEqual(
        velMatMap.get('pendulum2'),
        posMatMap
          .get('pendulum1')
          .matMul(
            frames.pendulum2.getLocalVelMatrix(stateMap.get('pendulum2')[0]),
          )
          .matMul(invPosMatMap.get('pendulum2')),
      ),
    ).toBe(true);
  });

  const accelMatMap = checkTfMemory(() =>
    solver._getAccelMatMap(posMatMap, invPosMatMap, stateMap),
  );

  test('._getAccelMatMap method', () => {
    expect([...accelMatMap.keys()]).toEqual(Object.keys(frames));
    expect(
      areTensorsEqual(
        accelMatMap.get('cart'),
        frames.cart
          .getLocalAccelMatrix(stateMap.get('cart')[0])
          .matMul(invPosMatMap.get('cart')),
      ),
    ).toBe(true);
    expect(
      areTensorsEqual(
        accelMatMap.get('pendulum1'),
        posMatMap
          .get('cart')
          .matMul(
            frames.pendulum1.getLocalAccelMatrix(stateMap.get('pendulum1')[0]),
          )
          .matMul(invPosMatMap.get('pendulum1')),
      ),
    ).toBe(true);
    expect(
      areTensorsEqual(
        accelMatMap.get('pendulum2'),
        posMatMap
          .get('pendulum1')
          .matMul(
            frames.pendulum2.getLocalAccelMatrix(stateMap.get('pendulum2')[0]),
          )
          .matMul(invPosMatMap.get('pendulum2')),
      ),
    ).toBe(true);
  });

  const velSumMatMap = checkTfMemory(() =>
    solver._getVelSumMatMap(posMatMap, velMatMap, stateMap),
  );

  test('._getVelSumMatMap method', () => {
    expect([...velSumMatMap.keys()]).toEqual(Object.keys(frames));
    // TODO: assert on velSumMatMap values.
  });

  const accelSumMatMap = checkTfMemory(() =>
    solver._getAccelSumMatMap(
      posMatMap,
      velMatMap,
      accelMatMap,
      velSumMatMap,
      stateMap,
    ),
  );

  test('._getAccelSumMatMap method', () => {
    expect([...accelSumMatMap.keys()]).toEqual(Object.keys(frames));
    // TODO: assert on accelSumMatMap values.
  });

  const weightPosMap = checkTfMemory(() => solver._getWeightPosMap(posMatMap));

  test('._getWeightPosMap method', () => {
    expect([...weightPosMap.keys()]).toEqual(Object.keys(frames));
    expect(weightPosMap.get('cart').length).toBe(frames.cart.weights.length);
    expect(weightPosMap.get('pendulum1').length).toBe(
      frames.pendulum1.weights.length,
    );
    expect(weightPosMap.get('pendulum2').length).toBe(
      frames.pendulum2.weights.length,
    );
    expect([...weightPosMap.get('cart')[0].dataSync()]).toEqual([
      frames.cart.initialState[0] +
        frames.cart.weights[0].position.dataSync()[0],
      frames.cart.weights[0].position.dataSync()[1],
      1,
    ]);
    expect([...weightPosMap.get('cart')[1].dataSync()]).toEqual([
      frames.cart.initialState[0] +
        frames.cart.weights[1].position.dataSync()[0],
      frames.cart.weights[1].position.dataSync()[1],
      1,
    ]);
    // TODO: assert on other weightPosMap values.
  });

  test('._isFrameDescendent method', () => {
    expect(solver._isFrameDescendent(frames.cart, frames.cart)).toBe(true);
    expect(solver._isFrameDescendent(frames.cart, frames.pendulum1)).toBe(
      false,
    );
    expect(solver._isFrameDescendent(frames.pendulum1, frames.cart)).toBe(true);
    expect(solver._isFrameDescendent(frames.pendulum1, frames.pendulum2)).toBe(
      false,
    );
  });

  test('._getDescendentFrame method', () => {
    expect(solver._getDescendentFrame(frames.cart, frames.cart).id).toBe(
      frames.cart.id,
    );
    expect(solver._getDescendentFrame(frames.cart, frames.pendulum1).id).toBe(
      frames.pendulum1.id,
    );
    expect(solver._getDescendentFrame(frames.pendulum1, frames.cart).id).toBe(
      frames.pendulum1.id,
    );
    expect(solver._getDescendentFrame(frames.cart, frames.ball)).toBe(null);
  });

  test('._getDescendentFrames method', () => {
    const getIds = (frames) => frames.map((frame) => frame.id);
    expect(getIds(solver._getDescendentFrames(frames.cart))).toEqual([
      'cart',
      'pendulum1',
      'pendulum2',
    ]);
    expect(getIds(solver._getDescendentFrames(frames.pendulum1))).toEqual([
      'pendulum1',
      'pendulum2',
    ]);
    expect(getIds(solver._getDescendentFrames(frames.pendulum2))).toEqual([
      'pendulum2',
    ]);
    expect(getIds(solver._getDescendentFrames(frames.ball))).toEqual(['ball']);
  });

  test('._getCoefficientMatrixEntry method', () => {
    const getCoefficient = (rowIndex, colIndex) =>
      checkTfMemory(() =>
        solver._getCoefficientMatrixEntry(
          rowIndex,
          colIndex,
          velMatMap,
          weightPosMap,
        ),
      );
    const getNorm = (vector) => vector.matMul(vector, true).dataSync()[0];
    expect(getCoefficient(frameIndexes.ball, frameIndexes.cart)).toEqual(0);
    expect(getCoefficient(frameIndexes.cart, frameIndexes.ball)).toEqual(0);
    expect(getCoefficient(frameIndexes.ball, frameIndexes.ball)).toEqual(
      frames.ball.weights[0].mass *
        getNorm(
          velMatMap
            .get(frames.ball.id)
            .matMul(weightPosMap.get(frames.ball.id)[0]),
        ),
    );
    const cartDescendentFrameIds = ['cart', 'pendulum1', 'pendulum2'];
    cartDescendentFrameIds.forEach((frameId1, index1) => {
      cartDescendentFrameIds.slice(index1).forEach((frameId2, index2) => {
        const coefficient1 = getCoefficient(
          frameIndexes[frameId1],
          frameIndexes[frameId2],
        );
        const coefficient2 = getCoefficient(
          frameIndexes[frameId2],
          frameIndexes[frameId1],
        );
        expect(coefficient1).not.toBeCloseTo(0);
        expect(coefficient1).toEqual(coefficient2);
      });
    });
  });

  test('._getCoefficientMatrix method', () => {
    const getCoefficient = (rowIndex, colIndex) =>
      solver._getCoefficientMatrixEntry(
        rowIndex,
        colIndex,
        velMatMap,
        weightPosMap,
      );
    const coefficientMatrix = checkTfMemory(() =>
      solver._getCoefficientMatrix(velMatMap, weightPosMap),
    );
    expect(coefficientMatrix.shape).toEqual([numFrames, numFrames]);
    const data = coefficientMatrix.arraySync();
    scene.sortedFrames.forEach((_, rowIndex) => {
      scene.sortedFrames.forEach((_, colIndex) => {
        expect(data[rowIndex][colIndex]).toBeCloseTo(
          getCoefficient(rowIndex, colIndex),
        );
      });
    });
  });

  test('._getForceVectorEntry method', () => {
    scene.sortedFrames.forEach((frame) => {
      const entry = checkTfMemory(() =>
        solver._getForceVectorEntry(
          frame,
          velMatMap,
          velSumMatMap,
          accelSumMatMap,
          weightPosMap,
          stateMap,
          externalForceMap,
        ),
      );
      expect(entry).not.toBeNaN();
      expect(entry).not.toBeCloseTo(0);
    });
    // TODO: add more assertions.
  });

  test('._getForceVector method', () => {
    const getEntry = (frame) =>
      solver._getForceVectorEntry(
        frame,
        velMatMap,
        velSumMatMap,
        accelSumMatMap,
        weightPosMap,
        stateMap,
        externalForceMap,
      );
    const forceVector = checkTfMemory(() =>
      solver._getForceVector(
        velMatMap,
        velSumMatMap,
        accelSumMatMap,
        weightPosMap,
        stateMap,
        externalForceMap,
      ),
    );
    expect(forceVector.shape).toEqual([numFrames, 1]);
    const data = forceVector.dataSync();
    scene.sortedFrames.forEach((frame, index) => {
      expect(data[index]).toBeCloseTo(getEntry(frame));
    });
  });

  test('._getSystemOfEquations method', () => {
    const [aMat, bVec] = checkTfMemory(() =>
      solver._getSystemOfEquations(stateMap, externalForceMap),
    );
    expect(aMat.shape).toEqual([numFrames, numFrames]);
    expect(bVec.shape).toEqual([numFrames, 1]);
  });
});

describe('Solver cross-validation', () => {
  async function loadRsWasmModule() {
    // TODO: find a better way to load physm-rs.
    return await import('../../physm-rs/nodepkg/physm_rs.js');
  }

  const solverInfos = [
    {
      name: 'JsSolver with rungeKutta=false',
      createSolver: () => new JsSolver(scene, { rungeKutta: false }),
    },
    // {
    //   name: 'JsSolver with rungeKutta=true',
    //   createSolver: () => new JsSolver(scene, { rungeKutta: true }),
    // },
    {
      name: 'RsSolver with rungeKutta=false',
      createSolver: async () => new RsSolver(scene, await loadRsWasmModule()),
    },
  ];

  const stateMaps = solverInfos.map(() => [initialStateMap]);

  solverInfos.forEach((solverInfo, solverIndex) => {
    test.only(solverInfo.name, async () => {
      console.log(scene.frames.map((frame) => frame.id));
      console.log(scene.sortedFrames.map((frame) => frame.id));
      const solver = await solverInfo.createSolver();
      const MAX_TIME_INDEX = 1;
      const DELTA_TIME = 1 / 60;
      let curStateMap = initialStateMap;
      for (let timeIndex = 0; timeIndex < MAX_TIME_INDEX; timeIndex++) {
        const newStateMap = checkTfMemory(() =>
          solver.tick(curStateMap, DELTA_TIME),
        );
        stateMaps[solverIndex].push(curStateMap);
        expect(curStateMap).not.toEqual(newStateMap);
        [...newStateMap].forEach(([frameId, [newQ, newQd]]) => {
          const [q, qd] = curStateMap.get(frameId);
          expect(newQ).not.toBeNaN();
          expect(newQd).not.toBeNaN();
          timeIndex < 60 && expect(newQ).not.toBeCloseTo(q);
          timeIndex < 15 && expect(newQd).not.toBeCloseTo(qd);
          if (frameId == 'ball' || timeIndex >= 10) {
            // The ball accelerates quickly; skip the following expectations.
          } else {
            expect(Math.abs(newQ - q)).toBeLessThan(1);
            expect(Math.abs(newQd - qd)).toBeLessThan(1);
          }
        });
        curStateMap = newStateMap;
      }
    });
  });

  const solver1Index = 0;
  const solver1Info = solverInfos[solver1Index];
  solverInfos.slice(1).forEach((solver2Info, solver2Index) => {
    test(`Cross-validation: ${solver1Info.name} vs ${solver2Info.name}`, () => {
      const stateMaps1 = stateMaps[solver1Index];
      const stateMaps2 = stateMaps[solver2Index];
      expect(stateMaps1.length).toEqual(stateMaps2.length);
      //console.log(stateMaps1);
      //console.log(stateMaps2);
      for (let timeIndex = 0; timeIndex < stateMaps1.length; timeIndex++) {
        const stateMap1 = stateMaps1[timeIndex];
        const stateMap2 = stateMaps2[timeIndex];
        if (true) {
          // (enable for debugging)
          const delta = new Map(
            [...stateMap1].map(([frameId, [q1, qd1]]) => {
              const [q2, qd2] = stateMap2.get(frameId);
              return [frameId, [q2 - q1, qd2 - qd1]];
            }),
          );
          console.log(`==== Time index ${timeIndex} =====`);
          console.log('stateMap1:', stateMap1);
          console.log('stateMap2:', stateMap2);
          console.log('delta:', delta);
        }
        expect(Object.keys(stateMap1)).toEqual(Object.keys(stateMap2));
        scene.sortedFrames.forEach((frame) => {
          const [q1, qd1] = stateMap1.get(frame.id);
          const [q2, qd2] = stateMap2.get(frame.id);
          expect(Math.abs(q2 - q1)).toBeLessThan(1);
          expect(Math.abs(qd2 - qd1)).toBeLessThan(1);
        });
      }
    });
  });
});
