import * as tf from './tfjs';
import faker from 'faker';
import Frame from './Frame';
import RotationalFrame from './RotationalFrame';
import Scene from './Scene';
import Solver from './Solver';
import TrackFrame from './TrackFrame';
import Weight from './Weight';
import { areTensorsEqual } from './utils';
import { getRotationTranslationMatrix } from './utils';
import { getTranslationMatrix } from './utils';

describe('Solver', () => {
  const scene = new Scene({
    frames: [
      new TrackFrame({
        id: 'cart',
        initialState: [5, 1],
        frames: [
          new RotationalFrame({
            id: 'pendulum1',
            initialState: [0.3, -1.2],
            frames: [
              new RotationalFrame({
                id: 'pendulum2',
                initialState: [-0.5, 1.5],
                position: [10, 0],
                weights: [new Weight(6)],
              }),
            ],
            weights: [new Weight(5)],
          }),
        ],
        weights: [new Weight(20), new Weight(3, { position: [0, 5] })],
      }),
    ],
  });
  const frames = {
    cart: scene.frameMap.get('cart'),
    pendulum1: scene.frameMap.get('pendulum1'),
    pendulum2: scene.frameMap.get('pendulum2'),
  };
  const stateMap = scene.getInitialStateMap();
  const solver = new Solver(scene);

  it('._makeStateMap method', () => {
    const states = scene.sortedFrames.map((frame) => frame.initialState);
    const qs = states.map(([q]) => q);
    const qds = states.map(([, qd]) => qd);
    expect(solver._makeStateMap(qs, qds)).toEqual(stateMap);
  });

  it('._getPosMatMap method', () => {
    const posMatMap = solver._getPosMatMap(stateMap);
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
          .getPosMatrix(frames.cart.initialState[0])
          .matMul(
            frames.pendulum1.getPosMatrix(frames.pendulum1.initialState[0]),
          )
          .matMul(
            frames.pendulum2.getPosMatrix(frames.pendulum2.initialState[0]),
          ),
      ),
    ).toBe(true);
  });

  it('._getInvPosMatMap method', () => {
    const posMatMap = solver._getPosMatMap(stateMap);
    const invPosMatMap = solver._getInvPosMatMap(posMatMap);
    expect([...invPosMatMap.keys()]).toEqual(Object.keys(frames));
    expect(
      areTensorsEqual(
        invPosMatMap.get('cart'),
        getTranslationMatrix([-frames.cart.initialState[0], 0]),
      ),
    ).toBe(true);
  });

  it('._getVelMatMap method', () => {
    const posMatMap = solver._getPosMatMap(stateMap);
    const invPosMatMap = solver._getInvPosMatMap(posMatMap);
    const velMatMap = solver._getVelMatMap(posMatMap, invPosMatMap, stateMap);
    expect([...velMatMap.keys()]).toEqual(Object.keys(frames));
    expect(
      areTensorsEqual(
        velMatMap.get('cart'),
        frames.cart
          .getVelMatrix(stateMap.get('cart')[0])
          .matMul(invPosMatMap.get('cart')),
      ),
    ).toBe(true);
    expect(
      areTensorsEqual(
        velMatMap.get('pendulum1'),
        posMatMap
          .get('cart')
          .matMul(frames.pendulum1.getVelMatrix(stateMap.get('pendulum1')[0]))
          .matMul(invPosMatMap.get('pendulum1')),
      ),
    ).toBe(true);
    expect(
      areTensorsEqual(
        velMatMap.get('pendulum2'),
        posMatMap
          .get('pendulum1')
          .matMul(frames.pendulum2.getVelMatrix(stateMap.get('pendulum2')[0]))
          .matMul(invPosMatMap.get('pendulum2')),
      ),
    ).toBe(true);
  });

  it('._getAccelMatMap method', () => {
    const posMatMap = solver._getPosMatMap(stateMap);
    const invPosMatMap = solver._getInvPosMatMap(posMatMap);
    const accelMatMap = solver._getAccelMatMap(
      posMatMap,
      invPosMatMap,
      stateMap,
    );
    expect([...accelMatMap.keys()]).toEqual(Object.keys(frames));
    expect(
      areTensorsEqual(
        accelMatMap.get('cart'),
        frames.cart
          .getAccelMatrix(stateMap.get('cart')[0])
          .matMul(invPosMatMap.get('cart')),
      ),
    ).toBe(true);
    expect(
      areTensorsEqual(
        accelMatMap.get('pendulum1'),
        posMatMap
          .get('cart')
          .matMul(frames.pendulum1.getAccelMatrix(stateMap.get('pendulum1')[0]))
          .matMul(invPosMatMap.get('pendulum1')),
      ),
    ).toBe(true);
    expect(
      areTensorsEqual(
        accelMatMap.get('pendulum2'),
        posMatMap
          .get('pendulum1')
          .matMul(frames.pendulum2.getAccelMatrix(stateMap.get('pendulum2')[0]))
          .matMul(invPosMatMap.get('pendulum2')),
      ),
    ).toBe(true);
  });

  it('._getVelSumMatMap method', () => {
    const posMatMap = solver._getPosMatMap(stateMap);
    const invPosMatMap = solver._getInvPosMatMap(posMatMap);
    const velMatMap = solver._getVelMatMap(posMatMap, invPosMatMap, stateMap);
    const velSumMatMap = solver._getVelSumMatMap(
      posMatMap,
      velMatMap,
      stateMap,
    );
    expect([...velSumMatMap.keys()]).toEqual(Object.keys(frames));
    // TODO: assert on velSumMatMap values.
  });

  it('._getAccelSumMatMap method', () => {
    const posMatMap = solver._getPosMatMap(stateMap);
    const invPosMatMap = solver._getInvPosMatMap(posMatMap);
    const velMatMap = solver._getVelMatMap(posMatMap, invPosMatMap, stateMap);
    const accelMatMap = solver._getAccelMatMap(
      posMatMap,
      invPosMatMap,
      stateMap,
    );
    const velSumMatMap = solver._getVelSumMatMap(
      posMatMap,
      velMatMap,
      stateMap,
    );
    const accelSumMatMap = solver._getAccelSumMatMap(
      posMatMap,
      velMatMap,
      accelMatMap,
      velSumMatMap,
      stateMap,
    );
    expect([...accelSumMatMap.keys()]).toEqual(Object.keys(frames));
    // TODO: assert on accelSumMatMap values.
  });

  it('._getWeightPosMap method', () => {
    const posMatMap = solver._getPosMatMap(stateMap);
    const weightPosMap = solver._getWeightPosMap(posMatMap);
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

  it('._getWeightVelMap method', () => {
    const posMatMap = solver._getPosMatMap(stateMap);
    const invPosMatMap = solver._getInvPosMatMap(posMatMap);
    const velMatMap = solver._getVelMatMap(posMatMap, invPosMatMap, stateMap);
    const velSumMatMap = solver._getVelSumMatMap(
      posMatMap,
      velMatMap,
      stateMap,
    );
    const weightPosMap = solver._getWeightPosMap(posMatMap);
    const weightVelMap = solver._getWeightVelMap(velSumMatMap, weightPosMap);
    expect([...weightVelMap.keys()]).toEqual(Object.keys(frames));
    expect(weightVelMap.get('cart').length).toBe(frames.cart.weights.length);
    expect(weightVelMap.get('pendulum1').length).toBe(
      frames.pendulum1.weights.length,
    );
    expect(weightVelMap.get('pendulum2').length).toBe(
      frames.pendulum2.weights.length,
    );
    expect([...weightVelMap.get('cart')[0].dataSync()]).toEqual([1, 0, 0]);
    expect([...weightVelMap.get('cart')[1].dataSync()]).toEqual([1, 0, 0]);
    // TODO: assert on other weightVelMap values.
  });
});
