import JsSolver from './JsSolver';
import RotationalFrame from './RotationalFrame';
import RsSolver from './RsSolver';
import Scene from './Scene';
import TrackFrame from './TrackFrame';
import Weight from './Weight';
import { checkTfMemory } from './testutils';

describe('Solver subclass cross-validation', () => {
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
  const frames = {
    ball: scene.frameMap.get('ball'),
    cart: scene.frameMap.get('cart'),
    pendulum1: scene.frameMap.get('pendulum1'),
    pendulum2: scene.frameMap.get('pendulum2'),
  };
  const initialStateMap = scene.getInitialStateMap();

  async function loadRsWasmModule() {
    // TODO: find a better way to load physm-rs.
    return await import('../../physm-rs/nodepkg/physm_rs.js');
  }

  const solverInfos = [
    {
      name: 'JsSolver with rungeKutta=false',
      createSolver: () => new JsSolver(scene, { rungeKutta: false }),
    },
    {
      name: 'JsSolver with rungeKutta=true',
      createSolver: () => new JsSolver(scene, { rungeKutta: true }),
    },
    {
      name: 'RsSolver with rungeKutta=false',
      createSolver: async () =>
        new RsSolver(scene, await loadRsWasmModule(), { rungeKutta: false }),
    },
    {
      name: 'RsSolver with rungeKutta=true',
      createSolver: async () =>
        new RsSolver(scene, await loadRsWasmModule(), { rungeKutta: true }),
    },
  ];

  const stateMaps = solverInfos.map(() => [initialStateMap]);

  solverInfos.forEach((solverInfo, solverIndex) => {
    test(solverInfo.name, async () => {
      const solver = await solverInfo.createSolver();
      const MAX_TIME_INDEX = 50;
      const DELTA_TIME = 1 / 60;
      let curStateMap = initialStateMap;
      for (let timeIndex = 0; timeIndex < MAX_TIME_INDEX; timeIndex++) {
        const newStateMap = checkTfMemory(() => {
          solver.tick(DELTA_TIME);
          return solver.getStateMap();
        });
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
    solver2Index++;
    test(`Cross-validation: ${solver1Info.name} vs ${solver2Info.name}`, () => {
      const stateMaps1 = stateMaps[solver1Index];
      const stateMaps2 = stateMaps[solver2Index];
      expect(stateMaps1.length).toEqual(stateMaps2.length);
      //console.log(stateMaps1);
      //console.log(stateMaps2);
      for (let timeIndex = 0; timeIndex < stateMaps1.length; timeIndex++) {
        const stateMap1 = stateMaps1[timeIndex];
        const stateMap2 = stateMaps2[timeIndex];
        const debug = false; // (enable for debugging)
        if (debug) {
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
          expect(Math.abs(q2 - q1)).toBeLessThan(0.2);
          expect(Math.abs(qd2 - qd1)).toBeLessThan(0.2);
        });
      }
    });
  });
});
